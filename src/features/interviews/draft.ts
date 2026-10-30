import type {
  InterviewAppointment,
  InterviewRequest,
  Leader,
  LeaderAvailability,
} from '@/db/types';
import { checkSlot, type SlotIssue } from './model';

/** Lo que la persona va eligiendo al agendar. */
export interface SlotDraft {
  /** AAAA-MM-DD */
  date: string;
  /** HH:mm, vacío hasta que elija un bloque u hora. */
  time: string;
  special: boolean;
  /** El presidente autorizó a un consejero en una entrevista que le corresponde a él. */
  authorized: boolean;
}

export function draftStartsAt(draft: Pick<SlotDraft, 'date' | 'time'>): number {
  if (!draft.date || !draft.time) return Number.NaN;
  return new Date(`${draft.date}T${draft.time}`).getTime();
}

export interface DraftEvaluation {
  startsAt: number;
  issues: SlotIssue[];
  hardBlock: boolean;
  softIssues: SlotIssue[];
  needsAuthorization: boolean;
  canSubmit: boolean;
}

export function evaluateDraft(input: {
  draft: SlotDraft;
  leader: Leader;
  request: Pick<InterviewRequest, 'mustBeWithPresident' | 'kind'>;
  data?: { rules: LeaderAvailability[]; appointments: InterviewAppointment[] };
  ignoreAppointmentId?: string;
}): DraftEvaluation {
  const { draft, leader, request, data } = input;
  const startsAt = draftStartsAt(draft);
  const valid = Number.isFinite(startsAt);
  const issues =
    data && valid
      ? checkSlot({
          leader,
          startsAt,
          rules: data.rules,
          appointments: data.appointments,
          ignoreAppointmentId: input.ignoreAppointmentId,
        })
      : [];
  const hardBlock = issues.some((i) => !i.overridable);
  const softIssues = issues.filter((i) => i.overridable);
  const needsAuthorization =
    request.mustBeWithPresident && leader !== 'presidente' && !draft.authorized;
  const canSubmit =
    valid &&
    data !== undefined &&
    !hardBlock &&
    (softIssues.length === 0 || draft.special) &&
    !needsAuthorization;
  return { startsAt, issues, hardBlock, softIssues, needsAuthorization, canSubmit };
}
