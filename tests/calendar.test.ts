import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  dayToDateTimeLocal,
  groupByDay,
  shiftMonth,
} from '../src/features/calendar/model';
import type { MeetingOccurrence } from '../src/db/types';

describe('calendario', () => {
  it('arma semanas completas que empiezan en lunes', () => {
    // Octubre 2026 empieza en jueves y tiene 31 días: 5 semanas.
    const cells = buildMonthGrid(2026, 9);
    expect(cells).toHaveLength(35);
    expect(cells[0]!.key).toBe('2026-09-28'); // lunes
    expect(cells[0]!.inMonth).toBe(false);
    expect(cells[3]!.key).toBe('2026-10-01');
    expect(cells[3]!.inMonth).toBe(true);
    expect(cells.at(-1)!.key).toBe('2026-11-01'); // domingo
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('un mes que empieza en lunes no añade una semana vacía antes', () => {
    // Junio 2026 empieza en lunes y tiene 30 días: 5 semanas exactas.
    const cells = buildMonthGrid(2026, 5);
    expect(cells[0]!.key).toBe('2026-06-01');
    expect(cells).toHaveLength(35);
  });

  it('cambia de mes cruzando el año', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0]);
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11]);
  });

  it('agrupa reuniones por día local y las ordena por hora', () => {
    const at = (h: number) => new Date(2026, 9, 24, h, 0).getTime();
    const mk = (id: string, startsAt: number) => ({ id, startsAt }) as MeetingOccurrence;
    const map = groupByDay([mk('b', at(19)), mk('a', at(8)), mk('c', at(8) + 86_400_000)]);
    expect(map.get('2026-10-24')!.map((m) => m.id)).toEqual(['a', 'b']);
    expect(map.get('2026-10-25')!.map((m) => m.id)).toEqual(['c']);
  });

  it('propone las 19:00 al programar desde un día', () => {
    expect(dayToDateTimeLocal('2026-10-24')).toBe('2026-10-24T19:00');
  });
});
