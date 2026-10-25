import type { BadgeTone } from '@/components/ui/badge';
import type { MeetingStatus, RecordType, TemplateOrigin } from '@/db/types';

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  programada: 'Programada',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
  reprogramada: 'Reprogramada',
};

export const MEETING_STATUS_TONE: Record<MeetingStatus, BadgeTone> = {
  programada: 'primary',
  en_curso: 'warning',
  cerrada: 'success',
  cancelada: 'neutral',
  reprogramada: 'neutral',
};

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  nota: 'Nota',
  propuesta: 'Propuesta',
  decision: 'Decisión confirmada',
  asignacion: 'Asignación',
  pendiente: 'Asunto pendiente',
  informativa: 'Nota informativa',
};

/** Texto de ayuda: cada tipo significa algo distinto y nunca se infiere uno a partir de otro. */
export const RECORD_TYPE_HELP: Record<Exclude<RecordType, 'nota'>, string> = {
  propuesta: 'Una idea que todavía necesita evaluación o aprobación.',
  decision: 'Algo que marcas expresamente como decidido.',
  asignacion: 'Una tarea con responsable y fecha límite opcionales. Se añade a Seguimientos.',
  pendiente: 'Un tema que requiere revisión posterior. Se añade a Seguimientos.',
  informativa: 'Información que conviene conservar sin convertirla en decisión o tarea.',
};

export const RECORD_TYPES_FOR_QUICK_ADD: Exclude<RecordType, 'nota'>[] = [
  'propuesta',
  'decision',
  'asignacion',
  'pendiente',
  'informativa',
];

export const TEMPLATE_ORIGIN_LABEL: Record<TemplateOrigin, string> = {
  oficial: 'Manual General',
  local: 'Local',
  personal: 'Personal',
};

/** Líneas de texto a lista: una por línea, sin vacías ni espacios sobrantes. */
export function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Valor para <input type="datetime-local"> en hora local (AAAA-MM-DDTHH:mm). */
export function toDateTimeLocal(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number {
  return new Date(value).getTime();
}

/** Próxima hora en punto: valor sensato por defecto al programar. */
export function nextFullHour(now = new Date()): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}
