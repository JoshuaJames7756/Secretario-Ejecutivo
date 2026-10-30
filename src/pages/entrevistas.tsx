import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, ImageDown, Plus, Settings2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type {
  InterviewAppointment,
  InterviewRequest,
  Leader,
  LeaderAvailability,
} from '@/db/types';
import { ConfirmedToggle } from '@/features/interviews/components/confirmed-toggle';
import { OutreachButton } from '@/features/interviews/components/outreach-button';
import { SwipeRow } from '@/features/interviews/components/swipe-row';
import { toDateString } from '@/features/followups/model';
import { summaryTitle, treatmentAbbr } from '@/features/interviews/day-summary';
import {
  LEADERS,
  LEADER_COLOR,
  REQUEST_STATUS_LABEL,
  formatClock,
  leaderSurname,
  nextFreeBlock,
  reasonLabel,
  suggestLeader,
  type PresidencyNames,
} from '@/features/interviews/model';
import { setConfirmed } from '@/features/interviews/service';
import { usePresidencyNames } from '@/features/interviews/use-interview-data';
import { attempt } from '@/lib/actions';
import { cn } from '@/lib/utils';

interface Row {
  request: InterviewRequest;
  appointment?: InterviewAppointment;
  organization?: string;
  orgLeader?: Leader;
}

function LeaderTag({ leader, names }: { leader: Leader; names: PresidencyNames }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: LEADER_COLOR[leader] }}
      />
      {leaderSurname(leader, names)}
    </span>
  );
}

function ScheduledRow({ row, names, now }: { row: Row; names: PresidencyNames; now: number }) {
  const { request, appointment, organization } = row;
  if (!appointment) return null;
  const confirmed = appointment.confirmed === true;
  return (
    <li>
      <SwipeRow
        confirmed={confirmed}
        onSwipe={() => {
          void attempt(() => setConfirmed(appointment.id, !confirmed));
        }}
      >
        <div
          className="rounded-xl border border-l-4 border-border bg-surface"
          style={{ borderLeftColor: LEADER_COLOR[appointment.leader] }}
        >
          <div className="flex items-stretch gap-2">
            <Link
              to={`/entrevistas/${request.id}`}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-3 hover:bg-surface-2"
            >
              <span className="w-[4.5rem] shrink-0 font-display text-lg leading-tight font-semibold tabular-nums text-primary-soft-fg">
                {formatClock(appointment.startsAt)}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 block font-medium">
                  {treatmentAbbr(request.treatment)} {request.personName}
                </span>
                <span className="line-clamp-2 block text-sm text-muted">
                  {[organization, reasonLabel(request)].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <LeaderTag leader={appointment.leader} names={names} />
                  {request.modality === 'virtual' && <Badge tone="primary">Virtual</Badge>}
                  {appointment.special && <Badge tone="warning">Día especial</Badge>}
                  {appointment.contactedAt !== undefined && !confirmed && (
                    <Badge tone="neutral">Avisada</Badge>
                  )}
                </span>
              </span>
            </Link>
            <div className="flex items-center pr-3">
              <ConfirmedToggle
                stacked
                size="sm"
                personName={request.personName}
                confirmed={confirmed}
                onChange={(next) => {
                  void attempt(() => setConfirmed(appointment.id, next));
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5">
            <OutreachButton request={request} appointment={appointment} now={now} />
            <Link
              to={`/entrevistas/nueva?copiar=${request.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Copy className="size-4" aria-hidden />
              Agendar otra igual
            </Link>
          </div>
        </div>
      </SwipeRow>
    </li>
  );
}

function OpenRow({
  row,
  names,
  free,
}: {
  row: Row;
  names: PresidencyNames;
  free?: { startsAt: number; leader: Leader };
}) {
  const { request, organization } = row;
  return (
    <li>
      <Link
        to={`/entrevistas/${request.id}`}
        className="block rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
      >
        <span className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-medium text-balance">
              {treatmentAbbr(request.treatment)} {request.personName}
            </span>
            <span className="block text-sm text-muted">
              {[organization, reasonLabel(request)].filter(Boolean).join(' · ')}
            </span>
          </span>
          <Badge
            tone={
              request.status === 'completada'
                ? 'success'
                : request.status === 'cancelada'
                  ? 'neutral'
                  : 'warning'
            }
          >
            {REQUEST_STATUS_LABEL[request.status]}
          </Badge>
        </span>
        {free && (
          <span className="mt-2 block rounded-lg bg-success-soft px-3 py-1.5 text-sm text-success">
            Hay cupo: {summaryTitle(new Date(free.startsAt))}, {formatClock(free.startsAt)} con{' '}
            {leaderSurname(free.leader, names)}. Toca para agendar.
          </span>
        )}
      </Link>
    </li>
  );
}

function OpenGroup({
  title,
  rows,
  names,
  freeFor,
}: {
  title: string;
  rows: Row[];
  names: PresidencyNames;
  freeFor?: (row: Row) => { startsAt: number; leader: Leader } | undefined;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">
        {title} ({rows.length})
      </h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <OpenRow key={r.request.id} row={r} names={names} free={freeFor?.(r)} />
        ))}
      </ul>
    </section>
  );
}

export default function EntrevistasPage() {
  const names = usePresidencyNames();
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<Leader | 'todos'>('todos');
  const data = useLiveQuery(async () => {
    const [requests, appointments, orgs, rules] = await Promise.all([
      db.interviewRequests.filter(isActive).toArray(),
      db.interviewAppointments.filter((a) => isActive(a) && a.status === 'programada').toArray(),
      db.organizations.toArray(),
      db.leaderAvailability.filter(isActive).toArray(),
    ]);
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const byRequest = new Map(appointments.map((a) => [a.requestId, a]));
    const rows = requests.map<Row>((request) => {
      const org = request.organizationId ? orgById.get(request.organizationId) : undefined;
      return {
        request,
        appointment: byRequest.get(request.id),
        organization: org?.name,
        orgLeader: org?.assignedLeader,
      };
    });
    return { rows, appointments, rules: rules as LeaderAvailability[] };
  }, []);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link to="/entrevistas/resumen" className={cn(buttonVariants({ variant: 'outline' }))}>
        <ImageDown className="size-4" aria-hidden />
        Resumen para el grupo
      </Link>
      <Link to="/entrevistas/nueva" className={cn(buttonVariants())}>
        <Plus className="size-4" aria-hidden />
        Nueva entrevista
      </Link>
    </div>
  );

  let body;
  if (data === undefined) {
    body = (
      <p role="status" className="text-muted">
        Cargando entrevistas…
      </p>
    );
  } else if (data.rows.length === 0) {
    body = (
      <EmptyState
        icon={UserRound}
        title="Sin entrevistas todavía"
        description="Agenda la primera: persona, motivo, quién y cuándo en una sola pantalla. Aquí solo se guarda lo administrativo, nunca el contenido de la entrevista."
      >
        <Link to="/entrevistas/nueva" className={cn(buttonVariants(), 'mt-5')}>
          Nueva entrevista
        </Link>
      </EmptyState>
    );
  } else {
    const byReceived = (a: Row, b: Row) => a.request.receivedAt - b.request.receivedAt;
    const open = data.rows.filter(
      (r) =>
        r.request.status === 'recibida' ||
        r.request.status === 'pendiente_coordinacion' ||
        r.request.status === 'reprogramada',
    );
    const allScheduled = data.rows
      .filter((r) => r.request.status === 'programada' && r.appointment)
      .sort((a, b) => (a.appointment?.startsAt ?? 0) - (b.appointment?.startsAt ?? 0));
    const scheduled = allScheduled.filter(
      (r) => filter === 'todos' || r.appointment?.leader === filter,
    );
    const countFor = (l: Leader) => allScheduled.filter((r) => r.appointment?.leader === l).length;
    const days = new Map<string, Row[]>();
    for (const row of scheduled) {
      const key = toDateString(new Date(row.appointment?.startsAt ?? 0));
      days.set(key, [...(days.get(key) ?? []), row]);
    }
    const today = toDateString(new Date(now));
    const freeFor = (row: Row) => {
      const suggestion = suggestLeader(row.request, {
        name: row.organization ?? '',
        assignedLeader: row.orgLeader,
      });
      if (!suggestion.leader) return undefined;
      return nextFreeBlock({
        leader: suggestion.leader,
        from: now,
        rules: data.rules.filter((r) => r.leader === suggestion.leader),
        appointments: data.appointments.filter((a) => a.leader === suggestion.leader),
      });
    };
    const filters: { value: Leader | 'todos'; label: string }[] = [
      { value: 'todos', label: `Todos · ${allScheduled.length}` },
      ...LEADERS.map((l) => ({ value: l, label: `${leaderSurname(l, names)} · ${countFor(l)}` })),
    ];
    body = (
      <div className="space-y-7">
        <OpenGroup
          title="Por coordinar"
          rows={open.filter((r) => !r.request.waitlist).sort(byReceived)}
          names={names}
        />
        <OpenGroup
          title="Lista de espera"
          rows={open.filter((r) => r.request.waitlist).sort(byReceived)}
          names={names}
          freeFor={freeFor}
        />
        {allScheduled.length > 0 && (
          <div role="radiogroup" aria-label="Ver entrevistas de" className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors motion-reduce:transition-none',
                  filter === f.value
                    ? 'border-primary bg-primary-soft text-primary-soft-fg'
                    : 'border-border-strong bg-surface text-muted hover:bg-surface-2',
                )}
              >
                {f.value !== 'todos' && (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: LEADER_COLOR[f.value] }}
                  />
                )}
                {f.label}
              </button>
            ))}
          </div>
        )}
        {[...days.entries()].map(([key, rows]) => (
          <section
            key={key}
            aria-label={summaryTitle(new Date(`${key}T12:00`))}
            className="space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {summaryTitle(new Date(`${key}T12:00`))}
                {key === today && <span className="ml-2 text-primary-soft-fg">· Hoy</span>}
                <span className="ml-2 font-normal text-muted">({rows.length})</span>
              </h2>
              <Link
                to={`/entrevistas/resumen?fecha=${key}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary-soft-fg hover:bg-surface-2"
              >
                <ImageDown className="size-4" aria-hidden />
                Imagen
              </Link>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <ScheduledRow key={r.request.id} row={r} names={names} now={now} />
              ))}
            </ul>
          </section>
        ))}
        <OpenGroup
          title="Completadas y canceladas"
          rows={data.rows
            .filter((r) => r.request.status === 'completada' || r.request.status === 'cancelada')
            .sort((a, b) => byReceived(b, a))}
          names={names}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Entrevistas" actions={actions} />
      {body}
      <p className="mt-8">
        <Link
          to="/entrevistas/configuracion"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-fg"
        >
          <Settings2 className="size-4" aria-hidden />
          Presidencia, barrios y horarios
        </Link>
      </p>
      {/* Botón flotante: agendar con el pulgar sin subir a la cabecera. */}
      <Link
        to="/entrevistas/nueva"
        aria-label="Nueva entrevista"
        className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg active:scale-95 md:hidden"
      >
        <Plus className="size-7" aria-hidden />
      </Link>
    </>
  );
}
