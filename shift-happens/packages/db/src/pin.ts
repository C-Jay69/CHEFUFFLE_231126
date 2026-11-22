import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * PIN hashing shared by the API, the seed and the migration backfill.
 *
 * Format: scrypt$N$r$p$salt(base64url)$hash(base64url)
 * No external dependency; Node's scrypt is deliberately memory-hard.
 */

const KEY_LENGTH = 64;
const N = 16_384;
const R = 8;
const P = 1;

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

/**
 * Deterministic per-restaurant lookup digest. This makes PIN login a single
 * indexed row read instead of an O(staff) scrypt scan; the salted scrypt hash
 * is still what verifies the PIN. Keep PIN_PEPPER out of the database.
 */
const LOOKUP_PEPPER = process.env.PIN_PEPPER || 'chefuffle-pin-lookup-v1';

export function pinLookup(pin: string, restaurantId: string): string {
  return createHmac('sha256', LOOKUP_PEPPER)
    .update(`${restaurantId}:${pin}`)
    .digest('hex');
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(pin, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
