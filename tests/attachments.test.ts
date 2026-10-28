import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { restoreEntity, softDeleteEntity } from '../src/db/repo';
import { resetDeviceIdCache } from '../src/db/settings';
import {
  addPhoto,
  listPhotos,
  removePhoto,
  renamePhoto,
} from '../src/features/attachments/service';
import { createBackup, restoreBackup } from '../src/features/backup/service';
import { createMeeting } from '../src/features/meetings/service';
import { listTrash } from '../src/features/trash/service';
import { markAllReferencesReviewed, seedCatalog } from '../src/features/templates/service';
import { runSync } from '../src/features/sync/engine';
import { FakeServer } from './sync-fake-server';

const FAST = { iterations: 1000 };
const PASSWORD = 'una-contraseña-larga';

const photo = (bytes: number[], name = 'pizarra.jpg', type = 'image/jpeg') =>
  new File([new Uint8Array(bytes)], name, { type });

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  resetDeviceIdCache();
});

async function newMeeting() {
  return createMeeting({ title: 'Sumo Consejo', startsAt: Date.now(), durationMin: 60 });
}

describe('fotos de una reunión', () => {
  it('guarda la foto con su huella, tamaño y nombre, solo en este dispositivo', async () => {
    const m = await newMeeting();
    const saved = await addPhoto(m.id, photo([1, 2, 3, 4, 5]));
    expect(saved.meetingId).toBe(m.id);
    expect(saved.syncState).toBe('solo_local');
    expect(saved.size).toBe(5);
    expect(saved.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.title).toMatch(/^Foto /);
    expect(await bytesOf(saved.blob!)).toEqual([1, 2, 3, 4, 5]);
    expect((await listPhotos(m.id)).map((p) => p.id)).toEqual([saved.id]);
  });

  it('rechaza lo que no es una foto y reuniones que no existen', async () => {
    const m = await newMeeting();
    await expect(addPhoto(m.id, photo([1], 'nota.pdf', 'application/pdf'))).rejects.toThrow(
      /Solo se pueden guardar fotos/,
    );
    await expect(addPhoto('no-existe', photo([1]))).rejects.toThrow(/ya no existe/);
  });

  it('renombra y no permite un nombre vacío', async () => {
    const m = await newMeeting();
    const saved = await addPhoto(m.id, photo([1]));
    expect((await renamePhoto(saved.id, ' Pizarra del consejo ')).title).toBe(
      'Pizarra del consejo',
    );
    await expect(renamePhoto(saved.id, '   ')).rejects.toThrow(/nombre/);
  });

  it('eliminar la manda a la papelera y se puede recuperar con la foto intacta', async () => {
    const m = await newMeeting();
    const saved = await addPhoto(m.id, photo([9, 8, 7]), { title: 'Pizarra' });
    await removePhoto(saved.id);
    expect(await listPhotos(m.id)).toHaveLength(0);
    const trash = await listTrash();
    expect(trash.find((t) => t.entity === 'attachments')?.label).toBe('Pizarra');
    await restoreEntity('attachments', saved.id);
    const back = (await listPhotos(m.id))[0]!;
    expect(await bytesOf(back.blob!)).toEqual([9, 8, 7]);
  });

  it('las fotos no se envían al servidor (siguen solo en el dispositivo)', async () => {
    const m = await newMeeting();
    await addPhoto(m.id, photo([1, 2, 3]));
    const server = new FakeServer();
    await runSync(server, 'dev');
    expect([...server.docs.keys()].some((k) => k.startsWith('attachments:'))).toBe(false);
  });
});

describe('respaldo con fotos', () => {
  it('las fotos viajan dentro del respaldo cifrado y vuelven idénticas', async () => {
    const m = await newMeeting();
    const original = [255, 0, 128, 7, 7, 7, 42, 250];
    const saved = await addPhoto(m.id, photo(original), { title: 'Pizarra' });

    const { text } = await createBackup(PASSWORD, FAST);
    expect(text).not.toContain('Pizarra'); // todo va cifrado

    await db.attachments.clear();
    await restoreBackup(text, PASSWORD);

    const back = await db.attachments.get(saved.id);
    expect(back?.title).toBe('Pizarra');
    expect(back?.blob).toBeInstanceOf(Blob);
    expect(await bytesOf(back!.blob!)).toEqual(original);
    expect(back?.blob?.type).toBe('image/jpeg');
  });
});

describe('verificación del Manual en bloque', () => {
  it('marca solo lo oficial pendiente, con fecha, y no repite', async () => {
    await seedCatalog();
    const pending = await db.templates
      .filter((t) => t.origin === 'oficial' && !t.lastReviewedAt)
      .count();
    expect(pending).toBeGreaterThan(0);
    const at = 1_700_000_000_000;
    expect(await markAllReferencesReviewed(at)).toBe(pending);
    expect(
      await db.templates.filter((t) => t.origin === 'oficial' && !t.lastReviewedAt).count(),
    ).toBe(0);
    expect((await db.templates.filter((t) => t.origin === 'oficial').first())?.lastReviewedAt).toBe(
      at,
    );
    expect(await markAllReferencesReviewed()).toBe(0);
  });
});

it('softDelete directo también deja la foto recuperable', async () => {
  const m = await newMeeting();
  const saved = await addPhoto(m.id, photo([1]));
  await softDeleteEntity('attachments', saved.id);
  expect((await db.attachments.get(saved.id))?.deletedAt).toBeTypeOf('number');
});
