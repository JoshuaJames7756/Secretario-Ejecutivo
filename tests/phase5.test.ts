import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase, db } from '../src/db/database';
import { TRASH_RETENTION_MS, purgeExpired, restoreEntity, softDeleteEntity } from '../src/db/repo';
import { resetDeviceIdCache } from '../src/db/settings';
import { createFollowUp } from '../src/features/followups/service';
import { addRecord, createMeeting } from '../src/features/meetings/service';
import { createRequest } from '../src/features/interviews/service';
import { MIN_QUERY_LENGTH, normalize, search } from '../src/features/search/service';
import { countExpired, daysLeft, listTrash } from '../src/features/trash/service';

beforeEach(async () => {
  resetDeviceIdCache();
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('migración del esquema', () => {
  it('pasar de la versión 1 a la 2 conserva todos los datos', async () => {
    const name = `migracion-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      meetings: 'id, templateId, startsAt, status, seriesId, updatedAt',
      settings: 'key',
    });
    await old.table('meetings').put({ id: 'm1', title: 'Antigua', startsAt: 1, rev: 3 });
    await old.table('settings').put({ key: 'deviceId', value: 'abc' });
    old.close();

    const upgraded = new AppDatabase(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect((await upgraded.meetings.get('m1'))?.title).toBe('Antigua');
    expect((await upgraded.settings.get('deviceId'))?.value).toBe('abc');
    expect(await upgraded.versions.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});

describe('papelera', () => {
  it('lista lo eliminado con los días que quedan y permite recuperarlo', async () => {
    const m = await createMeeting({
      title: 'Reunión borrada',
      startsAt: Date.now(),
      durationMin: 30,
    });
    await softDeleteEntity('meetings', m.id);
    const items = await listTrash();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      entity: 'meetings',
      label: 'Reunión borrada',
      kind: 'Reunión',
    });
    expect(items[0]!.daysLeft).toBe(30);

    await restoreEntity('meetings', m.id);
    expect(await listTrash()).toHaveLength(0);
  });

  it('lo vencido no aparece como recuperable y se depura de forma explícita', async () => {
    const m = await createMeeting({ title: 'Vieja', startsAt: Date.now(), durationMin: 30 });
    const deletedAt = Date.now() - TRASH_RETENTION_MS - 1000;
    await db.meetings.update(m.id, { deletedAt });
    expect(await listTrash()).toHaveLength(0);
    expect(await countExpired()).toBe(1);
    expect(await db.meetings.count()).toBe(1); // no se borra sola
    expect(await purgeExpired()).toBe(1);
    expect(await db.meetings.count()).toBe(0);
  });

  it('calcula los días restantes', () => {
    const now = 10 * 86_400_000;
    expect(daysLeft(now, now)).toBe(30);
    expect(daysLeft(now - 29 * 86_400_000, now)).toBe(1);
    expect(daysLeft(now - 31 * 86_400_000, now)).toBe(0);
  });
});

describe('búsqueda', () => {
  it('ignora tildes y mayúsculas y conserva las posiciones del fragmento', async () => {
    expect(normalize('Presupuesto Ñandú ÁÉÍ')).toBe('presupuesto nandu aei');
    const m = await createMeeting({ title: 'Consejo', startsAt: Date.now(), durationMin: 30 });
    await addRecord({
      meetingId: m.id,
      type: 'decision',
      content: 'Se aprobó el presupuesto anual',
    });
    const results = await search('PRESUPUESTÓ'.slice(0, 11));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'registro', to: `/reuniones/${m.id}` });
    expect(results[0]!.snippet).toContain('presupuesto');
  });

  it('busca en varios tipos y filtra por tipo y por fechas', async () => {
    const m = await createMeeting({
      title: 'Reunión Ana',
      startsAt: new Date(2026, 5, 1).getTime(),
      durationMin: 30,
    });
    await createFollowUp({ kind: 'pendiente', text: 'Hablar con Ana', assignee: 'Ana López' });
    await createRequest({ personName: 'Ana Pérez' });
    const all = await search('ana');
    expect(new Set(all.map((r) => r.kind))).toEqual(
      new Set(['reunion', 'seguimiento', 'entrevista']),
    );
    expect((await search('ana', { kinds: ['reunion'] })).map((r) => r.id)).toEqual([m.id]);
    const julio = await search('ana', {
      from: new Date(2026, 6, 1).getTime(),
      to: new Date(2026, 6, 30).getTime(),
    });
    expect(julio).toHaveLength(0);
  });

  it('no devuelve eliminados ni busca con menos de dos letras', async () => {
    const m = await createMeeting({ title: 'Secreta', startsAt: Date.now(), durationMin: 30 });
    await softDeleteEntity('meetings', m.id);
    expect(await search('secreta')).toHaveLength(0);
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(await search('s')).toHaveLength(0);
  });

  it('marca los registros privados', async () => {
    const m = await createMeeting({ title: 'R', startsAt: Date.now(), durationMin: 30 });
    await addRecord({
      meetingId: m.id,
      type: 'informativa',
      content: 'dato reservado',
      isPrivate: true,
    });
    expect((await search('reservado'))[0]?.isPrivate).toBe(true);
  });
});
