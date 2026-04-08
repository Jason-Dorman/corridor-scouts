import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI does not auto-load .env.local — load it explicitly so that
// `prisma generate`, `prisma migrate dev`, etc. pick up local credentials.
config({ path: resolve(process.cwd(), '.env.local') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env is checked first so Docker / CI environment variables are
    // picked up directly. env() falls back to Prisma's own .env file loading
    // for local development where DATABASE_URL lives in .env.local.
    url: process.env.DATABASE_URL ?? env('DATABASE_URL'),
  },
});
