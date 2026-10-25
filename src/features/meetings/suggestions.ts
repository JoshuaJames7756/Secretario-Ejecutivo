import { db } from '@/db/database';
import {
  RecordNotFoundError,
  createEntity,
  isActive,
  runInTransaction,
  updateEntity,
} from '@/db/repo';
import type { AgendaItem, FollowUp, Id } from '@/db/types';
import { isOpenFollowUp } from '@/features/followups/model';

/**
 * Sugerencias de agenda (especificación, 8.4): los seguimientos abiertos se OFRECEN, nunca se
 * añaden solos. La persona decide: agregar al orden del día o dejarlo para otra ocasión.
 */
export interface Suggestions {
  pending: FollowUp[];
  dismissedCount: number;
}

export async function loadSuggestions(meetingId: Id): Promise<Suggestions> {
  const [meeting, agenda, followUps] = await Promise.all([
    db.meetings.get(meetingId),
    db.agendaItems.where('meetingId').equals(meetingId).filter(isActive).toArray(),
    db.followUps.filter(isOpenFollowUp).toArray(),
  ]);
  const dismissed = new Set(meeting?.dismissedSuggestionIds ?? []);
  const inAgenda = new Set(agenda.map((a) => a.followUpId).filter(Boolean));
  const available = followUps.filter((f) => !inAgenda.has(f.id));
  const pending = available
    .filter((f) => !dismissed.has(f.id))
    // Con fecha límite primero (la más próxima arriba); luego por antigüedad.
    .sort(
      (a, b) =>
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt - b.createdAt,
    );
  return { pending, dismissedCount: available.length - pending.length };
}

/** Agrega el seguimiento como punto de agenda. El punto es una copia: se puede editar libremente. */
export async function addSuggestionToAgenda(meetingId: Id, followUpId: Id): Promise<AgendaItem> {
  return runInTransaction(async () => {
    const followUp = await db.followUps.get(followUpId);
    if (!followUp || !isActive(followUp)) throw new RecordNotFoundError('followUps', followUpId);
    const all = await db.agendaItems.where('meetingId').equals(meetingId).toArray();
    const order = all.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    return createEntity('agendaItems', {
      meetingId,
      title: followUp.title,
      description: followUp.assignee ? `Responsable: ${followUp.assignee}` : undefined,
      order,
      prep: 'pendiente',
      followUpId,
    });
  });
}

async function changeDismissed(meetingId: Id, change: (ids: Id[]) => Id[]): Promise<void> {
  await runInTransaction(async () => {
    const meeting = await db.meetings.get(meetingId);
    if (!meeting || !isActive(meeting)) throw new RecordNotFoundError('meetings', meetingId);
    await updateEntity('meetings', meetingId, {
      dismissedSuggestionIds: change(meeting.dismissedSuggestionIds ?? []),
    });
  });
}

/** "Ahora no": no se sugiere en esta reunión. El seguimiento sigue abierto en Seguimientos. */
export function dismissSuggestion(meetingId: Id, followUpId: Id): Promise<void> {
  return changeDismissed(meetingId, (ids) =>
    ids.includes(followUpId) ? ids : [...ids, followUpId],
  );
}

export function restoreSuggestions(meetingId: Id): Promise<void> {
  return changeDismissed(meetingId, () => []);
}
