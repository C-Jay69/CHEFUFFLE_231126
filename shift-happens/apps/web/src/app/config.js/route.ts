/**
 * Runtime API configuration, read when the page loads rather than baked into
 * the build. Set PUBLIC_API_URL to:
 *   - "same-origin"  → call /api on the page's own origin (reverse proxy)
 *   - an absolute URL → call that API host (LAN IP, separate domain)
 *   - empty/unset     → auto: NEXT_PUBLIC_API_URL, else <hostname>:4000
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const value = process.env.PUBLIC_API_URL ?? '';
  return new Response(`window.__WHITEOUT_API_BASE__=${JSON.stringify(value)};`, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}
