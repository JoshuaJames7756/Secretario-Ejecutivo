import { useLiveQuery } from 'dexie-react-hooks';
import { Settings2, UserPlus, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { InterviewAppointment, InterviewRequest } from '@/db/types';
import { LEADER_LABEL, REQUEST_STATUS_LABEL } from '@/features/interviews/model';
import { cn, formatDateTime } from '@/lib/utils';

interface Row {
  request: InterviewRequest;
  appointment?: InterviewAppointment;
  organization?: string;
}

function RequestRow({ row }: { row: Row }) {
  const { request, appointment, organization } = row;
  return (
    <li>
      <Link
        to={`/entrevistas/${request.id}`}
        className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block font-medium text-balance">{request.personName}</span>
          <span className="block text-sm text-muted">
            {organization ?? 'Sin barrio'}
            {appointment
              ? ` · ${LEADER_LABEL[appointment.leader]} · ${formatDateTime(appointment.startsAt)}`
              : ` · Recibida ${formatDateTime(request.receivedAt)}`}
          </span>
        </span>
        <Badge
          tone={
            request.status === 'programada'
              ? 'primary'
              : request.status === 'completada'
                ? 'success'
                : request.status === 'cancelada'
                  ? 'neutral'
                  : 'warning'
          }
        >
          {REQUEST_STATUS_LABEL[request.status]}
        </Badge>
      </Link>
    </li>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">
        {title} ({rows.length})
      </h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <RequestRow key={r.request.id} row={r} />
        ))}
      </ul>
    </section>
  );
}

export default function EntrevistasPage() {
  const data = useLiveQuery(async () => {
    const [requests, appointments, orgs] = await Promise.all([
      db.interviewRequests.filter(isActive).toArray(),
      db.interviewAppointments.filter((a) => isActive(a) && a.status === 'programada').toArray(),
      db.organizations.toArray(),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const byRequest = new Map(appointments.map((a) => [a.requestId, a]));
    return requests.map<Row>((request) => ({
      request,
      appointment: byRequest.get(request.id),
      organization: request.organizationId ? orgName.get(request.organizationId) : undefined,
    }));
  }, []);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link to="/entrevistas/configuracion" className={cn(buttonVariants({ variant: 'outline' }))}>
        <Settings2 className="size-4" aria-hidden />
        Barrios y disponibilidad
      </Link>
      <Link to="/entrevistas/nueva" className={cn(buttonVariants())}>
        <UserPlus className="size-4" aria-hidden />
        Nueva solicitud
      </Link>
    </div>
  );

  let body;
  if (data === undefined) {
    body = (
      <p role="status" className="text-muted">
        Cargando solicitudes…
      </p>
    );
  } else if (data.length === 0) {
    body = (
      <EmptyState
        icon={UserRound}
        title="Sin solicitudes de entrevista"
        description="Registra una solicitud para coordinar la cita con el líder correspondiente. Aquí solo se guarda lo administrativo, nunca el contenido de la entrevista."
      />
    );
  } else {
    const byReceived = (a: Row, b: Row) => a.request.receivedAt - b.request.receivedAt;
    const byStart = (a: Row, b: Row) =>
      (a.appointment?.startsAt ?? 0) - (b.appointment?.startsAt ?? 0);
    const open = data.filter(
      (r) =>
        r.request.status === 'recibida' ||
        r.request.status === 'pendiente_coordinacion' ||
        r.request.status === 'reprogramada',
    );
    body = (
      <div className="space-y-6">
        <Group
          title="Por coordinar"
          rows={open.filter((r) => !r.request.waitlist).sort(byReceived)}
        />
        <Group
          title="Lista de espera"
          rows={open.filter((r) => r.request.waitlist).sort(byReceived)}
        />
        <Group
          title="Programadas"
          rows={data.filter((r) => r.request.status === 'programada').sort(byStart)}
        />
        <Group
          title="Completadas y canceladas"
          rows={data
            .filter((r) => r.request.status === 'completada' || r.request.status === 'cancelada')
            .sort((a, b) => byReceived(b, a))}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Entrevistas"
        description="Coordinación de solicitudes con la presidencia, sin registrar contenido confidencial."
        actions={actions}
      />
      {body}
    </>
  );
}
