import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  hashPin,
  pinLookup,
  prisma,
  verifyPin,
} from '@shift-happens/db';
import { pinLogin, resetPinThrottle } from '../src/services/auth-engine.js';
import {
  createStaffMember,
  updateStaffMember,
} from '../src/services/staff-engine.js';

/**
 * Staff credentials must never be stored in plaintext, must never share a PIN,
 * and a duplicated legacy PIN must fail closed rather than sign someone in as
 * the wrong employee.
 */
describe('staff PIN handling', () => {
  const restaurantId = randomUUID();

  beforeAll(async () => {
    await prisma.restaurant.create({
      data: {
        id: restaurantId,
        name: 'Vitest PIN Tenant',
        address: 'PIN St',
        phone: '+1 555-0199',
      },
    });
    resetPinThrottle();
  });

  afterAll(async () => {
    await prisma.restaurant
      .delete({ where: { id: restaurantId } })
      .catch(() => undefined);
  });

  it('hashes a PIN on create and never stores plaintext', async () => {
    const member = await createStaffMember(
      { name: 'Hashed Server', role: 'server', pin: '4321' },
      restaurantId,
    );

    const row = await prisma.staff.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(row.pin).toBeNull();
    expect(row.pinHash).not.toBeNull();
    expect(verifyPin('4321', row.pinHash)).toBe(true);
    expect(JSON.stringify(member)).not.toContain('4321');
  });

  it('rejects a PIN already assigned to another active employee', async () => {
    await expect(
      createStaffMember(
        { name: 'Duplicate Server', role: 'server', pin: '4321' },
        restaurantId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('leaves a member without a PIN unable to sign in', async () => {
    const member = await createStaffMember(
      { name: 'No PIN Yet', role: 'server' },
      restaurantId,
    );
    const row = await prisma.staff.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(row.pin).toBeNull();
    expect(row.pinHash).toBeNull();
    // No PIN material means no PIN can match this member.
    await expect(pinLogin('0000', { restaurantId })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rehashes a changed PIN', async () => {
    const target = await createStaffMember(
      { name: 'Rotating PIN', role: 'server', pin: '9876' },
      restaurantId,
    );

    await updateStaffMember(target.id, { pin: '8765' }, restaurantId);
    const row = await prisma.staff.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(verifyPin('8765', row.pinHash)).toBe(true);
    expect(verifyPin('9876', row.pinHash)).toBe(false);
    expect(verifyPin('4321', row.pinHash)).toBe(false);
  });

  it('fails closed when legacy data contains a duplicated PIN', async () => {
    await prisma.staff.createMany({
      data: [
        {
          restaurantId,
          name: 'Legacy One',
          role: 'server',
          pin: '1111',
          hourlyRate: 18,
        },
        {
          restaurantId,
          name: 'Legacy Two',
          role: 'server',
          pin: '1111',
          hourlyRate: 18,
        },
      ],
    });

    resetPinThrottle();
    await expect(pinLogin('1111', { restaurantId })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('signs in an active employee whose index is held by a stale duplicate', async () => {
    const lookup = pinLookup('2468', restaurantId);
    await prisma.staff.createMany({
      data: [
        {
          restaurantId,
          name: 'Stale Index Holder',
          role: 'server',
          pinHash: hashPin('2468'),
          pinLookup: lookup,
          isActive: false,
          hourlyRate: 18,
        },
        {
          restaurantId,
          name: 'Active Duplicate',
          role: 'server',
          pin: '2468',
          hourlyRate: 18,
        },
      ],
    });

    resetPinThrottle();
    const session = await pinLogin('2468', { restaurantId });
    expect(session.token.length).toBeGreaterThan(20);
    expect(session.staff.name).toBe('Active Duplicate');
  });
});
