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
  InterviewKind,
  InterviewRequest,
  Leader,
  LeaderAvailability,
  Organization,
} from '@/db/types';
import { ValidationError } from '@/features/followups/service';
import { getSetting, setSetting } from '@/db/settings';
import {
  DEFAULT_DURATION_MIN,
  KIND_INFO,
  LEADER_LABEL,
  PRESIDENCY_SETTING_KEY,
  normalizePhone,
  checkSlot,
  type PresidencyNames,
  type SlotIssue,
} from './model';

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

/** Apellidos de la presidencia de estaca (se muestran en la imagen y en los mensajes). */
export async function getPresidencyNames(): Promise<PresidencyNames> {
  return (await getSetting<PresidencyNames>(PRESIDENCY_SETTING_KEY)) ?? {};
}

export async function setPresidencyName(leader: Leader, surname: string): Promise<void> {
  const current = await getPresidencyNames();
  const clean = surname.trim().slice(0, 40);
  const next = { ...current };
  if (clean) next[leader] = clean;
  else delete next[leader];
  await setSetting(PRESIDENCY_SETTING_KEY, next);
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
  treatment?: 'hermano' | 'hermana';
  kind?: InterviewKind;
  kindDetail?: string;
  modality?: 'presencial' | 'virtual';
  phone?: string;
  organizationId?: Id;
  requestedLeader?: Leader;
  notes?: string;
}

/** Solo datos administrativos. Nunca el motivo detallado ni el contenido de la entrevista. */
export async function createRequest(input: NewRequestInput): Promise<InterviewRequest> {
  const personName = input.personName.trim();
  if (!personName) throw new ValidationError('Escribe el nombre de la persona.');
  const kind = input.kind ?? 'otro';
  const mustBeWithPresident = KIND_INFO[kind].rule === 'obligatorio';
  const phone = normalizePhone(input.phone);
  if (phone === null) throw new ValidationError('El número de WhatsApp no parece válido.');
  return createEntity('interviewRequests', {
    personName,
    treatment: input.treatment ?? 'hermano',
    kind,
    kindDetail: kind === 'llamamiento' ? input.kindDetail?.trim() || undefined : undefined,
    modality: input.modality ?? 'presencial',
    phone,
    organizationId: input.organizationId || undefined,
    receivedAt: Date.now(),
    requestedLeader: mustBeWithPresident ? 'presidente' : input.requestedLeader || undefined,
    mustBeWithPresident,
    status: 'recibida',
    notes: input.notes?.trim() || undefined,
  });
}

export function updateRequest(id: Id, patch: NewRequestInput): Promise<InterviewRequest> {
  const personName = patch.personName.trim();
  if (!personName) throw new ValidationError('Escribe el nombre de la persona.');
  const kind = patch.kind ?? 'otro';
  const mustBeWithPresident = KIND_INFO[kind].rule === 'obligatorio';
  const phone = normalizePhone(patch.phone);
  if (phone === null) throw new ValidationError('El número de WhatsApp no parece válido.');
  return updateEntity('interviewRequests', id, {
    personName,
    treatment: patch.treatment ?? 'hermano',
    kind,
    kindDetail: kind === 'llamamiento' ? patch.kindDetail?.trim() || undefined : undefined,
    modality: patch.modality ?? 'presencial',
    phone,
    organizationId: patch.organizationId || undefined,
    requestedLeader: mustBeWithPresident ? 'presidente' : patch.requestedLeader || undefined,
    mustBeWithPresident,
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
  /** Día especial: fuera del horario habitual de entrevistas. No exige disponibilidad. */
  special?: boolean;
  /** El presidente autorizó que un consejero haga una entrevista que le corresponde a él. */
  presidentAuthorized?: boolean;
}

async function verifySlot(input: ScheduleInput, ignoreAppointmentId?: Id): Promise<void> {
  if (!Number.isFinite(input.startsAt)) throw new ValidationError('Indica la fecha y la hora.');
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
    rules,
    appointments,
    ignoreAppointmentId,
  });
  const blocking = issues.filter((i) => !i.overridable || !input.special);
  if (blocking.length > 0) throw new SlotUnavailableError(issues);
}

function assertLeaderAllowed(
  request: Pick<InterviewRequest, 'mustBeWithPresident' | 'kind'>,
  leader: Leader,
  presidentAuthorized?: boolean,
): void {
  if (request.mustBeWithPresident && leader !== 'presidente' && !presidentAuthorized) {
    throw new ValidationError(
      `${KIND_INFO[request.kind ?? 'otro'].label}: la realiza el presidente de estaca. Si él autorizó a un consejero por urgencia, márcalo.`,
    );
  }
}

/**
 * Programa una cita. La comprobación del bloque y el guardado ocurren en la misma transacción,
 * así nunca se superan las 3 entrevistas por bloque de media hora.
 */
export async function scheduleAppointment(input: ScheduleInput): Promise<InterviewAppointment> {
  return runInTransaction(async () => {
    const request = await activeRequest(input.requestId);
    if (!['recibida', 'pendiente_coordinacion', 'reprogramada'].includes(request.status)) {
      throw new ValidationError('Esta solicitud ya tiene una cita o fue cerrada.');
    }
    assertLeaderAllowed(request, input.leader, input.presidentAuthorized);
    await verifySlot(input);
    const appointment = await createEntity('interviewAppointments', {
      requestId: request.id,
      leader: input.leader,
      startsAt: input.startsAt,
      durationMin: DEFAULT_DURATION_MIN,
      status: 'programada',
      confirmed: false,
      special: input.special ?? false,
    });
    await updateEntity('interviewRequests', request.id, { status: 'programada', waitlist: false });
    await setSetting(LAST_TIME_KEY, timeOfDay(input.startsAt));
    return appointment;
  });
}

export const LAST_TIME_KEY = 'interviews.lastTime';

function timeOfDay(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Marca que ya se le mandó el mensaje a esta persona (para pasar a recordatorio). */
export async function markContacted(appointmentId: Id): Promise<InterviewAppointment> {
  const appointment = await activeAppointment(appointmentId);
  if (appointment.status !== 'programada') {
    throw new ValidationError('Solo una cita programada se puede avisar.');
  }
  return updateEntity('interviewAppointments', appointmentId, { contactedAt: Date.now() });
}

/** Registra la persona y la agenda en un solo paso (todo o nada). */
export async function createAndSchedule(
  request: NewRequestInput,
  slot: Omit<ScheduleInput, 'requestId'>,
): Promise<{ request: InterviewRequest; appointment: InterviewAppointment }> {
  return runInTransaction(async () => {
    const created = await createRequest(request);
    const appointment = await scheduleAppointment({ ...slot, requestId: created.id });
    return { request: created, appointment };
  });
}

/** Mueve la cita. La anterior queda como «reprogramada» para conservar el historial. */
export async function rescheduleAppointment(
  appointmentId: Id,
  next: Omit<ScheduleInput, 'requestId'>,
): Promise<InterviewAppointment> {
  return runInTransaction(async () => {
    const current = await activeAppointment(appointmentId);
    if (current.status !== 'programada') {
      throw new ValidationError('Solo se puede reprogramar una cita programada.');
    }
    const request = await activeRequest(current.requestId);
    assertLeaderAllowed(request, next.leader, next.presidentAuthorized);
    await verifySlot({ requestId: request.id, ...next }, current.id);
    await updateEntity('interviewAppointments', current.id, { status: 'reprogramada' });
    return createEntity('interviewAppointments', {
      requestId: request.id,
      leader: next.leader,
      startsAt: next.startsAt,
      durationMin: DEFAULT_DURATION_MIN,
      status: 'programada',
      confirmed: false,
      special: next.special ?? false,
    });
  });
}

/** Marca si la persona confirmó que asistirá. */
export async function setConfirmed(
  appointmentId: Id,
  confirmed: boolean,
): Promise<InterviewAppointment> {
  const appointment = await activeAppointment(appointmentId);
  if (appointment.status !== 'programada') {
    throw new ValidationError('Solo una cita programada se puede confirmar.');
  }
  return updateEntity('interviewAppointments', appointmentId, { confirmed });
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
