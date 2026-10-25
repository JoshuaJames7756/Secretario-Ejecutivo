import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import {
  LocalSaveError,
  RecordNotFoundError,
  RecoveryWindowExpiredError,
  RevisionConflictError,
  TRASH_RETENTION_MS,
  createEntity,
  isRecoverable,
  purgeExpired,
  restoreEntity,
  softDeleteEntity,
  updateEntity,
} from '../src/db/repo';
import { resetDeviceIdCache } from '../src/db/settings';

const DAY = 24 * 60 * 60 * 1000;

const newNote = (content = 'Acuerdo preliminar') => ({
  meetingId: 'm-1',
  type: 'nota' as const,
  content,
  isPrivate: false,
});

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  resetDeviceIdCache();
});

describe('esquema local', () => {
  it('declara la versión 2 con las 14 tablas esperadas', () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      [
        'agendaItems',
        'attachments',
        'changeLog',
        'followUps',
        'interviewAppointments',
        'interviewRequests',
        'leaderAvailability',
        'meetings',
        'organizations',
        'records',
        'settings',
        'syncOps',
        'templates',
        'versions',
      ].sort(),
    );
  });
});

describe('guardar sin conexión', () => {
  it('guarda el registro, su historial y una operación pendiente en una sola transacción', async () => {
    const note = await createEntity('records', newNote());

    expect(note.rev).toBe(1);
    expect(await db.records.get(note.id)).toMatchObject({ content: 'Acuerdo preliminar' });

    const ops = await db.syncOps.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      entity: 'records',
      entityId: note.id,
      op: 'upsert',
      status: 'pendiente',
      attempts: 0,
    });
    expect(await db.changeLog.count()).toBe(1);
  });

  it('el historial no guarda el contenido de las notas', async () => {
    await createEntity('records', newNote('Texto sensible de ejemplo'));
    const log = JSON.stringify(await db.changeLog.toArray());
    expect(log).not.toContain('Texto sensible de ejemplo');
  });

  it('la nota sobrevive al cierre y reapertura de la base de datos', async () => {
    const note = await createEntity('records', newNote('Debe sobrevivir'));
    db.close();
    await db.open();
    expect((await db.records.get(note.id))?.content).toBe('Debe sobrevivir');
    expect(await db.syncOps.count()).toBe(1);
  });

  it('reintentar la creación con el mismo id no duplica registros ni operaciones', async () => {
    const first = await createEntity('records', { ...newNote(), id: 'fijo-1' });
    const second = await createEntity('records', { ...newNote('otro texto'), id: 'fijo-1' });

    expect(second.id).toBe(first.id);
    expect(second.content).toBe('Acuerdo preliminar');
    expect(await db.records.count()).toBe(1);
    expect(await db.syncOps.count()).toBe(1);
    expect(await db.changeLog.count()).toBe(1);
  });

  it('reutiliza el mismo identificador de dispositivo', async () => {
    await createEntity('records', newNote('a'));
    await createEntity('records', newNote('b'));
    const [a, b] = await db.syncOps.toArray();
    expect(a?.deviceId).toBeTruthy();
    expect(a?.deviceId).toBe(b?.deviceId);
  });
});

describe('errores de almacenamiento', () => {
  it('un fallo real del almacenamiento se explica con un mensaje comprensible', async () => {
    db.close(); // simula que el navegador cerró la base de datos
    try {
      const error = await createEntity('records', newNote()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LocalSaveError);
      expect((error as Error).message).toMatch(/base de datos local no está disponible/);
    } finally {
      await db.open();
    }
  });

  it('un error de la aplicación NO se presenta como fallo de almacenamiento', async () => {
    const error = await updateEntity('records', 'no-existe', { content: 'x' }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RecordNotFoundError);
    expect(error).not.toBeInstanceOf(LocalSaveError);
  });
});

describe('modificar', () => {
  it('sube la revisión, conserva la fecha de creación y registra la operación', async () => {
    const note = await createEntity('records', newNote());
    const updated = await updateEntity('records', note.id, { content: 'Texto nuevo' });

    expect(updated.rev).toBe(2);
    expect(updated.createdAt).toBe(note.createdAt);
    expect(updated.content).toBe('Texto nuevo');
    // Mientras la creación siga pendiente, el cambio se fusiona en la misma operación.
    const ops = await db.syncOps.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.rev).toBe(2);
    expect(await db.changeLog.count()).toBe(2); // el historial sí registra cada cambio
  });

  it('no deja operaciones a medias si el registro no existe', async () => {
    await expect(updateEntity('records', 'no-existe', { content: 'x' })).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    expect(await db.syncOps.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
  });

  it('avisa del conflicto en lugar de sobrescribir en silencio', async () => {
    const note = await createEntity('records', newNote());
    await updateEntity('records', note.id, { content: 'Cambio desde otro dispositivo' });

    await expect(
      updateEntity('records', note.id, { content: 'Mi cambio' }, { expectedRev: note.rev }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect((await db.records.get(note.id))?.content).toBe('Cambio desde otro dispositivo');
  });
});

describe('cola de sincronización', () => {
  it('muchos cambios seguidos a un registro dejan una sola operación pendiente', async () => {
    const note = await createEntity('records', newNote('a'));
    for (let i = 0; i < 25; i++) await updateEntity('records', note.id, { content: `v${i}` });

    const ops = await db.syncOps.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ status: 'pendiente', rev: 26 });
  });

  it('nunca fusiona con una operación ya enviada', async () => {
    const note = await createEntity('records', newNote());
    const [sent] = await db.syncOps.toArray();
    await db.syncOps.update(sent!.id, { status: 'confirmada' });

    await updateEntity('records', note.id, { content: 'después del envío' });

    const ops = (await db.syncOps.toArray()).sort((a, b) => a.rev - b.rev);
    expect(ops.map((o) => [o.status, o.rev])).toEqual([
      ['confirmada', 1],
      ['pendiente', 2],
    ]);
  });

  it('no mueve un cambio por delante de un borrado o una restauración', async () => {
    const note = await createEntity('records', newNote());
    const deleted = await softDeleteEntity('records', note.id);
    await restoreEntity('records', note.id, deleted.deletedAt! + 1000);
    await updateEntity('records', note.id, { content: 'tras restaurar' });

    const ops = (await db.syncOps.toArray()).sort((a, b) => a.rev - b.rev);
    expect(ops.map((o) => o.op)).toEqual(['upsert', 'delete', 'restore', 'upsert']);
  });
});

describe('papelera de 30 días', () => {
  it('eliminar es lógico: el registro sigue en la base y es recuperable', async () => {
    const note = await createEntity('records', newNote());
    const deleted = await softDeleteEntity('records', note.id);

    expect(deleted.deletedAt).toBeDefined();
    expect(await db.records.get(note.id)).toBeDefined();
    expect(isRecoverable(deleted)).toBe(true);
    // Para un mismo registro, el orden de aplicación lo da `rev` (las claves son UUID aleatorios
    // y dos operaciones pueden compartir milisegundo, así que ni el id ni la fecha sirven).
    const ops = (await db.syncOps.toArray()).sort((a, b) => a.rev - b.rev);
    expect(ops.map((o) => o.op)).toEqual(['upsert', 'delete']);
  });

  it('restaurar quita la marca de borrado y conserva el contenido', async () => {
    const note = await createEntity('records', newNote('Contenido original'));
    const deleted = await softDeleteEntity('records', note.id);
    const restored = await restoreEntity('records', note.id, deleted.deletedAt! + 5 * DAY);

    expect(restored.deletedAt).toBeUndefined();
    expect(restored.content).toBe('Contenido original');
    expect(restored.rev).toBe(3);
  });

  it('no permite restaurar pasados los 30 días', async () => {
    const note = await createEntity('records', newNote());
    const deleted = await softDeleteEntity('records', note.id);
    await expect(
      restoreEntity('records', note.id, deleted.deletedAt! + TRASH_RETENTION_MS + 1),
    ).rejects.toBeInstanceOf(RecoveryWindowExpiredError);
  });

  it('purgar elimina solo lo vencido y deja lo reciente', async () => {
    const old = await createEntity('records', newNote('vencida'));
    const recent = await createEntity('records', newNote('reciente'));
    const active = await createEntity('records', newNote('activa'));

    const oldDeleted = await softDeleteEntity('records', old.id);
    await softDeleteEntity('records', recent.id);

    const purged = await purgeExpired(oldDeleted.deletedAt! + 31 * DAY);
    // En la prueba ambas se borraron "ahora"; con la fecha simulada ambas están vencidas.
    expect(purged).toBe(2);
    expect(await db.records.get(old.id)).toBeUndefined();
    expect(await db.records.get(active.id)).toBeDefined();

    const stillRecent = await createEntity('records', newNote('otra'));
    const deletedNow = await softDeleteEntity('records', stillRecent.id);
    expect(await purgeExpired(deletedNow.deletedAt! + 29 * DAY)).toBe(0);
    expect(await db.records.get(stillRecent.id)).toBeDefined();
  });

  it('la purga queda en el historial pero no genera operaciones de sincronización', async () => {
    const note = await createEntity('records', newNote());
    const deleted = await softDeleteEntity('records', note.id);
    const opsBefore = await db.syncOps.count();
    await purgeExpired(deleted.deletedAt! + 31 * DAY);

    expect(await db.syncOps.count()).toBe(opsBefore);
    expect((await db.changeLog.toArray()).map((e) => e.op)).toContain('purge');
  });
});
