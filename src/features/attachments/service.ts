import { db } from '@/db/database';
import { createEntity, runInTransaction, softDeleteEntity, updateEntity } from '@/db/repo';
import type { Attachment, Id } from '@/db/types';
import { ValidationError } from '@/features/followups/service';
import { sha256Hex } from '@/features/backup/crypto';
import { MAX_PHOTO_BYTES, prepareImage } from './image';

/**
 * Fotos y adjuntos de una reunión (por ejemplo, la pizarra del consejo). Por ahora viven solo en
 * este dispositivo y entran en el respaldo cifrado; todavía no se sincronizan.
 */

const IMAGE_TYPES = /^image\//;

export function defaultPhotoTitle(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Foto ${pad(at.getDate())}/${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export async function addPhoto(
  meetingId: Id,
  file: File,
  options: { title?: string; agendaItemId?: Id } = {},
): Promise<Attachment> {
  if (!IMAGE_TYPES.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new ValidationError('Solo se pueden guardar fotos (JPG, PNG, WebP o HEIC).');
  }
  const meeting = await db.meetings.get(meetingId);
  if (!meeting || meeting.deletedAt !== undefined) {
    throw new ValidationError('La reunión ya no existe.');
  }

  const prepared = await prepareImage(file);
  if (prepared.blob.size > MAX_PHOTO_BYTES) {
    throw new ValidationError('La foto es demasiado grande. Prueba con una de menor calidad.');
  }
  const sha256 = await sha256Hex(new Uint8Array(await prepared.blob.arrayBuffer()));

  return createEntity('attachments', {
    meetingId,
    agendaItemId: options.agendaItemId,
    title: options.title?.trim() || defaultPhotoTitle(),
    fileName: file.name || 'foto.jpg',
    mime: prepared.mime,
    size: prepared.blob.size,
    sha256,
    blob: prepared.blob,
    syncState: 'solo_local',
  });
}

/** Fotos activas de una reunión, de la más antigua a la más reciente. */
export async function listPhotos(meetingId: Id): Promise<Attachment[]> {
  const rows = await db.attachments.where('meetingId').equals(meetingId).toArray();
  return rows.filter((a) => a.deletedAt === undefined).sort((a, b) => a.createdAt - b.createdAt);
}

export async function renamePhoto(id: Id, title: string): Promise<Attachment> {
  const clean = title.trim();
  if (!clean) throw new ValidationError('Escribe un nombre para la foto.');
  return updateEntity('attachments', id, { title: clean.slice(0, 120) });
}

/** Va a la papelera 30 días, como todo lo demás. */
export async function removePhoto(id: Id): Promise<void> {
  await runInTransaction(async () => {
    await softDeleteEntity('attachments', id);
  });
}
