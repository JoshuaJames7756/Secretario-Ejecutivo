import type {
  InterviewAppointment,
  InterviewRequest,
  InterviewRequestStatus,
  Leader,
  LeaderAvailability,
  Organization,
} from '@/db/types';
import { toDateString } from '@/features/followups/model';

export const LEADERS: Leader[] = ['presidente', 'primer_consejero', 'segundo_consejero'];

export const LEADER_LABEL: Record<Leader, string> = {
  presidente: 'Presidente de estaca',
  primer_consejero: 'Primer consejero',
  segundo_consejero: 'Segundo consejero',
};

/** Para frases como «con el presidente de estaca». */
export const LEADER_WITH: Record<Leader, string> = {
  presidente: 'el presidente de estaca',
  primer_consejero: 'el primer consejero de la presidencia de estaca',
  segundo_consejero: 'el segundo consejero de la presidencia de estaca',
};

export const REQUEST_STATUS_LABEL: Record<InterviewRequestStatus, string> = {
  recibida: 'Recibida',
  pendiente_coordinacion: 'Pendiente de coordinación',
  programada: 'Programada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  reprogramada: 'Reprogramada',
};

export const WEEKDAY_LABEL = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** Orden de lunes a domingo para mostrar. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function isRequestOpen(status: InterviewRequestStatus): boolean {
  return status === 'recibida' || status === 'pendiente_coordinacion' || status === 'programada';
}

/* ---------- Sugerencia de líder ---------- */

export interface LeaderSuggestion {
  leader?: Leader;
  reason: string;
}

/**
 * Con quién coordinar. Se SUGIERE, no se impone (salvo que deba ser con el presidente):
 * 1. Si debe ser con el presidente, se respeta siempre.
 * 2. Si la solicitud pide un líder concreto, ese.
 * 3. Si no, el consejero asignado al barrio o rama.
 */
export function suggestLeader(
  request: Pick<InterviewRequest, 'mustBeWithPresident' | 'requestedLeader'>,
  organization?: Pick<Organization, 'name' | 'assignedLeader'>,
): LeaderSuggestion {
  if (request.mustBeWithPresident) {
    return { leader: 'presidente', reason: 'La solicitud indica que debe ser con el presidente.' };
  }
  if (request.requestedLeader) {
    return { leader: request.requestedLeader, reason: 'Es el líder que pidió la solicitud.' };
  }
  if (organization?.assignedLeader) {
    return {
      leader: organization.assignedLeader,
      reason: `Es el consejero asignado a ${organization.name}.`,
    };
  }
  return { reason: 'No hay un consejero asignado a este barrio. Elige un líder.' };
}

/* ---------- Horarios ---------- */

interface Interval {
  start: number;
  end: number;
}

const MS_MIN = 60_000;

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function subtract(from: Interval[], remove: Interval[]): Interval[] {
  let result = from;
  for (const r of remove) {
    result = result.flatMap((i) => {
      if (r.end <= i.start || r.start >= i.end) return [i];
      const parts: Interval[] = [];
      if (r.start > i.start) parts.push({ start: i.start, end: r.start });
      if (r.end < i.end) parts.push({ start: r.end, end: i.end });
      return parts;
    });
  }
  return result;
}

function rulesFor(rules: LeaderAvailability[], leader: Leader, date: Date) {
  const key = toDateString(date);
  const weekday = date.getDay();
  const mine = rules.filter((r) => r.leader === leader && r.deletedAt === undefined);
  return mine.filter((r) => (r.date ? r.date === key : r.weekday === weekday));
}

/** Tramos libres de un día: disponible menos no disponible. */
export function freeWindows(rules: LeaderAvailability[], leader: Leader, date: Date): Interval[] {
  const today = rulesFor(rules, leader, date);
  const available = merge(
    today.filter((r) => r.kind === 'disponible').map((r) => ({ start: r.startMin, end: r.endMin })),
  );
  const blocked = today
    .filter((r) => r.kind === 'no_disponible')
    .map((r) => ({ start: r.startMin, end: r.endMin }));
  return subtract(available, blocked);
}

function hasAnyAvailability(rules: LeaderAvailability[], leader: Leader): boolean {
  return rules.some(
    (r) => r.leader === leader && r.deletedAt === undefined && r.kind === 'disponible',
  );
}

export type SlotIssueKind =
  'conflicto' | 'cruza_medianoche' | 'no_disponible' | 'fuera_de_disponibilidad';

export interface SlotIssue {
  kind: SlotIssueKind;
  message: string;
  /** Los conflictos con otra cita nunca se pueden anular. El resto, solo de forma expresa. */
  overridable: boolean;
}

export interface SlotCheck {
  leader: Leader;
  startsAt: number;
  durationMin: number;
  rules: LeaderAvailability[];
  appointments: InterviewAppointment[];
  /** Al reprogramar, la cita que se mueve no debe chocar consigo misma. */
  ignoreAppointmentId?: string;
}

const timeFmt = new Intl.DateTimeFormat('es-BO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function checkSlot(input: SlotCheck): SlotIssue[] {
  const issues: SlotIssue[] = [];
  const start = new Date(input.startsAt);
  const end = new Date(input.startsAt + input.durationMin * MS_MIN);
  const s = minutesOfDay(start);
  const e = s + input.durationMin;

  if (
    toDateString(start) !== toDateString(end) &&
    !(end.getHours() === 0 && end.getMinutes() === 0)
  ) {
    issues.push({
      kind: 'cruza_medianoche',
      message: 'La cita no puede cruzar la medianoche.',
      overridable: false,
    });
    return issues;
  }

  // Regla dura: nunca dos citas simultáneas con el mismo líder.
  const clash = input.appointments.find(
    (a) =>
      a.leader === input.leader &&
      a.deletedAt === undefined &&
      a.status === 'programada' &&
      a.id !== input.ignoreAppointmentId &&
      a.startsAt < input.startsAt + input.durationMin * MS_MIN &&
      input.startsAt < a.startsAt + a.durationMin * MS_MIN,
  );
  if (clash) {
    issues.push({
      kind: 'conflicto',
      message: `${LEADER_LABEL[input.leader]} ya tiene una cita de ${timeFmt.format(
        new Date(clash.startsAt),
      )} a ${timeFmt.format(new Date(clash.startsAt + clash.durationMin * MS_MIN))}.`,
      overridable: false,
    });
  }

  const day = rulesFor(input.rules, input.leader, start);
  const blockedHit = day.some((r) => r.kind === 'no_disponible' && r.startMin < e && s < r.endMin);
  if (blockedHit) {
    issues.push({
      kind: 'no_disponible',
      message: `${LEADER_LABEL[input.leader]} marcó este horario como no disponible.`,
      overridable: true,
    });
  } else if (hasAnyAvailability(input.rules, input.leader)) {
    const inside = freeWindows(input.rules, input.leader, start).some(
      (w) => w.start <= s && e <= w.end,
    );
    if (!inside) {
      issues.push({
        kind: 'fuera_de_disponibilidad',
        message: `Está fuera de la disponibilidad configurada para ${LEADER_LABEL[input.leader]}.`,
        overridable: true,
      });
    }
  }
  return issues;
}

/** Próximos horarios libres (sin conflictos) dentro de la disponibilidad configurada. */
export function suggestSlots(input: {
  leader: Leader;
  from: number;
  durationMin: number;
  rules: LeaderAvailability[];
  appointments: InterviewAppointment[];
  days?: number;
  stepMin?: number;
  max?: number;
}): number[] {
  const { leader, from, durationMin, rules, appointments } = input;
  const days = input.days ?? 21;
  const step = input.stepMin ?? 30;
  const max = input.max ?? 8;
  if (!hasAnyAvailability(rules, leader)) return [];

  const slots: number[] = [];
  const first = new Date(from);
  for (let d = 0; d < days && slots.length < max; d += 1) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + d);
    for (const w of freeWindows(rules, leader, day)) {
      const begin = Math.ceil(w.start / step) * step;
      for (let m = begin; m + durationMin <= w.end && slots.length < max; m += step) {
        const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m).getTime();
        if (startsAt < from) continue;
        const clash = checkSlot({ leader, startsAt, durationMin, rules, appointments }).some(
          (i) => i.kind === 'conflicto',
        );
        if (!clash) slots.push(startsAt);
      }
    }
  }
  return slots;
}

/* ---------- Mensaje de confirmación ---------- */

const longDate = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Borrador de mensaje para WhatsApp. La aplicación NO lo envía: se copia y la persona lo revisa.
 * No incluye el motivo de la entrevista ni ningún dato confidencial.
 */
export function confirmationMessage(input: {
  personName: string;
  leader: Leader;
  startsAt: number;
  durationMin: number;
}): string {
  const date = longDate.format(new Date(input.startsAt));
  const time = timeFmt.format(new Date(input.startsAt));
  const first = input.personName.trim().split(/\s+/)[0] ?? input.personName;
  return [
    `Hola ${first}, le saludo de parte de la presidencia de la Estaca Blanco Galindo.`,
    `Su entrevista con ${LEADER_WITH[input.leader]} quedó programada para el ${date} a las ${time} (duración aproximada: ${input.durationMin} minutos).`,
    'Por favor confirme si podrá asistir. Si necesita cambiar el horario, avíseme con anticipación.',
    '¡Gracias!',
  ].join('\n\n');
}
