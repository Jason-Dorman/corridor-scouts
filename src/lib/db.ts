/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter — the datasource URL can no longer be
 * placed in schema.prisma or passed directly to the PrismaClient constructor.
 * We use @prisma/adapter-pg backed by a pg Pool.
 *
 * The globalThis pattern prevents connection pool exhaustion during Next.js
 * hot-reload in development (new module instance on every file change).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { requireEnv } from './env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Lazy getter — client is created on first access at runtime, not at module
// import time. This allows `next build` to import route modules without
// DATABASE_URL being present in the build environment.
function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
