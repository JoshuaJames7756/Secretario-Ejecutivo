import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { purgeEntity, softDeleteEntity } from '../src/db/repo';
import { resetDeviceIdCache } from '../src/db/settings';
import {
  addAgendaItem,
  createMeeting,
  saveAgendaItemNotes,
  saveGeneralNote,
} from '../src/features/meetings/service';
import {
  MAX_VERSIONS,
  VERSION_INTERVAL_MS,
  captureVersion,
  listVersions,
  snapshotNow,
} from '../src/features/versions/service';

beforeEach(async () => {
  resetDeviceIdCache();
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function item() {
  const m = await createMeeting({ title: 'R', startsAt: Date.now(), durationMin: 30 });
  return addAgendaItem(m.id, { title: 'Punto' });
}

describe('versiones de notas', () => {
  it('no guarda versiones por cada pulsación: dentro del intervalo no se acumulan', async () => {
    const a = await item();
    await saveAgendaItemNotes(a.id, 'Primer texto');
    await saveAgendaItemNotes(a.id, 'Primer texto, un poco más');
    await saveAgendaItemNotes(a.id, 'Primer texto, un poco más y más');
    expect((await listVersions('agendaItems', a.id)).length).toBeLessThanOrEqual(1);
  });

  it('guarda el texto anterior cuando pasó el intervalo', async () => {
    const a = await item();
    const t0 = 1_000_000;
    await captureVersion('agendaItems', a.id, 'Texto largo de la nota original', 'Cambio', t0);
    await captureVersion('agendaItems', a.id, 'Segundo texto', 'Otro', t0 + 1000);
    expect(await listVersions('agendaItems', a.id)).toHaveLength(1);
    await captureVersion(
      'agendaItems',
      a.id,
      'Segundo texto',
      'Otro',
      t0 + VERSION_INTERVAL_MS + 1,
    );
    const versions = await listVersions('agendaItems', a.id);
    expect(versions.map((v) => v.content)).toEqual([
      'Segundo texto',
      'Texto largo de la nota original',
    ]);
  });

  it('protege contra borrar casi todo: guarda aunque no haya pasado el intervalo', async () => {
    const a = await item();
    const long = 'x'.repeat(200);
    await captureVersion('agendaItems', a.id, 'Anterior primera', 'cambio', 5000);
    await captureVersion('agendaItems', a.id, long, 'x', 5001); // borró casi todo
    const versions = await listVersions('agendaItems', a.id);
    expect(versions[0]?.content).toBe(long);
  });

  it('no duplica la misma versión ni guarda textos vacíos', async () => {
    const a = await item();
    await captureVersion('agendaItems', a.id, '', 'algo', 1);
    await captureVersion('agendaItems', a.id, 'Texto', 'Texto', 2);
    expect(await listVersions('agendaItems', a.id)).toHaveLength(0);
    await snapshotNow('agendaItems', a.id, 'Texto actual');
    await snapshotNow('agendaItems', a.id, 'Texto actual');
    expect(await listVersions('agendaItems', a.id)).toHaveLength(1);
  });

  it('conserva como máximo las últimas versiones', async () => {
    const a = await item();
    for (let i = 0; i < MAX_VERSIONS + 5; i += 1) {
      await captureVersion(
        'agendaItems',
        a.id,
        `Versión número ${i} del texto`,
        'nuevo',
        i * VERSION_INTERVAL_MS + 1,
      );
    }
    const versions = await listVersions('agendaItems', a.id);
    expect(versions).toHaveLength(MAX_VERSIONS);
    expect(versions.at(-1)?.content).toBe('Versión número 5 del texto'); // las 5 más viejas se fueron
  });

  it('funciona para la nota general', async () => {
    const m = await createMeeting({ title: 'R', startsAt: Date.now(), durationMin: 30 });
    await saveGeneralNote(m.id, 'x'.repeat(100));
    await saveGeneralNote(m.id, 'x'); // se borró casi todo
    const versions = await db.versions.toArray();
    expect(versions).toHaveLength(1);
    expect(versions[0]?.entity).toBe('records');
  });

  it('eliminar definitivamente borra también las versiones', async () => {
    const a = await item();
    await captureVersion('agendaItems', a.id, 'Contenido que no debe sobrevivir', 'x', 1);
    expect(await db.versions.count()).toBe(1);
    await softDeleteEntity('agendaItems', a.id);
    expect(await db.versions.count()).toBe(1); // en la papelera aún se puede recuperar
    await purgeEntity('agendaItems', a.id);
    expect(await db.versions.count()).toBe(0);
  });
});
