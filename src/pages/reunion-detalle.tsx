import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Card, CardTitle, EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, describedBy, inputClass, textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { softDeleteEntity } from '@/db/repo';
import type { MeetingOccurrence, MeetingStatus } from '@/db/types';
import { AgendaEditor } from '@/features/meetings/components/agenda-editor';
import { RecordList } from '@/features/meetings/components/record-list';
import {
  MEETING_STATUS_LABEL,
  MEETING_STATUS_TONE,
  fromDateTimeLocal,
  linesToList,
  toDateTimeLocal,
} from '@/features/meetings/labels';
import { meetingFormSchema, type MeetingFormValues } from '@/features/meetings/schemas';
import {
  canTransition,
  changeMeetingStatus,
  updateMeetingDetails,
} from '@/features/meetings/service';
import { attempt } from '@/lib/actions';
import { cn, formatDateTime } from '@/lib/utils';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router';

function DetailsForm({ meeting, onDone }: { meeting: MeetingOccurrence; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      templateId: meeting.templateId ?? '',
      title: meeting.title,
      startsAt: toDateTimeLocal(meeting.startsAt),
      durationMin: String(meeting.durationMin),
      place: meeting.place ?? '',
      participants: meeting.participants.join('\n'),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const saved = await attempt(
      () =>
        updateMeetingDetails(meeting.id, {
          title: values.title,
          startsAt: fromDateTimeLocal(values.startsAt),
          durationMin: Number(values.durationMin),
          place: values.place,
          participants: linesToList(values.participants),
        }),
      { success: 'Datos de la reunión guardados' },
    );
    if (saved) onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Nombre" htmlFor="title" error={errors.title?.message}>
        <input
          id="title"
          className={inputClass}
          aria-invalid={!!errors.title}
          aria-describedby={describedBy('title', errors.title?.message)}
          {...register('title')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha y hora" htmlFor="startsAt" error={errors.startsAt?.message}>
          <input
            id="startsAt"
            type="datetime-local"
            className={inputClass}
            {...register('startsAt')}
          />
        </Field>
        <Field label="Duración (minutos)" htmlFor="durationMin" error={errors.durationMin?.message}>
          <input
            id="durationMin"
            inputMode="numeric"
            className={inputClass}
            {...register('durationMin')}
          />
        </Field>
      </div>
      <Field label="Lugar" htmlFor="place" error={errors.place?.message}>
        <input id="place" className={inputClass} {...register('place')} />
      </Field>
      <Field label="Participantes" htmlFor="participants" hint="Uno por línea.">
        <textarea
          id="participants"
          className={textareaClass}
          aria-describedby="participants-hint"
          {...register('participants')}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

const STATUS_ACTIONS: { to: MeetingStatus; label: string }[] = [
  { to: 'reprogramada', label: 'Marcar como reprogramada' },
  { to: 'programada', label: 'Volver a programada' },
  { to: 'cancelada', label: 'Cancelar reunión' },
  { to: 'en_curso', label: 'Reabrir reunión' },
];

export default function ReunionDetallePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const meeting = useLiveQuery(async () => {
    const row = await db.meetings.get(id);
    return row && row.deletedAt === undefined ? row : null;
  }, [id]);

  if (meeting === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando…
      </p>
    );
  }
  if (meeting === null) {
    return (
      <EmptyState
        icon={Users}
        title="No encontramos esta reunión"
        description="Puede que se haya eliminado. Vuelve a la lista para ver las demás."
      >
        <Link to="/reuniones" className={cn(buttonVariants(), 'mt-5')}>
          Ir a Reuniones
        </Link>
      </EmptyState>
    );
  }

  const editable = meeting.status !== 'cerrada' && meeting.status !== 'cancelada';
  const canStart = canTransition(meeting.status, 'en_curso') && meeting.status !== 'cerrada';

  const start = async () => {
    const started = await attempt(() => changeMeetingStatus(meeting.id, 'en_curso'));
    if (started) navigate(`/reuniones/${meeting.id}/modo-reunion`);
  };

  return (
    <>
      <PageHeader
        eyebrow={formatDateTime(meeting.startsAt)}
        title={meeting.title}
        actions={
          meeting.status === 'en_curso' ? (
            <Link to={`/reuniones/${meeting.id}/modo-reunion`} className={cn(buttonVariants())}>
              <Play className="size-4" aria-hidden />
              Volver al modo reunión
            </Link>
          ) : canStart ? (
            <Button onClick={start}>
              <Play className="size-4" aria-hidden />
              Iniciar reunión
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-5">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Badge tone={MEETING_STATUS_TONE[meeting.status]}>
              {MEETING_STATUS_LABEL[meeting.status]}
            </Badge>
            {!editing && editable && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Editar datos
              </Button>
            )}
          </div>
          {editing ? (
            <DetailsForm meeting={meeting} onDone={() => setEditing(false)} />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Duración</dt>
                <dd>{meeting.durationMin} minutos</dd>
              </div>
              <div>
                <dt className="text-muted">Lugar</dt>
                <dd>{meeting.place ?? 'Sin definir'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Participantes</dt>
                <dd>
                  {meeting.participants.length > 0
                    ? meeting.participants.join(', ')
                    : 'Sin participantes'}
                </dd>
              </div>
              {meeting.summary && (
                <div className="sm:col-span-2">
                  <dt className="text-muted">Resumen al cerrar</dt>
                  <dd className="whitespace-pre-wrap">{meeting.summary}</dd>
                </div>
              )}
            </dl>
          )}
        </Card>

        <Card>
          <CardTitle>Agenda</CardTitle>
          <AgendaEditor meetingId={meeting.id} editable={editable} />
        </Card>

        <Card>
          <CardTitle>Decisiones, asignaciones y notas</CardTitle>
          <RecordList meetingId={meeting.id} editable={meeting.status === 'en_curso'} />
        </Card>

        <Card>
          <CardTitle>Estado y eliminación</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_ACTIONS.filter(
              (a) => canTransition(meeting.status, a.to) && a.to !== 'en_curso',
            ).map((a) =>
              a.to === 'cancelada' ? (
                <ConfirmButton
                  key={a.to}
                  confirmLabel="Sí, cancelar"
                  size="default"
                  onConfirm={async () => {
                    await attempt(() => changeMeetingStatus(meeting.id, a.to), {
                      success: 'Reunión cancelada. Sus notas y agenda se conservan.',
                    });
                  }}
                >
                  {a.label}
                </ConfirmButton>
              ) : (
                <Button
                  key={a.to}
                  variant="outline"
                  onClick={() => attempt(() => changeMeetingStatus(meeting.id, a.to))}
                >
                  {a.label}
                </Button>
              ),
            )}
            {meeting.status === 'cerrada' && (
              <Button variant="outline" onClick={start}>
                Reabrir reunión
              </Button>
            )}
            <ConfirmButton
              confirmLabel="Sí, eliminar"
              size="default"
              onConfirm={async () => {
                const done = await attempt(() => softDeleteEntity('meetings', meeting.id), {
                  success: 'Reunión eliminada. Se puede recuperar durante 30 días.',
                });
                if (done !== undefined) navigate('/reuniones');
              }}
            >
              Eliminar reunión
            </ConfirmButton>
          </div>
        </Card>
      </div>
    </>
  );
}
