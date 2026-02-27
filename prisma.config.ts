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
    url: env('DATABASE_URL'),
  },
});
