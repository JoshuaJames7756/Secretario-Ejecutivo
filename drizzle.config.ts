import { defineConfig } from 'drizzle-kit';

// Genera las migraciones SQL versionadas de D1 a partir de worker/db/schema.ts.
export default defineConfig({
  dialect: 'sqlite',
  schema: './worker/db/schema.ts',
  out: './migrations',
});
