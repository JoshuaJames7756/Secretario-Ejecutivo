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
  Id,
  InterviewAppointment,
  InterviewRequest,
  Leader,
  LeaderAvailability,
  Organization,
} from '@/db/types';
import { ValidationError } from '@/features/followups/service';
import { LEADER_LABEL, checkSlot, type SlotIssue } from './model';

export { ValidationError };

/** Se rechaza el horario. `issues` explica por qué; `overridable` dice si se puede anular. */
export class SlotUnavailableError extends Error {
  issues: SlotIssue[];
  constructor(issues: SlotIssue[]) {
    super(issues.map((i) => i.message).join(' '));
    this.name = 'SlotUnavailableError';
    this.issues = issues;
  }
}

/* ---------- Barrios, ramas y organizaciones ---------- */

export async function createOrganization(input: {
  name: string;
  category: Organization['category'];
  assignedLeader?: Leader;
}): Promise<Organization> {
  const name = input.name.trim();
  if (!name) throw new ValidationError('Escribe el nombre del barrio o la rama.');
  const exists = await db.organizations
    .filter((o) => isActive(o) && o.name.toLowerCase() === name.toLowerCase())
    .count();
  if (exists > 0) throw new ValidationError('Ya existe uno con ese nombre.');
  return createEntity('organizations', {
    name,
    category: input.category,
    status: 'activa',
    assignedLeader: input.assignedLeader,
  });
}

export function setOrganizationLeader(id: Id, assignedLeader?: Leader): Promise<Organization> {
  return updateEntity('organizations', id, { assignedLeader });
}

export function setOrganizationStatus(
  id: Id,
  status: Organization['status'],
): Promise<Organization> {
  return updateEntity('organizations', id, { status });
}

/* ---------- Disponibilidad ---------- */

export interface AvailabilityInput {
  leader: Leader;
  kind: LeaderAvailability['kind'];
  /** Semanal (0 = domingo ... 6 = sábado) o una fecha concreta AAAA-MM-DD. */
  weekday?: number;
  date?: string;
  startMin: number;
  endMin: number;
  note?: string;
}

export async function addAvailability(input: AvailabilityInput): Promise<LeaderAvailability> {
  if (input.weekday === undefined && !input.date) {
    throw new ValidationError('Elige un día de la semana o una fecha.');
  }
  if (!(input.startMin >= 0 && input.endMin <= 24 * 60 && input.startMin < input.endMin)) {
    throw new ValidationError('La hora de fin debe ser posterior a la de inicio.');
  }
  return createEntity('leaderAvailability', {
    leader: input.leader,
    kind: input.kind,
    weekday: input.date ? undefined : input.weekday,
    date: input.date || undefined,
    startMin: input.startMin,
    endMin: input.endMin,
    note: input.note?.trim() || undefined,
  });
}

export async function removeAvailability(id: Id): Promise<void> {
  await softDeleteEntity('leaderAvailability', id);
}

/* ---------- Solicitudes ---------- */

export interface NewRequestInput {
  personName: string;
  organizationId?: Id;
  requestedBy?: string;
  receivedAt?: number;
  requestedLeader?: Leader;
  mustBeWithPresident?: boolean;
  timePreferences?: string;
  notes?: string;
}

/** Solo datos administrativos. Nunca el motivo ni el contenido de la entrevista. */
export async function createRequest(input: NewRequestInput): Promise<InterviewRequest> {
  const personName = input.personName.trim();
  if (!personName) throw new ValidationError('Escribe el nombre de la persona.');
  return createEntity('interviewRequests', {
    personName,
    organizationId: input.organizationId || undefined,
    requestedBy: input.requestedBy?.trim() || undefined,
    receivedAt: input.receivedAt ?? Date.now(),
    requestedLeader: input.mustBeWithPresident ? 'presidente' : input.requestedLeader || undefined,
    mustBeWithPresident: input.mustBeWithPresident ?? false,
    timePreferences: input.timePreferences?.trim() || undefined,
    status: 'recibida',
    notes: input.notes?.trim() || undefined,
  });
}

export function updateRequest(
  id: Id,
  patch: Pick<
    NewRequestInput,
    | 'personName'
    | 'organizationId'
    | 'requestedBy'
    | 'requestedLeader'
    | 'mustBeWithPresident'
    | 'timePreferences'
    | 'notes'
  >,
): Promise<InterviewRequest> {
  const personName = patch.personName.trim();
  if (!personName) throw new ValidationError('Escribe el nombre de la persona.');
  return updateEntity('interviewRequests', id, {
    personName,
    organizationId: patch.organizationId || undefined,
    requestedBy: patch.requestedBy?.trim() || undefined,
    requestedLeader: patch.mustBeWithPresident ? 'presidente' : patch.requestedLeader || undefined,
    mustBeWithPresident: patch.mustBeWithPresident ?? false,
    timePreferences: patch.timePreferences?.trim() || undefined,
    notes: patch.notes?.trim() || undefined,
  });
}

async function activeRequest(id: Id): Promise<InterviewRequest> {
  const request = await db.interviewRequests.get(id);
  if (!request || !isActive(request)) throw new RecordNotFoundError('interviewRequests', id);
  return request;
}

async function activeAppointment(id: Id): Promise<InterviewAppointment> {
  const appointment = await db.interviewAppointments.get(id);
  if (!appointment || !isActive(appointment)) {
    throw new RecordNotFoundError('interviewAppointments', id);
  }
  return appointment;
}

/* ---------- Citas ---------- */

export interface ScheduleInput {
  requestId: Id;
  leader: Leader;
  startsAt: number;
  durationMin: number;
  /** Anula avisos de disponibilidad. Nunca anula un choque con otra cita. */
  overrideAvailability?: boolean;
}

async function verifySlot(input: ScheduleInput, ignoreAppointmentId?: Id): Promise<void> {
  if (!Number.isFinite(input.startsAt)) throw new ValidationError('Indica la fecha y la hora.');
  if (!(input.durationMin >= 5 && input.durationMin <= 240)) {
    throw new ValidationError('La duración debe estar entre 5 y 240 minutos.');
  }
  const [rules, appointments] = await Promise.all([
    db.leaderAvailability.where('leader').equals(input.leader).filter(isActive).toArray(),
    db.interviewAppointments
      .where('[leader+startsAt]')
      .between([input.leader, Dexie.minKey], [input.leader, Dexie.maxKey])
      .filter(isActive)
      .toArray(),
  ]);
  const issues = checkSlot({
    leader: input.leader,
    startsAt: input.startsAt,
    durationMin: input.durationMin,
    rules,
    appointments,
    ignoreAppointmentId,
  });
  const blocking = issues.filter((i) => !i.overridable || !input.overrideAvailability);
  if (blocking.length > 0) throw new SlotUnavailableError(issues);
}

/**
 * Programa una cita. La comprobación de conflictos y el guardado ocurren en la misma
 * transacción, así dos citas simultáneas con el mismo líder no pueden coexistir.
 */
export async function scheduleAppointment(input: ScheduleInput): Promise<InterviewAppointment> {
  return runInTransaction(async () => {
    const request = await activeRequest(input.requestId);
    if (!['recibida', 'pendiente_coordinacion', 'reprogramada'].includes(request.status)) {
      throw new ValidationError('Esta solicitud ya tiene una cita o fue cerrada.');
    }
    if (request.mustBeWithPresident && input.leader !== 'presidente') {
      throw new ValidationError('Esta entrevista debe ser con el presidente de estaca.');
    }
    await verifySlot(input);
    const appointment = await createEntity('interviewAppointments', {
      requestId: request.id,
      leader: input.leader,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      status: 'programada',
    });
    await updateEntity('interviewRequests', request.id, { status: 'programada', waitlist: false });
    return appointment;
  });
}

/** Mueve la cita. La anterior queda como «reprogramada» para conservar el historial. */
export async function rescheduleAppointment(
  appointmentId: Id,
  next: { leader: Leader; startsAt: number; durationMin: number; overrideAvailability?: boolean },
): Promise<InterviewAppointment> {
  return runInTransaction(async () => {
    const current = await activeAppointment(appointmentId);
    if (current.status !== 'programada') {
      throw new ValidationError('Solo se puede reprogramar una cita programada.');
    }
    const request = await activeRequest(current.requestId);
    if (request.mustBeWithPresident && next.leader !== 'presidente') {
      throw new ValidationError('Esta entrevista debe ser con el presidente de estaca.');
    }
    await verifySlot({ requestId: request.id, ...next }, current.id);
    await updateEntity('interviewAppointments', current.id, { status: 'reprogramada' });
    return createEntity('interviewAppointments', {
      requestId: request.id,
      leader: next.leader,
      startsAt: next.startsAt,
      durationMin: next.durationMin,
      status: 'programada',
    });
  });
}

export async function completeAppointment(appointmentId: Id): Promise<void> {
  await runInTransaction(async () => {
    const appointment = await activeAppointment(appointmentId);
    if (appointment.status !== 'programada') {
      throw new ValidationError('Solo se puede completar una cita programada.');
    }
    await updateEntity('interviewAppointments', appointment.id, { status: 'completada' });
    await updateEntity('interviewRequests', appointment.requestId, { status: 'completada' });
  });
}

/** Cancela la cita y deja la solicitud pendiente de coordinar un nuevo horario. */
export async function cancelAppointment(appointmentId: Id): Promise<void> {
  await runInTransaction(async () => {
    const appointment = await activeAppointment(appointmentId);
    if (appointment.status !== 'programada') {
      throw new ValidationError('Solo se puede cancelar una cita programada.');
    }
    await updateEntity('interviewAppointments', appointment.id, { status: 'cancelada' });
    await updateEntity('interviewRequests', appointment.requestId, {
      status: 'pendiente_coordinacion',
    });
  });
}

/** Cancela la solicitud completa y libera su horario. */
export async function cancelRequest(requestId: Id): Promise<void> {
  await runInTransaction(async () => {
    const request = await activeRequest(requestId);
    if (request.status === 'completada' || request.status === 'cancelada') {
      throw new ValidationError('Esta solicitud ya está cerrada.');
    }
    const open = await db.interviewAppointments
      .where('requestId')
      .equals(requestId)
      .filter((a) => isActive(a) && a.status === 'programada')
      .toArray();
    for (const a of open) {
      await updateEntity('interviewAppointments', a.id, { status: 'cancelada' });
    }
    await updateEntity('interviewRequests', requestId, { status: 'cancelada', waitlist: false });
  });
}

/** Lista de espera: no hay horario todavía. Conserva la fecha de recepción y las preferencias. */
export async function setWaitlist(requestId: Id, waitlist: boolean): Promise<InterviewRequest> {
  return runInTransaction(async () => {
    const request = await activeRequest(requestId);
    if (!['recibida', 'pendiente_coordinacion'].includes(request.status)) {
      throw new ValidationError('Solo una solicitud sin cita puede estar en lista de espera.');
    }
    return updateEntity('interviewRequests', requestId, {
      waitlist,
      status: waitlist ? 'pendiente_coordinacion' : request.status,
    });
  });
}

export function leaderName(leader: Leader): string {
  return LEADER_LABEL[leader];
}
