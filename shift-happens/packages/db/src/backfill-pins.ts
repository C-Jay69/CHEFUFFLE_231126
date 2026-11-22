/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPin, pinLookup } from './pin.js';

/**
 * One-shot, idempotent backfill for the PIN migration window.
 *
 * Every staff row that still carries a legacy plaintext `pin` gets a scrypt
 * `pinHash`; the plaintext column is then cleared. Rows that already have a
 * `pinHash` keep it and only have the legacy value removed. The script never
 * prints PINs.
 *
 *   pnpm --filter @shift-happens/db backfill:pins
 *   pnpm db:backfill:pins -- --dry-run
 */

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const staffWithLegacyPin = await prisma.staff.findMany({
    where: { pin: { not: null } },
    select: {
      id: true,
      name: true,
      pin: true,
      pinHash: true,
      restaurantId: true,
    },
    orderBy: { name: 'asc' },
  });

  if (staffWithLegacyPin.length === 0) {
    console.log('✓ PIN backfill complete — no legacy plaintext PINs remain.');
    return;
  }

  let hashed = 0;
  let clearedOnly = 0;
  let skippedEmpty = 0;
  let duplicates = 0;
  const seen = new Map<string, string>();


  for (const member of staffWithLegacyPin) {
    const legacyPin = member.pin?.trim() ?? '';
    if (legacyPin.length === 0) {
      skippedEmpty += 1;
      console.warn(`! ${member.name}: legacy PIN is blank — left untouched.`);
      continue;
    }

    const alreadyHashed = Boolean(member.pinHash);
    const pinHash = alreadyHashed ? member.pinHash : hashPin(legacyPin);
    const lookup = pinLookup(legacyPin, member.restaurantId);
    const key = `${member.restaurantId}:${lookup}`;

    // A duplicate PIN cannot be indexed: login must fail closed rather than
    // pick an arbitrary employee. Keep the hash, leave the lookup null.
    const indexedElsewhere =
      seen.has(key) ||
      Boolean(
        await prisma.staff.findFirst({
          where: {
            restaurantId: member.restaurantId,
            pinLookup: lookup,
            id: { not: member.id },
          },
          select: { id: true },
        }),
      );
    if (!indexedElsewhere) seen.set(key, member.name);
    const duplicate = indexedElsewhere;

    if (dryRun) {
      console.log(
        `${duplicate ? '!' : alreadyHashed ? '→' : '✎'} ${member.name}: would ${
          duplicate
            ? 'hash PIN but leave it unindexed (duplicate)'
            : alreadyHashed
              ? 'clear legacy PIN'
              : 'hash PIN and clear legacy PIN'
        }`,
      );
    } else {
      await prisma.staff.update({
        where: { id: member.id },
        data: {
          pinHash,
          pinLookup: duplicate ? null : lookup,
          pin: null,
        },
      });
      console.log(
        `${duplicate ? '!' : alreadyHashed ? '→' : '✎'} ${member.name}: ${
          duplicate
            ? 'hashed; duplicate PIN left unindexed (login fails closed)'
            : alreadyHashed
              ? 'cleared legacy PIN'
              : 'PIN hashed'
        }`,
      );
    }

    if (duplicate) duplicates += 1;
    else if (alreadyHashed) clearedOnly += 1;
    else hashed += 1;
  }

  console.log(
    `${dryRun ? 'Planned' : 'Completed'}: ${hashed} hashed, ${clearedOnly} already hashed (legacy value removed), ${duplicates} duplicate PINs left unindexed, ${skippedEmpty} skipped.`,
  );
}

main()
  .catch((error) => {
    console.error('✗ PIN backfill failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
