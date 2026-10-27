import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { createEntity, softDeleteEntity, syncKey, updateEntity } from '../src/db/repo';
import { getDeviceId, resetDeviceIdCache } from '../src/db/settings';
import {
  canKeepBoth,
  differences,
  keepBoth,
  keepMine,
  keepTheirs,
} from '../src/features/sync/conflicts';
import { retryFailed, runSync } from '../src/features/sync/engine';
import { FakeServer } from './sync-fake-server';

let server: FakeServer;
let deviceId: string;

const note = (content: string) => ({
  meetingId: 'm-1',
  type: 'nota' as const,
  content,
  isPrivate: false,
});

const sync = () => runSync(server, deviceId);

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  resetDeviceIdCache();
  deviceId = await getDeviceId();
  server = new FakeServer();
});

describe('envío', () => {
  it('envía lo creado y confirma las operaciones', async () => {
    const rec = await createEntity('records', note('Acuerdo'));
    const out = await sync();
    expect(out.sent).toBe(1);
    expect(server.docs.get(syncKey('records', rec.id))?.doc['content']).toBe('Acuerdo');
    expect(await db.syncOps.count()).toBe(0);
    expect((await db.serverRevs.get(syncKey('records', rec.id)))?.rev).toBe(1);
  });

  it('muchas ediciones seguidas viajan como una sola operación con el texto final', async () => {
    const rec = await createEntity('records', note('uno'));
    await updateEntity('records', rec.id, { content: 'dos' });
    await updateEntity('records', rec.id, { content: 'tres' });
    await sync();
    expect(server.pushCalls).toBe(1);
    expect(server.docs.get(syncKey('records', rec.id))?.doc['content']).toBe('tres');
  });

  it('un borrado posterior se envía como documento eliminado', async () => {
    const rec = await createEntity('records', note('x'));
    await sync();
    await softDeleteEntity('records', rec.id);
    await sync();
    expect(server.docs.get(syncKey('records', rec.id))?.doc.deletedAt).toBeTypeOf('number');
  });

  it('sin conexión nada se pierde: la operación sigue pendiente y se envía luego', async () => {
    await createEntity('records', note('x'));
    server.offline = true;
    await expect(sync()).rejects.toThrow();
    const ops = await db.syncOps.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.status).toBe('pendiente');
    server.offline = false;
    expect((await sync()).sent).toBe(1);
  });

  it('si la respuesta se pierde, reintentar no duplica (idempotente)', async () => {
    await createEntity('records', note('x'));
    server.failNextPushAfterApply = true;
    await expect(sync()).rejects.toThrow();
    const out = await sync();
    expect(out.sent).toBe(1);
    expect(server.docs.size).toBe(1);
    expect(await db.syncOps.count()).toBe(0);
  });

  it('no envía adjuntos: se quedan solo en este dispositivo', async () => {
    await createEntity('attachments', {
      meetingId: 'm-1',
      title: 'Foto',
      fileName: 'a.png',
      mime: 'image/png',
      size: 3,
      sha256: 'x',
      blob: new Blob(['abc']),
      syncState: 'solo_local',
    });
    await sync();
    expect(server.docs.size).toBe(0);
    expect(server.pushCalls).toBe(0);
  });

  it('un rechazo del servidor queda como error visible y se puede reintentar', async () => {
    await createEntity('records', note('x'));
    const original = server.push.bind(server);
    server.push = async (req) => ({
      cursor: 0,
      results: req.ops.map((o) => ({ opId: o.opId, status: 'rejected' as const, error: 'No.' })),
    });
    const out = await sync();
    expect(out.failed).toBe(1);
    expect((await db.syncOps.toArray())[0]?.status).toBe('error');
    server.push = original;
    expect(await retryFailed()).toBe(1);
    expect((await sync()).sent).toBe(1);
  });
});

describe('recepción', () => {
  it('trae documentos de otro dispositivo y no los devuelve', async () => {
    server.remoteWrite('records', {
      id: 'r-remoto',
      rev: 3,
      createdAt: 1,
      updatedAt: 5,
      meetingId: 'm-1',
      type: 'nota',
      content: 'desde el teléfono',
      isPrivate: false,
    });
    const out = await sync();
    expect(out.received).toBe(1);
    expect((await db.records.get('r-remoto'))?.content).toBe('desde el teléfono');
    expect(await db.syncOps.count()).toBe(0);
    expect((await db.serverRevs.get('records:r-remoto'))?.rev).toBe(3);
  });

  it('el cursor avanza y la siguiente sincronización no repite cambios', async () => {
    server.remoteWrite('records', { id: 'a', rev: 1, createdAt: 1, updatedAt: 1, content: 'a' });
    await sync();
    const second = await sync();
    expect(second.received).toBe(0);
  });

  it('pagina cuando hay más de 100 cambios', async () => {
    for (let i = 0; i < 230; i += 1) {
      server.remoteWrite('records', {
        id: `r${i}`,
        rev: 1,
        createdAt: 1,
        updatedAt: 1,
        content: 'x',
      });
    }
    expect((await sync()).received).toBe(230);
    expect(await db.records.count()).toBe(230);
  });

  it('NO sobrescribe un cambio local sin enviar', async () => {
    const rec = await createEntity('records', note('base'));
    await sync();
    await updateEntity('records', rec.id, { content: 'mi edición sin enviar' });
    server.remoteWrite('records', {
      ...server.docs.get(syncKey('records', rec.id))!.doc,
      rev: 2,
      content: 'edición del otro',
    });
    server.offline = false;
    // Solo pull: el envío generaría el conflicto; aquí comprobamos que la recepción no pisa.
    const outcome = await sync();
    expect((await db.records.get(rec.id))?.content).toBe('mi edición sin enviar');
    expect(outcome.conflicts).toBe(1);
  });
});

describe('conflictos', () => {
  async function makeConflict() {
    const rec = await createEntity('records', note('base'));
    await sync();
    const key = syncKey('records', rec.id);
    await updateEntity('records', rec.id, { content: 'versión de este dispositivo' });
    const serverDoc = server.docs.get(key)!.doc;
    server.remoteWrite('records', {
      ...serverDoc,
      rev: 2,
      updatedAt: 99,
      content: 'versión del servidor',
    });
    const out = await sync();
    expect(out.conflicts).toBe(1);
    const conflict = (await db.syncConflicts.get(key))!;
    return { rec, key, conflict };
  }

  it('detecta el conflicto, no pisa el servidor y conserva lo local', async () => {
    const { rec, key, conflict } = await makeConflict();
    expect(server.docs.get(key)?.doc['content']).toBe('versión del servidor');
    expect((await db.records.get(rec.id))?.content).toBe('versión de este dispositivo');
    expect((await db.syncOps.toArray())[0]?.status).toBe('conflicto');
    expect(differences(conflict).map((d) => d.field)).toEqual(['content']);
  });

  it('mientras haya conflicto abierto no se vuelve a enviar ese documento', async () => {
    const { rec } = await makeConflict();
    await updateEntity('records', rec.id, { content: 'otra edición más' });
    const before = server.pushCalls;
    await sync();
    expect(server.pushCalls).toBe(before);
  });

  it('conservar la mía: se envía por encima de la del servidor', async () => {
    const { rec, key, conflict } = await makeConflict();
    await keepMine(conflict);
    expect(await db.syncConflicts.count()).toBe(0);
    const out = await sync();
    expect(out.sent).toBe(1);
    expect(server.docs.get(key)?.doc['content']).toBe('versión de este dispositivo');
    expect(server.docs.get(key)?.doc.rev).toBe(3);
    expect((await db.records.get(rec.id))?.rev).toBe(3);
    expect(await db.syncOps.count()).toBe(0);
  });

  it('usar la del servidor: el texto local queda en versiones anteriores', async () => {
    const { rec, conflict } = await makeConflict();
    await keepTheirs(conflict);
    expect((await db.records.get(rec.id))?.content).toBe('versión del servidor');
    const versions = await db.versions.toArray();
    expect(versions.map((v) => v.content)).toContain('versión de este dispositivo');
    expect(await db.syncOps.count()).toBe(0);
    expect(await db.syncConflicts.count()).toBe(0);
    expect((await sync()).sent).toBe(0);
  });

  it('conservar ambas: une los textos y lo envía', async () => {
    const { rec, key, conflict } = await makeConflict();
    expect(canKeepBoth(conflict)).toBe(true);
    await keepBoth(conflict);
    const text = (await db.records.get(rec.id))?.content ?? '';
    expect(text).toContain('versión del servidor');
    expect(text).toContain('versión de este dispositivo');
    await sync();
    expect(String(server.docs.get(key)?.doc['content'])).toContain('versión de este dispositivo');
  });

  it('si los dos lados dicen lo mismo no hay conflicto que decidir', async () => {
    const rec = await createEntity('records', note('base'));
    await sync();
    const key = syncKey('records', rec.id);
    await updateEntity('records', rec.id, { content: 'igual' });
    server.remoteWrite('records', {
      ...server.docs.get(key)!.doc,
      rev: 2,
      updatedAt: 77,
      content: 'igual',
    });
    const out = await sync();
    expect(out.conflicts).toBe(0);
    expect(await db.syncConflicts.count()).toBe(0);
    expect(await db.syncOps.count()).toBe(0);
    expect((await db.serverRevs.get(key))?.rev).toBe(2);
  });
});

describe('restauración de respaldo', () => {
  it('después de restaurar, todo vuelve a quedar pendiente de envío', async () => {
    const { restoreBackup, createBackup } = await import('../src/features/backup/service');
    await createEntity('records', note('a'));
    await createEntity('records', note('b'));
    await sync();
    const { text } = await createBackup('contraseña-larga-123', { iterations: 1000 });
    await restoreBackup(text, 'contraseña-larga-123');
    expect(await db.syncOps.count()).toBe(2);
    expect(await db.serverRevs.count()).toBe(0);
  });
});
