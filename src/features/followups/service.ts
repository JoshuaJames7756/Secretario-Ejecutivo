import { db } from '@/db/database';
import { createEntity, runInTransaction, updateEntity, RecordNotFoundError } from '@/db/repo';
import type { FollowUp, FollowUpStatus, Id } from '@/db/types';
import { INITIAL_STATUS, isClosedStatus, titleFromText, type FollowUpKind } from './model';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface NewFollowUpInput {
  kind: FollowUpKind;
  text: string;
  assignee?: string;
  dueDate?: string;
  organizationId?: Id;
  originMeetingId?: Id;
  originAgendaItemId?: Id;
  originRecordId?: Id;
}

/** Crea un asunto o una asignación. Nunca se crea solo: siempre por una acción de la persona. */
export async function createFollowUp(input: NewFollowUpInput): Promise<FollowUp> {
  const text = input.text.trim();
  if (!text) throw new ValidationError('Escribe el asunto antes de guardarlo.');
  const title = titleFromText(text);
  return createEntity('followUps', {
    title,
    description: text.length > title.length ? text : undefined,
    kind: input.kind,
    status: INITIAL_STATUS[input.kind],
    assignee: input.assignee?.trim() || undefined,
    dueDate: input.dueDate || undefined,
    organizationId: input.organizationId,
    originMeetingId: input.originMeetingId,
    originAgendaItemId: input.originAgendaItemId,
    originRecordId: input.originRecordId,
  });
}

/** Cambia el estado. Al cerrar se registra la fecha de cierre; al reabrir se quita. */
export async function setFollowUpStatus(id: Id, status: FollowUpStatus): Promise<FollowUp> {
  return runInTransaction(async () => {
    const current = await db.followUps.get(id);
    if (!current || current.deletedAt !== undefined) throw new RecordNotFoundError('followUps', id);
    if (current.status === status) return current;
    return updateEntity('followUps', id, {
      status,
      closedAt: isClosedStatus(status) ? Date.now() : undefined,
    });
  });
}

export interface FollowUpDetails {
  assignee?: string;
  dueDate?: string;
  nextReviewDate?: string;
}

export async function updateFollowUpDetails(id: Id, details: FollowUpDetails): Promise<FollowUp> {
  return updateEntity('followUps', id, {
    assignee: details.assignee?.trim() || undefined,
    dueDate: details.dueDate || undefined,
    nextReviewDate: details.nextReviewDate || undefined,
  });
}
