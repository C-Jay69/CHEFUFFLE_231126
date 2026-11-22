declare global {
  interface Window {
    __CHEFUFFLE_API_BASE__?: string;
  }
}

/**
 * Resolved at runtime so a deployment can change its address without a rebuild:
 *   1. `/config.js` (PUBLIC_API_URL): "same-origin" or an absolute URL.
 *   2. NEXT_PUBLIC_API_URL at build time (legacy).
 *   3. Auto: same host on port 4000 (dev and LAN tablets).
 */
function resolveApiBase(): string {
  const runtime =
    typeof window !== 'undefined' ? window.__CHEFUFFLE_API_BASE__?.trim() : undefined;

  if (runtime === 'same-origin') {
    return typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:4000';
  }
  if (runtime) return runtime.replace(/\/$/, '');

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    const localHostname =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');
    const pointsAtLocalhost = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured);
    // A tablet loading the page over the LAN cannot reach the laptop's
    // localhost; use the page's own host on the API port instead.
    if (typeof window !== 'undefined' && pointsAtLocalhost && !localHostname) {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return configured.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

function currentStaffId(): string | null {
  try {
    const raw = localStorage.getItem('sh-staff');
    if (!raw) return null;
    const staff = JSON.parse(raw) as { id?: string };
    return staff?.id ?? null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const staffId = typeof window === 'undefined' ? null : currentStaffId();
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(staffId ? { 'x-staff-id': staffId } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) || `Request failed (${response.status})`;
    const details =
      payload && typeof payload === 'object' && 'details' in payload
        ? (payload as { details: unknown }).details
        : undefined;
    throw new ApiError(response.status, message, details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};

export async function rawRequest(path: string, options: RequestInit = {}) {
  const staffId = typeof window === 'undefined' ? null : currentStaffId();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(staffId ? { 'x-staff-id': staffId } : {}),
      ...((options.headers as Record<string, string> | undefined) ?? {}),
    },
  });
}
