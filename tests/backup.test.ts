import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/database';
import { softDeleteEntity } from '../src/db/repo';
import { resetDeviceIdCache } from '../src/db/settings';
import { BackupPasswordError } from '../src/features/backup/crypto';
import {
  BackupFormatError,
  MIN_PASSWORD_LENGTH,
  createBackup,
  openBackup,
  restoreBackup,
} from '../src/features/backup/service';
import { ValidationError } from '../src/features/followups/service';
import { addRecord, createMeeting, saveGeneralNote } from '../src/features/meetings/service';

const PASSWORD = 'una-contraseña-larga-123';
const FAST = { iterations: 1000 }; // solo en pruebas; en producción son 600 000

beforeEach(async () => {
  resetDeviceIdCache();
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function seed() {
  const meeting = await createMeeting({ title: 'Consejo', startsAt: Date.now(), durationMin: 60 });
  await addRecord({ meetingId: meeting.id, type: 'asignacion', content: 'Preparar informe ñandú' });
  await addRecord({ meetingId: meeting.id, type: 'decision', content: 'Se aprueba' });
  await saveGeneralNote(meeting.id, 'Nota con acentos: áéíóú');
  return meeting;
}

describe('respaldo cifrado', () => {
  it('exporta, verifica y no deja contenido legible en el archivo', async () => {
    await seed();
    const { text, summary } = await createBackup(PASSWORD, FAST);
    expect(summary.counts.meetings).toBe(1);
    expect(summary.counts.records).toBe(3);
    expect(summary.counts.followUps).toBe(1);
    expect(text).not.toContain('Preparar informe');
    expect(text).not.toContain('Consejo');
  });

  it('restaura en una base vacía y recupera todo, incluida la papelera', async () => {
    const meeting = await seed();
    const [record] = await db.records.where('meetingId').equals(meeting.id).toArray();
    await softDeleteEntity('records', record!.id);
    const before = {
      meetings: await db.meetings.toArray(),
      records: await db.records.toArray(),
      followUps: await db.followUps.toArray(),
    };
    const { text } = await createBackup(PASSWORD, FAST);

    await Promise.all(db.tables.map((t) => t.clear()));
    expect(await db.meetings.count()).toBe(0);

    await restoreBackup(text, PASSWORD);
    expect(await db.meetings.toArray()).toEqual(before.meetings);
    expect(await db.records.toArray()).toEqual(before.records);
    expect(await db.followUps.toArray()).toEqual(before.followUps);
    expect((await db.records.toArray()).some((r) => r.deletedAt !== undefined)).toBe(true);
  });

  it('restaurar reemplaza los datos actuales por los del respaldo', async () => {
    await seed();
    const { text } = await createBackup(PASSWORD, FAST);
    await createMeeting({ title: 'Posterior al respaldo', startsAt: Date.now(), durationMin: 30 });
    expect(await db.meetings.count()).toBe(2);

    await restoreBackup(text, PASSWORD);
    const titles = (await db.meetings.toArray()).map((m) => m.title);
    expect(titles).toEqual(['Consejo']);
  });

  it('con contraseña incorrecta falla y no toca los datos', async () => {
    await seed();
    const { text } = await createBackup(PASSWORD, FAST);
    await createMeeting({ title: 'Otra', startsAt: Date.now(), durationMin: 30 });

    await expect(restoreBackup(text, 'contraseña-equivocada')).rejects.toBeInstanceOf(
      BackupPasswordError,
    );
    expect(await db.meetings.count()).toBe(2);
  });

  it('detecta un archivo alterado, incluido el encabezado visible', async () => {
    await seed();
    const { text } = await createBackup(PASSWORD, FAST);

    const tamperedData = JSON.parse(text) as { data: string };
    tamperedData.data = `${tamperedData.data.slice(0, 20)}AAAA${tamperedData.data.slice(24)}`;
    await expect(openBackup(JSON.stringify(tamperedData), PASSWORD)).rejects.toBeInstanceOf(
      BackupPasswordError,
    );

    const tamperedHeader = JSON.parse(text) as { createdAt: number };
    tamperedHeader.createdAt += 1;
    await expect(openBackup(JSON.stringify(tamperedHeader), PASSWORD)).rejects.toBeInstanceOf(
      BackupPasswordError,
    );
  });

  it('rechaza archivos que no son respaldos y versiones más nuevas', async () => {
    await expect(openBackup('no es json', PASSWORD)).rejects.toBeInstanceOf(BackupFormatError);
    await expect(openBackup('{"a":1}', PASSWORD)).rejects.toBeInstanceOf(BackupFormatError);
    await seed();
    const { text } = await createBackup(PASSWORD, FAST);
    const newer = { ...(JSON.parse(text) as object), version: 99 };
    await expect(openBackup(JSON.stringify(newer), PASSWORD)).rejects.toBeInstanceOf(
      BackupFormatError,
    );
  });

  it('exige una contraseña de longitud mínima', async () => {
    await expect(createBackup('corta', FAST)).rejects.toBeInstanceOf(ValidationError);
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(10);
  });

  it('un respaldo de base vacía también se puede crear y restaurar', async () => {
    const { text, summary } = await createBackup(PASSWORD, FAST);
    expect(summary.total).toBe(0);
    await restoreBackup(text, PASSWORD);
    expect(await db.meetings.count()).toBe(0);
  });
});
