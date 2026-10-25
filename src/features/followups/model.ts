import type { FollowUp, FollowUpStatus } from '@/db/types';

export type FollowUpKind = FollowUp['kind'];

export const FOLLOW_UP_KIND_LABEL: Record<FollowUpKind, string> = {
  asignacion: 'Asignación',
  pendiente: 'Asunto pendiente',
};

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  registrado: 'Registrado',
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobado_asignado: 'Aprobado o asignado',
  en_progreso: 'En progreso',
  en_espera: 'En espera',
  completado: 'Completado',
  cerrado_sin_completar: 'Cerrado sin completar',
};

/** "No todos los tipos de registro necesitarán todos los estados" (especificación, 8.3). */
export const STATUSES_BY_KIND: Record<FollowUpKind, FollowUpStatus[]> = {
  asignacion: [
    'aprobado_asignado',
    'en_progreso',
    'en_espera',
    'completado',
    'cerrado_sin_completar',
  ],
  pendiente: [
    'registrado',
    'pendiente_aprobacion',
    'en_progreso',
    'en_espera',
    'completado',
    'cerrado_sin_completar',
  ],
};

export const INITIAL_STATUS: Record<FollowUpKind, FollowUpStatus> = {
  asignacion: 'aprobado_asignado',
  pendiente: 'registrado',
};

const CLOSED_STATUSES: FollowUpStatus[] = ['completado', 'cerrado_sin_completar'];

export function isClosedStatus(status: FollowUpStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

export function isOpenFollowUp(followUp: FollowUp): boolean {
  return followUp.deletedAt === undefined && !isClosedStatus(followUp.status);
}

/** Fecha local en formato AAAA-MM-DD (la que usan los campos de fecha y `dueDate`). */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Vencida: abierta y con fecha límite anterior a hoy. Comparar cadenas AAAA-MM-DD es correcto. */
export function isOverdue(followUp: FollowUp, today: string): boolean {
  return isOpenFollowUp(followUp) && !!followUp.dueDate && followUp.dueDate < today;
}

/** Título corto a partir de un texto largo: primera línea, máximo 120 caracteres. */
export function titleFromText(text: string): string {
  const first = (text.trim().split('\n')[0] ?? '').trim();
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}
