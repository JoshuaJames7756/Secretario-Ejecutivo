import Dexie from 'dexie';
import { db } from '@/db/database';
import {
  RecordNotFoundError,
  createEntity,
  isActive,
  runInTransaction,
  softDeleteEntity,
  updateEntity,
} from '@/db/repo';
import type {
  AgendaItem,
  FollowUp,
  Id,
  MeetingOccurrence,
  MeetingRecord,
  MeetingStatus,
  RecordType,
} from '@/db/types';
import { createFollowUp, ValidationError } from '@/features/followups/service';

export { ValidationError };

/* ---------- Estados de la reunión ---------- */

const TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  programada: ['en_curso', 'cancelada', 'reprogramada'],
  en_curso: ['cerrada', 'cancelada'],
  cerrada: ['en_curso'], // reabrir para corregir o completar
  cancelada: ['programada'], // restablecer; sus notas y agenda nunca se borran
  reprogramada: ['programada', 'en_curso', 'cancelada'],
};

export class InvalidTransitionError extends Error {
  constructor(from: MeetingStatus, to: MeetingStatus) {
    super(`No se puede pasar una reunión de "${from}" a "${to}".`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: MeetingStatus, to: MeetingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/* ---------- Reuniones ---------- */

export interface NewMeetingInput {
  title: string;
  startsAt: number;
  durationMin: number;
  place?: string;
  participants?: string[];
  templateId?: Id;
}

/**
 * Crea una reunión. Si viene de una plantilla, COPIA la estructura inicial (título, participantes
 * y puntos de agenda). Desde ese momento la reunión es independiente: cambiar, archivar o eliminar
 * la plantilla no la altera (especificación, sección 6).
 * La reunión y su agenda se guardan en una sola transacción.
 */
export async function createMeeting(input: NewMeetingInput): Promise<MeetingOccurrence> {
  const title = input.title.trim();
  if (!title) throw new ValidationError('La reunión necesita un nombre.');
  if (!Number.isFinite(input.startsAt)) throw new ValidationError('Indica la fecha y la hora.');
  if (!(input.durationMin > 0)) throw new ValidationError('La duración debe ser mayor que cero.');

  return runInTransaction(async () => {
    const template = input.templateId ? await db.templates.get(input.templateId) : undefined;
    if (input.templateId && !template) throw new RecordNotFoundError('templates', input.templateId);

    const meeting = await createEntity('meetings', {
      templateId: input.templateId,
      title,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      place: input.place?.trim() || undefined,
      participants: [...(input.participants ?? template?.suggestedParticipants ?? [])],
      status: 'programada',
    });

    const points = template?.agendaPoints ?? [];
    for (const [order, point] of points.entries()) {
      await createEntity('agendaItems', {
        meetingId: meeting.id,
        title: point.title,
        description: point.description,
        order,
        prep: 'pendiente',
      });
    }
    return meeting;
  });
}

export interface MeetingDetails {
  title: string;
  startsAt: number;
  durationMin: number;
  place?: string;
  participants: string[];
}

export async function updateMeetingDetails(id: Id, d: MeetingDetails): Promise<MeetingOccurrence> {
  const title = d.title.trim();
  if (!title) throw new ValidationError('La reunión necesita un nombre.');
  return updateEntity('meetings', id, {
    title,
    startsAt: d.startsAt,
    durationMin: d.durationMin,
    place: d.place?.trim() || undefined,
    participants: d.participants,
  });
}

export async function changeMeetingStatus(
  id: Id,
  to: MeetingStatus,
  extra: { summary?: string } = {},
): Promise<MeetingOccurrence> {
  return runInTransaction(async () => {
    const meeting = await db.meetings.get(id);
    if (!meeting || !isActive(meeting)) throw new RecordNotFoundError('meetings', id);
    if (!canTransition(meeting.status, to)) throw new InvalidTransitionError(meeting.status, to);
    return updateEntity('meetings', id, {
      status: to,
      ...(extra.summary !== undefined ? { summary: extra.summary.trim() || undefined } : {}),
    });
  });
}

/* ---------- Agenda ---------- */

export function agendaQuery(meetingId: Id): Promise<AgendaItem[]> {
  return db.agendaItems
    .where('[meetingId+order]')
    .between([meetingId, Dexie.minKey], [meetingId, Dexie.maxKey])
    .filter(isActive)
    .toArray();
}

export async function addAgendaItem(
  meetingId: Id,
  input: { title: string; description?: string },
): Promise<AgendaItem> {
  const title = input.title.trim();
  if (!title) throw new ValidationError('El punto de agenda necesita un título.');
  return runInTransaction(async () => {
    // Se cuentan también los eliminados para que un orden nuevo nunca choque con uno recuperable.
    const all = await db.agendaItems.where('meetingId').equals(meetingId).toArray();
    const order = all.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    return createEntity('agendaItems', {
      meetingId,
      title,
      description: input.description?.trim() || undefined,
      order,
      prep: 'pendiente',
    });
  });
}

export async function updateAgendaItem(
  id: Id,
  patch: { title?: string; description?: string; prep?: AgendaItem['prep'] },
): Promise<AgendaItem> {
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new ValidationError('El punto de agenda necesita un título.');
  }
  return updateEntity('agendaItems', id, {
    ...patch,
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description.trim() || undefined }
      : {}),
  });
}

/** Intercambia el orden con el punto vecino. Devuelve false si ya está en el extremo. */
export async function moveAgendaItem(
  meetingId: Id,
  itemId: Id,
  direction: -1 | 1,
): Promise<boolean> {
  return runInTransaction(async () => {
    const items = await agendaQuery(meetingId);
    const index = items.findIndex((item) => item.id === itemId);
    const other = items[index + direction];
    const item = items[index];
    if (index < 0 || !item || !other) return false;
    await updateEntity('agendaItems', item.id, { order: other.order });
    await updateEntity('agendaItems', other.id, { order: item.order });
    return true;
  });
}

export async function removeAgendaItem(id: Id): Promise<void> {
  await softDeleteEntity('agendaItems', id);
}

export function saveAgendaItemNotes(id: Id, notes: string): Promise<AgendaItem> {
  return updateEntity('agendaItems', id, { notes });
}

/* ---------- Registros de la reunión ---------- */

export const GENERAL_NOTE_ID_PREFIX = 'nota-general:';

/**
 * Nota general de la reunión. Hay una sola por reunión, con identificador fijo, así que guardarla
 * muchas veces (guardado automático) nunca crea duplicados.
 * Guardar el texto NO cambia su privacidad: si era privada, sigue siéndolo.
 */
export async function saveGeneralNote(meetingId: Id, content: string): Promise<MeetingRecord> {
  const id = `${GENERAL_NOTE_ID_PREFIX}${meetingId}`;
  return runInTransaction(async () => {
    const existing = await db.records.get(id);
    if (existing && isActive(existing)) return updateEntity('records', id, { content });
    return createEntity('records', { id, meetingId, type: 'nota', content, isPrivate: false });
  });
}

/** Marca la nota general como privada (excluida por defecto de los informes) o como no privada. */
export async function setGeneralNotePrivacy(
  meetingId: Id,
  isPrivate: boolean,
): Promise<MeetingRecord> {
  const id = `${GENERAL_NOTE_ID_PREFIX}${meetingId}`;
  return runInTransaction(async () => {
    const existing = await db.records.get(id);
    if (existing && isActive(existing)) return updateEntity('records', id, { isPrivate });
    return createEntity('records', { id, meetingId, type: 'nota', content: '', isPrivate });
  });
}

export interface NewRecordInput {
  meetingId: Id;
  agendaItemId?: Id;
  type: Exclude<RecordType, 'nota'>;
  content: string;
  isPrivate?: boolean;
  /** Solo para asignaciones y asuntos pendientes. */
  assignee?: string;
  dueDate?: string;
}

/**
 * Registra una propuesta, decisión, asignación, asunto pendiente o nota informativa.
 * Nunca se infiere nada: el tipo lo elige la persona (una propuesta no pasa a "decisión" sola).
 * Las asignaciones y los asuntos pendientes crean además su seguimiento, en la misma transacción,
 * enlazado a la reunión y al punto de agenda de origen.
 */
export async function addRecord(
  input: NewRecordInput,
): Promise<{ record: MeetingRecord; followUp?: FollowUp }> {
  const content = input.content.trim();
  if (!content) throw new ValidationError('Escribe el contenido antes de guardarlo.');

  return runInTransaction(async () => {
    const record = await createEntity('records', {
      meetingId: input.meetingId,
      agendaItemId: input.agendaItemId,
      type: input.type,
      content,
      isPrivate: input.isPrivate ?? false,
    });

    if (input.type !== 'asignacion' && input.type !== 'pendiente') return { record };

    const followUp = await createFollowUp({
      kind: input.type,
      text: content,
      assignee: input.assignee,
      dueDate: input.dueDate,
      originMeetingId: input.meetingId,
      originAgendaItemId: input.agendaItemId,
      originRecordId: record.id,
    });
    return { record, followUp };
  });
}

/**
 * Elimina un registro (recuperable 30 días). El seguimiento creado a partir de él NO se elimina
 * automáticamente: se gestiona por separado en Seguimientos.
 */
export async function removeRecord(id: Id): Promise<void> {
  await softDeleteEntity('records', id);
}

export function recordsQuery(meetingId: Id): Promise<MeetingRecord[]> {
  return db.records
    .where('meetingId')
    .equals(meetingId)
    .filter(isActive)
    .toArray()
    .then((rows) => rows.sort((a, b) => a.createdAt - b.createdAt));
}
