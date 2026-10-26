import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../worker/index';
import type { Env } from '../../worker/env';
import type { PullResponse, PushOp, PushResponse } from '../../shared/contract';
import { createTestEnv, makeOp, otherKey, signToken } from './helpers';

let env: Env;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ env, dispose } = await createTestEnv());
});
afterAll(async () => dispose());
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM docs'),
    env.DB.prepare('DELETE FROM ops'),
    env.DB.prepare('DELETE FROM meta'),
  ]);
});

const call = (path: string, init: RequestInit = {}, token: string | null = signToken()) =>
  app.fetch(
    new Request(`https://x.test${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }),
    env,
  );

const push = async (ops: PushOp[], deviceId = 'dev-a') => {
  const res = await call('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({ deviceId, ops }),
  });
  return { status: res.status, body: (await res.json()) as PushResponse };
};
const pull = async (since = 0, limit = 100) => {
  const res = await call(`/api/sync/pull?since=${since}&limit=${limit}`);
  return (await res.json()) as PullResponse;
};

describe('autenticación', () => {
  it('health es público y no revela nada', async () => {
    const res = await call('/api/health', {}, null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sin token: 401', async () => {
    expect((await call('/api/sync/pull', {}, null)).status).toBe(401);
  });

  it('token firmado con otra clave: 401', async () => {
    expect((await call('/api/sync/pull', {}, signToken({}, otherKey))).status).toBe(401);
  });

  it('token caducado: 401', async () => {
    const expired = signToken({ exp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await call('/api/sync/pull', {}, expired)).status).toBe(401);
  });

  it('usuario válido que no es el dueño: 403', async () => {
    expect((await call('/api/sync/pull', {}, signToken({ sub: 'user_otro' }))).status).toBe(403);
  });

  it('sin configurar el servidor: 503 (cierra, no abre)', async () => {
    const res = await app.fetch(
      new Request('https://x.test/api/sync/pull', {
        headers: { authorization: `Bearer ${signToken()}` },
      }),
      { ...env, OWNER_USER_ID: '' },
    );
    expect(res.status).toBe(503);
  });

  it('origen no autorizado (azp): 401', async () => {
    const res = await app.fetch(
      new Request('https://x.test/api/sync/pull', {
        headers: { authorization: `Bearer ${signToken({ azp: 'https://malo.test' })}` },
      }),
      { ...env, APP_ORIGIN: 'https://app.test' },
    );
    expect(res.status).toBe(401);
  });
});

describe('push', () => {
  it('crea un documento y lo entrega en pull', async () => {
    const { body } = await push([makeOp()]);
    expect(body.results[0]).toMatchObject({ status: 'applied', serverRev: 1 });
    const out = await pull();
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0]).toMatchObject({
      entity: 'records',
      id: 'rec-1',
      rev: 1,
      deviceId: 'dev-a',
    });
    expect(out.changes[0]?.doc['content']).toBe('texto 1');
  });

  it('es idempotente: repetir una operación no duplica ni avanza el cursor', async () => {
    const op = makeOp();
    const first = await push([op]);
    const again = await push([op]);
    expect(again.body.results[0]).toMatchObject({ status: 'duplicate', serverRev: 1 });
    expect(again.body.cursor).toBe(first.body.cursor);
    expect((await pull()).changes).toHaveLength(1);
  });

  it('actualiza cuando la revisión esperada coincide', async () => {
    await push([makeOp()]);
    const { body } = await push([makeOp({ rev: 2, expectedRev: 1 })]);
    expect(body.results[0]?.status).toBe('applied');
    const out = await pull();
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0]?.rev).toBe(2);
  });

  it('detecta conflicto y NO sobrescribe: devuelve la versión del servidor', async () => {
    await push([makeOp()]);
    await push([makeOp({ rev: 2, expectedRev: 1, opId: 'desde-a' })], 'dev-a');
    // El dispositivo B también partió de la revisión 1.
    const { body } = await push(
      [
        makeOp({
          rev: 2,
          expectedRev: 1,
          opId: 'desde-b',
          doc: { id: 'rec-1', rev: 2, createdAt: 1, updatedAt: 3, content: 'otro texto' },
        }),
      ],
      'dev-b',
    );
    const result = body.results[0];
    expect(result?.status).toBe('conflict');
    expect(result?.serverRev).toBe(2);
    expect(result?.serverDoc?.['content']).toBe('texto 2');
    const stored = (await pull()).changes[0];
    expect(stored?.doc['content']).toBe('texto 2');
    expect(stored?.deviceId).toBe('dev-a');
  });

  it('un documento nuevo sobre uno existente es conflicto', async () => {
    await push([makeOp()]);
    const { body } = await push([makeOp({ opId: 'otra', expectedRev: 0 })]);
    expect(body.results[0]?.status).toBe('conflict');
  });

  it('un conflicto no registra la operación: se puede reintentar tras resolverlo', async () => {
    await push([makeOp()]);
    const stale = makeOp({ rev: 2, expectedRev: 0, opId: 'x1' });
    expect((await push([stale])).body.results[0]?.status).toBe('conflict');
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM ops WHERE op_id = ?')
      .bind('x1')
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('un conflicto no deja huecos de datos ni borra el documento', async () => {
    await push([makeOp()]);
    await push([makeOp({ rev: 5, expectedRev: 3, opId: 'malo' })]);
    expect((await pull()).changes[0]?.rev).toBe(1);
  });

  it('procesa un lote mixto: aplicado, conflicto y rechazo no se afectan', async () => {
    await push([makeOp({ id: 'a' })]);
    const { body } = await push([
      makeOp({ id: 'b' }),
      makeOp({ id: 'a', opId: 'x', expectedRev: 0 }),
      makeOp({ id: 'c', entityId: 'distinto' }),
    ]);
    expect(body.results.map((r) => r.status)).toEqual(['applied', 'conflict', 'rejected']);
  });

  it('rechaza revisión no mayor que la esperada', async () => {
    await push([makeOp()]);
    const { body } = await push([makeOp({ rev: 1, expectedRev: 1, opId: 'r' })]);
    expect(body.results[0]?.status).toBe('rejected');
  });

  it('rechaza documentos demasiado grandes', async () => {
    const big = makeOp({
      doc: { id: 'rec-1', rev: 1, createdAt: 1, updatedAt: 2, content: 'x'.repeat(120_000) },
    });
    const { body } = await push([big]);
    expect(body.results[0]?.status).toBe('rejected');
    expect((await pull()).changes).toHaveLength(0);
  });

  it('propaga borrados y restauraciones como cambios de documento', async () => {
    await push([makeOp()]);
    const del = makeOp({
      rev: 2,
      expectedRev: 1,
      op: 'delete',
      opId: 'd',
      doc: { id: 'rec-1', rev: 2, createdAt: 1, updatedAt: 3, deletedAt: 3, content: 'texto 1' },
    });
    await push([del]);
    const row = (await pull()).changes[0];
    expect(row?.doc.deletedAt).toBe(3);
  });

  it('valida el cuerpo: entidad desconocida, lote vacío, demasiadas operaciones, JSON roto', async () => {
    const bad = { ...makeOp(), entity: 'users' };
    const r1 = await call('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd', ops: [bad] }),
    });
    expect(r1.status).toBe(400);
    const r2 = await call('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd', ops: [] }),
    });
    expect(r2.status).toBe(400);
    const many = Array.from({ length: 26 }, (_, i) => makeOp({ id: `m${i}` }));
    const r3 = await call('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd', ops: many }),
    });
    expect(r3.status).toBe(400);
    const r4 = await call('/api/sync/push', { method: 'POST', body: '{' });
    expect(r4.status).toBe(400);
  });

  it('rechaza cuerpos enormes con 413', async () => {
    const res = await call('/api/sync/push', { method: 'POST', body: 'x'.repeat(700_000) });
    expect(res.status).toBe(413);
  });

  it('las respuestas de error no filtran detalles internos', async () => {
    const res = await call('/api/sync/push', { method: 'POST', body: JSON.stringify({ nope: 1 }) });
    expect(await res.json()).toEqual({ error: 'Solicitud no válida.' });
  });
});

describe('pull', () => {
  it('entrega por orden y pagina con cursor', async () => {
    await push([makeOp({ id: 'a' }), makeOp({ id: 'b' }), makeOp({ id: 'c' })]);
    const p1 = await pull(0, 2);
    expect(p1.changes.map((c) => c.id)).toEqual(['a', 'b']);
    expect(p1.hasMore).toBe(true);
    const p2 = await pull(p1.cursor, 2);
    expect(p2.changes.map((c) => c.id)).toEqual(['c']);
    expect(p2.hasMore).toBe(false);
    const p3 = await pull(p2.cursor, 2);
    expect(p3.changes).toHaveLength(0);
    expect(p3.cursor).toBe(p2.cursor);
  });

  it('un documento modificado reaparece con un seq mayor y una sola vez', async () => {
    await push([makeOp({ id: 'a' }), makeOp({ id: 'b' })]);
    const before = await pull();
    await push([makeOp({ id: 'a', rev: 2, expectedRev: 1 })]);
    const after = await pull(before.cursor);
    expect(after.changes.map((c) => c.id)).toEqual(['a']);
    expect((await pull()).changes).toHaveLength(2);
  });

  it('parámetros no válidos: 400', async () => {
    expect((await call('/api/sync/pull?since=-1')).status).toBe(400);
    expect((await call('/api/sync/pull?limit=9999')).status).toBe(400);
  });
});
