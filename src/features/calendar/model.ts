import type { MeetingOccurrence } from '@/db/types';
import { toDateString } from '@/features/followups/model';

export interface DayCell {
  date: Date;
  key: string; // AAAA-MM-DD en hora local
  inMonth: boolean;
}

/** Cuadrícula del mes en semanas completas que empiezan en lunes (como en Bolivia). */
export function buildMonthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = new Date(year, month, 1 - offset + i);
    cells.push({ date, key: toDateString(date), inMonth: date.getMonth() === month });
  }
  return cells;
}

/** Inicio y fin (ms) cubiertos por la cuadrícula, para consultar solo lo necesario. */
export function gridRange(cells: DayCell[]): { from: number; to: number } {
  const first = cells[0]!.date;
  const last = cells[cells.length - 1]!.date;
  return {
    from: new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime(),
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime() - 1,
  };
}

export function groupByDay(meetings: MeetingOccurrence[]): Map<string, MeetingOccurrence[]> {
  const map = new Map<string, MeetingOccurrence[]>();
  for (const m of [...meetings].sort((a, b) => a.startsAt - b.startsAt)) {
    const key = toDateString(new Date(m.startsAt));
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  return map;
}

export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}

const monthFormat = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' });
export function monthTitle(year: number, month: number): string {
  const text = monthFormat.format(new Date(year, month, 1));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const WEEKDAYS_LONG = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];

/** Valor datetime-local para un día elegido, a las 19:00 por defecto. */
export function dayToDateTimeLocal(key: string, hour = 19): string {
  return `${key}T${String(hour).padStart(2, '0')}:00`;
}
