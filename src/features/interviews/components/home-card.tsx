import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { ImageDown, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardTitle } from '@/components/shared/page';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { toDateString } from '@/features/followups/model';
import { cn } from '@/lib/utils';
import { summaryTitle, treatmentAbbr } from '../day-summary';
import { formatClock, leaderSurname, reasonLabel } from '../model';
import { usePresidencyNames } from '../use-interview-data';
import { ConfirmedToggle } from './confirmed-toggle';
import { OutreachButton } from './outreach-button';
import { attempt } from '@/lib/actions';
import { setConfirmed } from '../service';

/** Lo primero en Inicio: las próximas entrevistas y el acceso rápido a agendar o compartir. */
export function InterviewsHomeCard() {
  const names = usePresidencyNames();
  const [now] = useState(() => Date.now());
  const data = useLiveQuery(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const upcoming = await db.interviewAppointments
      .where('startsAt')
      .aboveOrEqual(start.getTime())
      .filter((a) => isActive(a) && a.status === 'programada')
      .sortBy('startsAt');
    const requests = await db.interviewRequests.bulkGet(upcoming.map((a) => a.requestId));
    const orgs = await db.organizations.toArray();
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const rows = upcoming.flatMap((appointment, i) => {
      const request = requests[i];
      if (!request || !isActive(request)) return [];
      return [
        {
          appointment,
          request,
          organization: request.organizationId ? orgName.get(request.organizationId) : undefined,
        },
      ];
    });
    const pending = await db.interviewRequests
      .filter((r) => isActive(r) && ['recibida', 'pendiente_coordinacion'].includes(r.status))
      .count();
    return { rows, pending };
  }, []);

  const tomorrow = toDateString(new Date(now + 24 * 3_600_000));
  const today = toDateString(new Date(now));
  const rows = data?.rows ?? [];
  const next = rows.slice(0, 4);
  const tomorrowRows = rows.filter(
    (r) => toDateString(new Date(r.appointment.startsAt)) === tomorrow,
  );
  const unconfirmed = tomorrowRows.filter((r) => r.appointment.confirmed !== true).length;

  return (
    <Card aria-labelledby="entrevistas-inicio" className="border-primary/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          <span id="entrevistas-inicio">Entrevistas</span>
        </CardTitle>
        <Link
          to="/entrevistas"
          className="text-sm font-medium text-primary-soft-fg underline underline-offset-2"
        >
          Ver todas
        </Link>
      </div>

      {tomorrowRows.length > 0 && (
        <p className="mb-3 rounded-xl bg-primary-soft p-3 text-sm text-primary-soft-fg">
          Mañana hay {tomorrowRows.length}{' '}
          {tomorrowRows.length === 1 ? 'entrevista' : 'entrevistas'}
          {unconfirmed > 0 ? `, ${unconfirmed} sin confirmar` : ', todas confirmadas'}.
        </p>
      )}

      {data === undefined ? (
        <p role="status" className="text-muted">
          Cargando…
        </p>
      ) : next.length === 0 ? (
        <p className="text-muted">No hay entrevistas agendadas.</p>
      ) : (
        <ul className="space-y-2">
          {next.map(({ appointment, request, organization }) => {
            const key = toDateString(new Date(appointment.startsAt));
            const when =
              key === today
                ? 'Hoy'
                : key === tomorrow
                  ? 'Mañana'
                  : summaryTitle(new Date(appointment.startsAt));
            return (
              <li key={appointment.id} className="rounded-xl border border-border p-2 pl-3">
                <div className="flex items-center gap-2">
                  <Link to={`/entrevistas/${request.id}`} className="min-w-0 flex-1">
                    <span className="block text-xs text-muted">
                      {when} · {formatClock(appointment.startsAt)} ·{' '}
                      {leaderSurname(appointment.leader, names)}
                    </span>
                    <span className="block truncate font-medium">
                      {treatmentAbbr(request.treatment)} {request.personName}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {[organization, reasonLabel(request)].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                  <ConfirmedToggle
                    stacked
                    size="sm"
                    personName={request.personName}
                    confirmed={appointment.confirmed === true}
                    onChange={(next) => {
                      void attempt(() => setConfirmed(appointment.id, next));
                    }}
                  />
                </div>
                {key <= tomorrow && appointment.confirmed !== true && (
                  <div className="mt-1.5 border-t border-border pt-1.5">
                    <OutreachButton request={request} appointment={appointment} now={now} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pending > 0 && (
        <p className="mt-3 text-sm text-warning">
          {data.pending}{' '}
          {data.pending === 1 ? 'solicitud por coordinar' : 'solicitudes por coordinar'}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/entrevistas/nueva" className={cn(buttonVariants())}>
          <Plus className="size-4" aria-hidden />
          Nueva entrevista
        </Link>
        <Link
          to={`/entrevistas/resumen?fecha=${tomorrow}`}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          <ImageDown className="size-4" aria-hidden />
          Imagen de mañana
        </Link>
      </div>
    </Card>
  );
}
