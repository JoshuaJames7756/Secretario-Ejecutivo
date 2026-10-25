import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import type { MeetingOccurrence } from '@/db/types';
import { MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from '@/features/meetings/labels';
import { cn, formatDateTime } from '@/lib/utils';

function MeetingRow({ meeting }: { meeting: MeetingOccurrence }) {
  return (
    <li>
      <Link
        to={`/reuniones/${meeting.id}`}
        className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block font-medium text-balance">{meeting.title}</span>
          <span className="block text-sm text-muted">
            {formatDateTime(meeting.startsAt)}
            {meeting.place ? ` · ${meeting.place}` : ''}
          </span>
        </span>
        <Badge tone={MEETING_STATUS_TONE[meeting.status]}>
          {MEETING_STATUS_LABEL[meeting.status]}
        </Badge>
      </Link>
    </li>
  );
}

function Group({ title, meetings }: { title: string; meetings: MeetingOccurrence[] }) {
  if (meetings.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">
        {title} ({meetings.length})
      </h2>
      <ul className="space-y-2">
        {meetings.map((m) => (
          <MeetingRow key={m.id} meeting={m} />
        ))}
      </ul>
    </section>
  );
}

export default function ReunionesPage() {
  // Referencia de tiempo fija mientras la pantalla está abierta (mantiene el render puro).
  const [now] = useState(() => Date.now());
  const meetings = useLiveQuery(() =>
    db.meetings.filter((m) => m.deletedAt === undefined).toArray(),
  );

  const action = (
    <Link to="/reuniones/nueva" className={cn(buttonVariants())}>
      <CalendarPlus className="size-4" aria-hidden />
      Nueva reunión
    </Link>
  );

  let body;
  if (meetings === undefined) {
    body = (
      <p role="status" className="text-muted">
        Cargando reuniones…
      </p>
    );
  } else if (meetings.length === 0) {
    body = (
      <EmptyState
        icon={Users}
        title="Todavía no hay reuniones"
        description="Crea una reunión desde cero o a partir de una plantilla del catálogo."
      >
        <div className="mt-5">{action}</div>
      </EmptyState>
    );
  } else {
    const byDate = (a: MeetingOccurrence, b: MeetingOccurrence) => a.startsAt - b.startsAt;
    const open = meetings.filter((m) => m.status === 'programada' || m.status === 'reprogramada');
    body = (
      <div className="space-y-6">
        <Group title="En curso" meetings={meetings.filter((m) => m.status === 'en_curso')} />
        <Group title="Próximas" meetings={open.filter((m) => m.startsAt >= now).sort(byDate)} />
        <Group
          title="Programadas con fecha pasada"
          meetings={open.filter((m) => m.startsAt < now).sort(byDate)}
        />
        <Group
          title="Cerradas"
          meetings={meetings.filter((m) => m.status === 'cerrada').sort((a, b) => byDate(b, a))}
        />
        <Group
          title="Canceladas"
          meetings={meetings.filter((m) => m.status === 'cancelada').sort((a, b) => byDate(b, a))}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Reuniones"
        description="Cada reunión tiene su propia agenda y sus notas, independientes de la plantilla."
        actions={meetings && meetings.length > 0 ? action : undefined}
      />
      {body}
    </>
  );
}
