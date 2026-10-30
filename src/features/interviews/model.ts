import type {
  InterviewAppointment,
  InterviewKind,
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

/* ---------- Motivo de la entrevista y quién la realiza ---------- */

/**
 * - obligatorio: según el Manual la realiza el presidente de estaca; un consejero solo en un caso
 *   urgente que el presidente autorice.
 * - sugerido: lo habitual es el presidente, pero el Manual no lo exige.
 * - libre: puede realizarla un consejero asignado.
 */
export type LeaderRule = 'obligatorio' | 'sugerido' | 'libre';

export interface KindInfo {
  label: string;
  rule: LeaderRule;
  /** Sección del Manual General de 2020 que respalda la regla. */
  manualRef?: string;
  /** Texto corto para explicar la regla en pantalla. */
  note: string;
  /** La regla no se pudo comprobar en el Manual; Joshua debe confirmarla. */
  toVerify?: boolean;
}

export const KIND_ORDER: InterviewKind[] = [
  'renovacion_recomendacion',
  'investidura',
  'obrero_templo',
  'llamamiento',
  'melquisedec',
  'pathway',
  'mision',
  'dignidad',
  'personal',
  'otro',
];

export const KIND_INFO: Record<InterviewKind, KindInfo> = {
  renovacion_recomendacion: {
    label: 'Renovación de recomendación',
    rule: 'libre',
    manualRef: '26.3.2 y 31.1.4',
    note: 'Puede realizarla un consejero de la presidencia de estaca.',
  },
  investidura: {
    label: 'Investidura',
    rule: 'obligatorio',
    manualRef: '26.3.3 y 31.1.3',
    note: 'La realiza el presidente de estaca. Un consejero solo en un caso urgente que él autorice.',
  },
  obrero_templo: {
    label: 'Obrera u obrero del templo',
    rule: 'libre',
    manualRef: '25.5',
    note: 'No pude comprobar en el Manual quién la realiza. Confírmalo con el presidente.',
    toVerify: true,
  },
  llamamiento: {
    label: 'Llamamiento',
    rule: 'libre',
    manualRef: '30.8 y 31.1.4',
    note: 'Puede realizarla un consejero. Los llamamientos de obispos, patriarcas y consejeros de estaca los hace el presidente.',
  },
  melquisedec: {
    label: 'Sacerdocio de Melquisedec',
    rule: 'libre',
    manualRef: '38.2.5.1 y 31.1.4',
    note: 'La ordenación a élder o sumo sacerdote puede entrevistarla un consejero.',
  },
  pathway: {
    label: 'BYU Pathway',
    rule: 'libre',
    manualRef: '15.3 y 31.1.4',
    note: 'La recomendación para una institución educativa de la Iglesia puede hacerla un consejero.',
  },
  mision: {
    label: 'Misión',
    rule: 'obligatorio',
    manualRef: '24.4.2 y 31.1.3',
    note: 'La realiza el presidente de estaca. Un consejero solo si él lo autoriza por urgencia.',
  },
  dignidad: {
    label: 'Dignidad',
    rule: 'sugerido',
    manualRef: '31.1.3 y 31.1.6',
    note: 'La ayuda para arrepentirse de pecados graves corresponde al presidente. Los consejeros pueden hacer entrevistas de dignidad en otros casos.',
  },
  personal: {
    label: 'Personal',
    rule: 'libre',
    manualRef: '31.2.1',
    note: 'El presidente puede delegarla en sus consejeros, salvo transgresiones graves.',
  },
  otro: {
    label: 'Otro',
    rule: 'libre',
    note: 'Sin regla particular.',
  },
};

export function kindOf(request: Pick<InterviewRequest, 'kind'>): InterviewKind {
  return request.kind ?? 'otro';
}

/** Texto que ven los presidentes: «Llamamiento: Presidenta de la Primaria». */
export function reasonLabel(request: Pick<InterviewRequest, 'kind' | 'kindDetail'>): string {
  const base = KIND_INFO[kindOf(request)].label;
  const detail = request.kindDetail?.trim();
  return request.kind === 'llamamiento' && detail ? `${base}: ${detail}` : base;
}

/** Un color suave por líder para reconocerlos de un vistazo (lista e imagen). */
export const LEADER_COLOR: Record<Leader, string> = {
  presidente: '#12296b',
  primer_consejero: '#0f766e',
  segundo_consejero: '#7c3aed',
};

export const MODALITY_LABEL = { presencial: 'Presencial', virtual: 'Virtual' } as const;
export const TREATMENT_LABEL = { hermano: 'Hermano', hermana: 'Hermana' } as const;

/* ---------- Presidencia de estaca (apellidos editables) ---------- */

export type PresidencyNames = Partial<Record<Leader, string>>;

export const PRESIDENCY_SETTING_KEY = 'interviews.presidencyNames';

/** «Presidente Rojas», o «Presidente de estaca» si todavía no se escribió el apellido. */
export function leaderShort(leader: Leader, names: PresidencyNames = {}): string {
  const surname = names[leader]?.trim();
  const role =
    leader === 'presidente'
      ? 'Presidente'
      : leader === 'primer_consejero'
        ? '1.er consejero'
        : '2.º consejero';
  return surname ? `${role} ${surname}` : LEADER_LABEL[leader];
}

/** Solo el apellido (o el cargo si falta) para la imagen que se comparte. */
export function leaderSurname(leader: Leader, names: PresidencyNames = {}): string {
  return names[leader]?.trim() || LEADER_LABEL[leader];
}

/* ---------- Sugerencia de líder ---------- */

export interface LeaderSuggestion {
  leader?: Leader;
  reason: string;
}

/**
 * Con quién coordinar. Se SUGIERE (salvo que el Manual exija al presidente):
 * 1. Si el motivo lo exige o lo sugiere, el presidente.
 * 2. Si no, el consejero asignado al barrio o rama.
 */
export function suggestLeader(
  request: Pick<InterviewRequest, 'kind' | 'mustBeWithPresident' | 'requestedLeader'>,
  organization?: Pick<Organization, 'name' | 'assignedLeader'>,
): LeaderSuggestion {
  const info = KIND_INFO[kindOf(request)];
  if (request.mustBeWithPresident || info.rule === 'obligatorio') {
    return { leader: 'presidente', reason: `${info.label}: la realiza el presidente de estaca.` };
  }
  if (info.rule === 'sugerido') {
    return { leader: 'presidente', reason: `${info.label}: lo habitual es el presidente.` };
  }
  if (request.requestedLeader) {
    return { leader: request.requestedLeader, reason: 'Elegido al registrar la solicitud.' };
  }
  if (organization?.assignedLeader) {
    return {
      leader: organization.assignedLeader,
      reason: `Es el consejero asignado a ${organization.name}.`,
    };
  }
  return { reason: 'Este barrio no tiene consejero asignado. Elige quién lo entrevista.' };
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

/** Las entrevistas se agendan por bloques de media hora; cada líder admite hasta 3 por bloque. */
export const BLOCK_MIN = 30;
export const MAX_PER_BLOCK = 3;
/** Duración que se guarda internamente. No se muestra: las entrevistas se alargan. */
export const DEFAULT_DURATION_MIN = 30;

export type SlotIssueKind = 'bloque_lleno' | 'no_disponible' | 'fuera_de_disponibilidad';

export interface SlotIssue {
  kind: SlotIssueKind;
  message: string;
  /** Un bloque lleno nunca se supera. La disponibilidad se salta marcando «día especial». */
  overridable: boolean;
}

export interface SlotCheck {
  leader: Leader;
  startsAt: number;
  rules: LeaderAvailability[];
  appointments: InterviewAppointment[];
  /** Al reprogramar, la cita que se mueve no se cuenta contra sí misma. */
  ignoreAppointmentId?: string;
}

/** «8:30 pm»: como lo dice la gente al avisar la hora. */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Inicio (en ms) del bloque de media hora que contiene la hora indicada. */
export function blockStart(epochMs: number): number {
  const d = new Date(epochMs);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const floored = Math.floor(minutes / BLOCK_MIN) * BLOCK_MIN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, floored).getTime();
}

/** Citas programadas de un líder dentro del bloque que contiene `startsAt`. */
export function appointmentsInBlock(
  appointments: InterviewAppointment[],
  leader: Leader,
  startsAt: number,
  ignoreId?: string,
): InterviewAppointment[] {
  const from = blockStart(startsAt);
  const to = from + BLOCK_MIN * MS_MIN;
  return appointments.filter(
    (a) =>
      a.leader === leader &&
      a.deletedAt === undefined &&
      a.status === 'programada' &&
      a.id !== ignoreId &&
      a.startsAt >= from &&
      a.startsAt < to,
  );
}

export function checkSlot(input: SlotCheck): SlotIssue[] {
  const issues: SlotIssue[] = [];
  const start = new Date(input.startsAt);
  const s = minutesOfDay(start);

  const inBlock = appointmentsInBlock(
    input.appointments,
    input.leader,
    input.startsAt,
    input.ignoreAppointmentId,
  );
  if (inBlock.length >= MAX_PER_BLOCK) {
    const from = blockStart(input.startsAt);
    issues.push({
      kind: 'bloque_lleno',
      message: `El bloque de ${formatClock(from)} a ${formatClock(from + BLOCK_MIN * MS_MIN)} de ${LEADER_LABEL[input.leader]} ya tiene ${MAX_PER_BLOCK} entrevistas.`,
      overridable: false,
    });
  }

  const day = rulesFor(input.rules, input.leader, start);
  const blockedHit = day.some((r) => r.kind === 'no_disponible' && r.startMin <= s && s < r.endMin);
  if (blockedHit) {
    issues.push({
      kind: 'no_disponible',
      message: `${LEADER_LABEL[input.leader]} marcó este horario como no disponible.`,
      overridable: true,
    });
  } else if (hasAnyAvailability(input.rules, input.leader)) {
    const inside = freeWindows(input.rules, input.leader, start).some(
      (w) => w.start <= s && s < w.end,
    );
    if (!inside) {
      issues.push({
        kind: 'fuera_de_disponibilidad',
        message: `No es un horario habitual de entrevistas de ${LEADER_LABEL[input.leader]}.`,
        overridable: true,
      });
    }
  }
  return issues;
}

export interface BlockOption {
  /** Inicio del bloque (ms). */
  startsAt: number;
  taken: number;
  full: boolean;
}

/** Bloques de media hora de un día, dentro de la disponibilidad configurada. */
export function blocksForDay(input: {
  leader: Leader;
  day: Date;
  rules: LeaderAvailability[];
  appointments: InterviewAppointment[];
  ignoreAppointmentId?: string;
}): BlockOption[] {
  const { leader, day, rules, appointments } = input;
  if (!hasAnyAvailability(rules, leader)) return [];
  const out: BlockOption[] = [];
  for (const w of freeWindows(rules, leader, day)) {
    const begin = Math.floor(w.start / BLOCK_MIN) * BLOCK_MIN;
    for (let m = begin; m < w.end; m += BLOCK_MIN) {
      const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m).getTime();
      const taken = appointmentsInBlock(
        appointments,
        leader,
        startsAt,
        input.ignoreAppointmentId,
      ).length;
      out.push({ startsAt, taken, full: taken >= MAX_PER_BLOCK });
    }
  }
  return out;
}

/** Próximos días (con al menos un bloque libre) en que el líder suele entrevistar. */
export function upcomingInterviewDays(input: {
  leader: Leader;
  from: number;
  rules: LeaderAvailability[];
  appointments: InterviewAppointment[];
  days?: number;
  max?: number;
}): Date[] {
  const first = new Date(input.from);
  const out: Date[] = [];
  const horizon = input.days ?? 35;
  const max = input.max ?? 4;
  for (let d = 0; d < horizon && out.length < max; d += 1) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + d);
    const free = blocksForDay({ ...input, day }).some(
      (b) => !b.full && b.startsAt + BLOCK_MIN * MS_MIN > input.from,
    );
    if (free) out.push(day);
  }
  return out;
}

/* ---------- Mensaje de confirmación ---------- */

const longDate = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Borrador de mensaje para WhatsApp. La aplicación NO lo envía: se copia y la persona lo revisa.
 * Solo dice la hora (sin duración) y no incluye el motivo ni ningún dato confidencial.
 */
export function confirmationMessage(input: {
  personName: string;
  treatment?: 'hermano' | 'hermana';
  leader: Leader;
  startsAt: number;
  modality?: 'presencial' | 'virtual';
  names?: PresidencyNames;
}): string {
  const date = longDate.format(new Date(input.startsAt));
  const time = formatClock(input.startsAt);
  const first = input.personName.trim().split(/\s+/)[0] ?? input.personName;
  const treatment = input.treatment === 'hermana' ? 'hermana' : 'hermano';
  const who = input.names?.[input.leader]?.trim()
    ? `el ${leaderShort(input.leader, input.names).toLowerCase()}`
    : LEADER_WITH[input.leader];
  const virtual = input.modality === 'virtual';
  return [
    `Hola ${treatment} ${first}, le saludo de parte de la presidencia de la Estaca Blanco Galindo.`,
    `Su entrevista con ${who} quedó programada para el ${date} a las ${time}${virtual ? ', de forma virtual' : ''}.`,
    virtual
      ? 'Le enviaré el enlace antes de la hora. Por favor confirme si podrá asistir.'
      : 'Por favor confirme si podrá asistir. Si necesita cambiar el horario, avíseme con anticipación.',
    '¡Gracias!',
  ].join('\n\n');
}

export interface FreeBlock {
  startsAt: number;
  leader: Leader;
}

/** Primer bloque con cupo de un líder desde `from` (hasta 5 semanas). */
export function nextFreeBlock(input: {
  leader: Leader;
  from: number;
  rules: LeaderAvailability[];
  appointments: InterviewAppointment[];
}): FreeBlock | undefined {
  const first = new Date(input.from);
  for (let d = 0; d < 35; d += 1) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + d);
    const block = blocksForDay({ ...input, day }).find(
      (b) => !b.full && b.startsAt + BLOCK_MIN * MS_MIN > input.from,
    );
    if (block) return { startsAt: Math.max(block.startsAt, input.from), leader: input.leader };
  }
  return undefined;
}

/* ---------- Teléfono ---------- */

/**
 * Deja solo dígitos con código de país. Un número de 8 dígitos se toma como de Bolivia (591).
 * Devuelve `undefined` si está vacío y `null` si no parece un número válido.
 */
export function normalizePhone(raw: string | undefined): string | undefined | null {
  const text = (raw ?? '').trim();
  if (!text) return undefined;
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `591${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Recordatorio para quien todavía no confirmó. */
export function reminderMessage(input: {
  personName: string;
  treatment?: 'hermano' | 'hermana';
  leader: Leader;
  startsAt: number;
  modality?: 'presencial' | 'virtual';
  names?: PresidencyNames;
  now: number;
}): string {
  const first = input.personName.trim().split(/\s+/)[0] ?? input.personName;
  const treatment = input.treatment === 'hermana' ? 'hermana' : 'hermano';
  const target = new Date(input.startsAt);
  const tomorrow = new Date(input.now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const when = sameDay(target, new Date(input.now))
    ? 'hoy'
    : sameDay(target, tomorrow)
      ? 'mañana'
      : `el ${longDate.format(target)}`;
  const who = input.names?.[input.leader]?.trim()
    ? `el ${leaderShort(input.leader, input.names).toLowerCase()}`
    : LEADER_WITH[input.leader];
  const virtual = input.modality === 'virtual' ? ' (virtual)' : '';
  return [
    `Hola ${treatment} ${first}, le escribo para recordarle su entrevista con ${who} ${when} a las ${formatClock(input.startsAt)}${virtual}.`,
    '¿Me confirma por favor si podrá asistir?',
    '¡Gracias!',
  ].join('\n\n');
}
