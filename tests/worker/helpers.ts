import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import type { PushOp } from '../../shared/contract';
import type { Env } from '../../worker/env';

export const OWNER = 'user_owner';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const b64 = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** Firma un JWT RS256 como lo haría Clerk. */
export function signToken(claims: Record<string, unknown> = {}, key = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' }));
  const body = b64(
    JSON.stringify({ sub: OWNER, iat: now - 5, nbf: now - 5, exp: now + 300, ...claims }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(key);
  return `${header}.${body}.${b64(signature)}`;
}

export const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

/** D1 local y limpio, con las migraciones reales aplicadas. */
export async function createTestEnv() {
  const config = join(import.meta.dirname, 'wrangler.test.jsonc');
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: config, persist: false });
  const sql = readFileSync(join(import.meta.dirname, '../../migrations/0000_init.sql'), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await proxy.env.DB.prepare(statement.trim()).run();
  }
  const env: Env = { DB: proxy.env.DB, CLERK_JWT_KEY: PUBLIC_PEM, OWNER_USER_ID: OWNER };
  return { env, dispose: proxy.dispose };
}

export function makeOp(over: Partial<PushOp> & { id?: string; rev?: number } = {}): PushOp {
  const id = over.id ?? 'rec-1';
  const rev = over.rev ?? 1;
  return {
    opId: over.opId ?? `op-${id}-${rev}`,
    entity: over.entity ?? 'records',
    entityId: over.entityId ?? id,
    op: over.op ?? 'upsert',
    expectedRev: over.expectedRev ?? 0,
    doc: over.doc ?? { id, rev, createdAt: 1, updatedAt: 2, content: `texto ${rev}` },
  };
}
