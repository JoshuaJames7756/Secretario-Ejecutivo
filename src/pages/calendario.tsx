import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import {
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  buildMonthGrid,
  gridRange,
  groupByDay,
  monthTitle,
  shiftMonth,
} from '@/features/calendar/model';
import { toDateString } from '@/features/followups/model';
import { MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from '@/features/meetings/labels';
import { cn } from '@/lib/utils';

const timeFormat = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('es-BO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default function CalendarioPage() {
  // Fecha de hoy fija mientras la pantalla está abierta (render puro).
  const [today] = useState(() => new Date());
  const todayKey = toDateString(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(todayKey);

  const cells = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const { from, to } = gridRange(cells);

  const meetings = useLiveQuery(
    () =>
      db.meetings
        .where('startsAt')
        .between(from, to, true, true)
        .filter((m) => m.deletedAt === undefined)
        .toArray(),
    [from, to],
  );
  const byDay = useMemo(() => groupByDay(meetings ?? []), [meetings]);
  const dayMeetings = byDay.get(selected) ?? [];

  const go = (delta: number) => {
    const [year, month] = shiftMonth(view.year, view.month, delta);
    setView({ year, month });
    // Mantiene el día seleccionado dentro del mes que se ve.
    setSelected(toDateString(new Date(year, month, 1)));
  };
  const goToday = () => {
    setView({ year: today.getFullYear(), month: today.getMonth() });
    setSelected(todayKey);
  };

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Tus reuniones por día. Toca un día para ver sus reuniones o programar una."
        actions={
          <Link to={`/reuniones/nueva?fecha=${selected}`} className={cn(buttonVariants())}>
            <CalendarPlus className="size-4" aria-hidden />
            Nueva reunión
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-label="Calendario mensual">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" aria-label="Mes anterior" onClick={() => go(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <h2 className="font-display text-xl font-semibold" aria-live="polite">
              {monthTitle(view.year, view.month)}
            </h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={goToday}>
                Hoy
              </Button>
              <Button variant="outline" size="sm" aria-label="Mes siguiente" onClick={() => go(1)}>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
            {WEEKDAYS_SHORT.map((d, i) => (
              <span key={WEEKDAYS_LONG[i]} aria-hidden>
                {d}
              </span>
            ))}
          </div>
          <div
            role="grid"
            aria-label={monthTitle(view.year, view.month)}
            className="mt-1 grid grid-cols-7 gap-1"
          >
            {cells.map((cell) => {
              const list = byDay.get(cell.key) ?? [];
              const active = list.filter((m) => m.status !== 'cancelada');
              const isSelected = cell.key === selected;
              const label = `${dayFormat.format(cell.date)}${
                active.length > 0
                  ? `, ${active.length} ${active.length === 1 ? 'reunión' : 'reuniones'}`
                  : ''
              }`;
              return (
                <button
                  key={cell.key}
                  type="button"
                  role="gridcell"
                  aria-label={label}
                  aria-pressed={isSelected}
                  aria-current={cell.key === todayKey ? 'date' : undefined}
                  onClick={() => setSelected(cell.key)}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-start gap-1 rounded-xl border p-1 text-sm transition-colors',
                    isSelected
                      ? 'border-primary bg-primary-soft text-primary-soft-fg'
                      : 'border-transparent hover:bg-surface-2',
                    !cell.inMonth && 'text-muted opacity-60',
                    cell.key === todayKey && !isSelected && 'border-border-strong',
                  )}
                >
                  <span className={cn('tabular-nums', cell.key === todayKey && 'font-bold')}>
                    {cell.date.getDate()}
                  </span>
                  {active.length > 0 && (
                    <span className="flex items-center gap-0.5" aria-hidden>
                      {active.slice(0, 3).map((m) => (
                        <span key={m.id} className="size-1.5 rounded-full bg-primary" />
                      ))}
                      {active.length > 3 && <span className="text-[10px]">+</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card aria-labelledby="dia-elegido">
          <h2 id="dia-elegido" className="mb-3 font-display text-lg font-semibold">
            {dayFormat.format(new Date(`${selected}T12:00:00`))}
          </h2>
          {meetings === undefined ? (
            <p role="status" className="text-muted">
              Cargando…
            </p>
          ) : dayMeetings.length === 0 ? (
            <div className="space-y-3">
              <p className="text-muted">No hay reuniones este día.</p>
              <Link
                to={`/reuniones/nueva?fecha=${selected}`}
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                Programar una reunión
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {dayMeetings.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/reuniones/${m.id}`}
                    className="block rounded-xl border border-border p-3 hover:bg-surface-2"
                  >
                    <span className="block text-sm text-muted tabular-nums">
                      {timeFormat.format(new Date(m.startsAt))} · {m.durationMin} min
                    </span>
                    <span className="block font-medium text-balance">{m.title}</span>
                    <span className="mt-1 block">
                      <Badge tone={MEETING_STATUS_TONE[m.status]}>
                        {MEETING_STATUS_LABEL[m.status]}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
