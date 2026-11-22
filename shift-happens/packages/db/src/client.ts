import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the monorepo-root .env regardless of the workspace cwd.
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  resolve(here, '../../../.env'),
  resolve(here, '../.env'),
  resolve(process.cwd(), '.env'),
]) {
  config({ path: candidate });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';
