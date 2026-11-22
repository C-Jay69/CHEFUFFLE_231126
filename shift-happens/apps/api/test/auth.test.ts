import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPin, prisma, verifyPin } from '@shift-happens/db';
import { env } from '../src/env.js';
import {
  currentStaff,
  hashSessionToken,
  loadSessionByToken,
} from '../src/lib/staff-auth.js';
import {
  SESSION_TTL_MS,
  logoutSession,
  pinLogin,
  resetPinThrottle,
} from '../src/services/auth-engine.js';
import { buildApp } from '../src/index.js';

/**
 * Security contract for Wave 0:
 *   - deny by default on every /api route
 *   - real server-issued sessions (hash-at-rest, 12h expiry, revocable)
 *   - legacy plaintext PINs transparently upgraded
 *   - no PIN material ever leaves the API
 *   - failed PIN attempts are throttled
 */

const restaurantId = randomUUID();
const hashedStaffId = randomUUID();
const legacyStaffId = randomUUID();
const inactiveStaffId = randomUUID();
const httpStaffId = randomUUID();

const STAFF_PIN = '4821';
const LEGACY_PIN = '739205';
const INACTIVE_PIN = '8642';
const HTTP_PIN = '551234';

let app: FastifyInstance;
let createdEnvRestaurant = false;

function requestWithToken(token?: string): FastifyRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as FastifyRequest;
}

async function cleanupRestaurant(id: string) {
  await prisma.auditLog.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.session.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.staff.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.restaurant.deleteMany({ where: { id } }).catch(() => undefined);
}

beforeAll(async () => {
  await cleanupRestaurant(restaurantId);

  await prisma.restaurant.create({
    data: {
      id: restaurantId,
      name: 'Vitest Auth Tenant',
      address: 'Test Pass',
      phone: '+1 555-0100',
    },
  });

  await prisma.staff.createMany({
    data: [
      {
        id: hashedStaffId,
        restaurantId,
        name: 'Hashed PIN Server',
        role: 'server',
        pinHash: hashPin(STAFF_PIN),
      },
      {
        id: legacyStaffId,
        restaurantId,
        name: 'Legacy PIN Host',
        role: 'host',
        pin: LEGACY_PIN,
      },
      {
        id: inactiveStaffId,
        restaurantId,
        name: 'Inactive PIN Cook',
        role: 'line_cook',
        pinHash: hashPin(INACTIVE_PIN),
        isActive: false,
      },
    ],
  });

  // HTTP tests hit `/api/auth/pin`, which uses the configured single tenant.
  const envTenant = await prisma.restaurant.findUnique({
    where: { id: env.RESTAURANT_ID },
    select: { id: true },
  });
  if (!envTenant) {
    createdEnvRestaurant = true;
    await prisma.restaurant.create({
      data: {
        id: env.RESTAURANT_ID,
        name: 'Vitest Auth HTTP Tenant',
        address: 'HTTP Pass',
        phone: '+1 555-0101',
      },
    });
  }
  await prisma.staff.create({
    data: {
      id: httpStaffId,
      restaurantId: env.RESTAURANT_ID,
      name: 'HTTP PIN Manager',
      role: 'general_manager',
      pinHash: hashPin(HTTP_PIN),
    },
  });

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await cleanupRestaurant(restaurantId);

  await prisma.auditLog
    .deleteMany({ where: { actorStaffId: httpStaffId } })
    .catch(() => undefined);
  await prisma.staff
    .delete({ where: { id: httpStaffId } })
    .catch(() => undefined);
  if (createdEnvRestaurant) {
    await cleanupRestaurant(env.RESTAURANT_ID);
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  resetPinThrottle();
});

describe('deny by default', () => {
  it('rejects an /api route without a token but keeps /api/health public', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/orders' });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error).toMatch(/authentication required/i);

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  it('does not trust a removed x-staff-id header', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: '/api/orders',
      headers: { 'x-staff-id': hashedStaffId },
    });
    expect(denied.statusCode).toBe(401);
  });

  it('rejects a malformed or unknown bearer token', async () => {
    const malformed = await app.inject({
      method: 'GET',
      url: '/api/orders',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(malformed.statusCode).toBe(401);
  });
});

describe('PIN login and sessions', () => {
  it('issues an opaque session for the correct PIN and stores only its hash', async () => {
    const result = await pinLogin(STAFF_PIN, {
      restaurantId,
      ipAddress: '203.0.113.7',
    });

    expect(result.token.length).toBeGreaterThanOrEqual(40);
    expect(result.staff.id).toBe(hashedStaffId);
    expect(result.staff.role).toBe('server');
    expect(result.restaurantId).toBe(restaurantId);

    const stored = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(result.token) },
    });
    expect(stored).not.toBeNull();
    expect(stored?.staffId).toBe(hashedStaffId);
    expect(stored?.revokedAt).toBeNull();
    expect(stored?.tokenHash).not.toBe(result.token);

    const ttl = (stored?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(SESSION_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_MS + 60_000);

    const staff = await currentStaff(requestWithToken(result.token));
    expect(staff?.id).toBe(hashedStaffId);
    expect(staff?.role).toBe('server');
  });

  it('rejects a wrong PIN with 401', async () => {
    await expect(
      pinLogin('0000', { restaurantId, ipAddress: '203.0.113.8' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects non-digit and out-of-range PINs with 400', async () => {
    await expect(
      pinLogin('12ab', { restaurantId, ipAddress: '203.0.113.8' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      pinLogin('123', { restaurantId, ipAddress: '203.0.113.8' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      pinLogin('123456789', { restaurantId, ipAddress: '203.0.113.8' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('upgrades a matching legacy plaintext PIN to pinHash and nulls the legacy column', async () => {
    const before = await prisma.staff.findUniqueOrThrow({
      where: { id: legacyStaffId },
    });
    expect(before.pin).toBe(LEGACY_PIN);
    expect(before.pinHash).toBeNull();

    const result = await pinLogin(LEGACY_PIN, {
      restaurantId,
      ipAddress: '203.0.113.9',
    });
    expect(result.staff.id).toBe(legacyStaffId);

    const after = await prisma.staff.findUniqueOrThrow({
      where: { id: legacyStaffId },
    });
    expect(after.pin).toBeNull();
    expect(after.pinHash).toBeTruthy();
    expect(verifyPin(LEGACY_PIN, after.pinHash)).toBe(true);

    // The upgraded hash still works.
    const again = await pinLogin(LEGACY_PIN, {
      restaurantId,
      ipAddress: '203.0.113.9',
    });
    expect(again.staff.id).toBe(legacyStaffId);
  });

  it('locks an inactive staff member out', async () => {
    await expect(
      pinLogin(INACTIVE_PIN, { restaurantId, ipAddress: '203.0.113.11' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('never returns pin or pinHash in the login payload', async () => {
    const result = await pinLogin(STAFF_PIN, {
      restaurantId,
      ipAddress: '203.0.113.12',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/"pin"\s*:/);
    expect(serialized).not.toMatch(/"pinHash"\s*:/);
    expect(Object.keys(result.staff)).not.toContain('pin');
    expect(Object.keys(result.staff)).not.toContain('pinHash');
  });
});

describe('session lifecycle', () => {
  it('rejects an expired session', async () => {
    const login = await pinLogin(STAFF_PIN, {
      restaurantId,
      ipAddress: '203.0.113.13',
    });

    await prisma.session.update({
      where: { tokenHash: hashSessionToken(login.token) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await loadSessionByToken(login.token)).toBeNull();
    expect(await currentStaff(requestWithToken(login.token))).toBeNull();
  });

  it('rejects a session whose staff member was deactivated', async () => {
    const login = await pinLogin(STAFF_PIN, {
      restaurantId,
      ipAddress: '203.0.113.14',
    });
    await prisma.staff.update({
      where: { id: hashedStaffId },
      data: { isActive: false },
    });
    try {
      expect(await currentStaff(requestWithToken(login.token))).toBeNull();
    } finally {
      await prisma.staff.update({
        where: { id: hashedStaffId },
        data: { isActive: true },
      });
    }
  });

  it('revokes the session on logout and audits it', async () => {
    const login = await pinLogin(STAFF_PIN, {
      restaurantId,
      ipAddress: '203.0.113.15',
    });
    expect(await currentStaff(requestWithToken(login.token))).not.toBeNull();

    const revoked = await logoutSession(login.token, {
      ipAddress: '203.0.113.15',
    });
    expect(revoked).toBe(true);
    expect(await currentStaff(requestWithToken(login.token))).toBeNull();

    const stored = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(login.token) },
    });
    expect(stored?.revokedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        restaurantId,
        action: 'auth.logout',
        entity: 'auth',
        entityId: stored?.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorStaffId).toBe(hashedStaffId);
    expect(audit?.ipAddress).toBe('203.0.113.15');
  });

  it('throttles repeated failed attempts and locks the source', async () => {
    const ip = '198.51.100.9';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        pinLogin('0001', { restaurantId, ipAddress: ip }),
      ).rejects.toMatchObject({ statusCode: 401 });
    }

    // The next attempt — even with the correct PIN — is locked out.
    await expect(
      pinLogin(STAFF_PIN, { restaurantId, ipAddress: ip }),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('audits successful and failed logins without leaking the PIN', async () => {
    await pinLogin(STAFF_PIN, { restaurantId, ipAddress: '203.0.113.16' });
    await expect(
      pinLogin('0002', { restaurantId, ipAddress: '203.0.113.16' }),
    ).rejects.toMatchObject({ statusCode: 401 });

    const success = await prisma.auditLog.findFirst({
      where: {
        restaurantId,
        action: 'auth.login',
        actorStaffId: hashedStaffId,
      },
    });
    expect(success).not.toBeNull();

    const failure = await prisma.auditLog.findFirst({
      where: {
        restaurantId,
        action: 'auth.login_failed',
        reason: 'invalid_pin',
      },
    });
    expect(failure).not.toBeNull();
    expect(JSON.stringify(failure)).not.toContain(STAFF_PIN);
    expect(JSON.stringify(failure)).not.toContain('0002');
  });
});

describe('HTTP auth flow', () => {
  it('logs in, resolves /auth/me, and logs out', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/pin',
      payload: { pin: HTTP_PIN },
    });
    expect(login.statusCode).toBe(200);

    const body = login.json() as {
      token: string;
      staff: { id: string };
      restaurantId: string;
    };
    expect(typeof body.token).toBe('string');
    expect(body.staff.id).toBe(httpStaffId);
    expect(body.restaurantId).toBe(env.RESTAURANT_ID);
    expect(JSON.stringify(body)).not.toMatch(/"pin"\s*:/);
    expect(JSON.stringify(body)).not.toMatch(/"pinHash"\s*:/);

    const headers = { authorization: `Bearer ${body.token}` };

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers,
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().staff.id).toBe(httpStaffId);

    const roster = await app.inject({
      method: 'GET',
      url: '/api/auth/staff',
      headers,
    });
    expect(roster.statusCode).toBe(200);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers,
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json().revoked).toBe(true);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers,
    });
    expect(meAfter.statusCode).toBe(401);
  });
});
