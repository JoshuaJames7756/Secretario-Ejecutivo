import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, MessageCircle, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Card, CardTitle, EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { RequestForm } from '@/features/interviews/components/request-form';
import { SchedulePanel } from '@/features/interviews/components/schedule-panel';
import { summaryTitle } from '@/features/interviews/day-summary';
import { ConfirmedToggle } from '@/features/interviews/components/confirmed-toggle';
import {
  MODALITY_LABEL,
  REQUEST_STATUS_LABEL,
  TREATMENT_LABEL,
  confirmationMessage,
  formatClock,
  isRequestOpen,
  leaderShort,
  reasonLabel,
  whatsappUrl,
} from '@/features/interviews/model';
import {
  cancelAppointment,
  cancelRequest,
  completeAppointment,
  markContacted,
  setConfirmed,
  updateRequest,
} from '@/features/interviews/service';
import { usePresidencyNames } from '@/features/interviews/use-interview-data';
import { attempt } from '@/lib/actions';
import { cn, formatDateTime } from '@/lib/utils';

function MessageCard({
  text: initial,
  phone,
  appointmentId,
}: {
  text: string;
  phone?: string;
  appointmentId: string;
}) {
  const [text, setText] = useState(initial);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensaje copiado. Pégalo en WhatsApp para enviarlo.');
      void attempt(() => markContacted(appointmentId));
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  };
  return (
    <Card aria-labelledby="mensaje">
      <CardTitle>
        <span id="mensaje">Mensaje de confirmación</span>
      </CardTitle>
      <p className="mb-2 text-sm text-muted">
        La aplicación no envía nada. Revisa el texto, cópialo y envíalo tú.
      </p>
      <label htmlFor="mensaje-texto" className="sr-only">
        Texto del mensaje
      </label>
      <textarea
        id="mensaje-texto"
        className={cn(textareaClass, 'min-h-40')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button className="mt-3" variant="outline" onClick={copy}>
        <Copy className="size-4" aria-hidden />
        Copiar mensaje
      </Button>
      {phone && (
        <Button
          className="mt-3 ml-2"
          onClick={() => {
            window.open(whatsappUrl(phone, text), '_blank', 'noopener');
            void attempt(() => markContacted(appointmentId));
          }}
        >
          <MessageCircle className="size-4" aria-hidden />
          Abrir en WhatsApp
        </Button>
      )}
    </Card>
  );
}

export default function EntrevistaDetallePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const names = usePresidencyNames();

  const data = useLiveQuery(async () => {
    const request = await db.interviewRequests.get(id);
    if (!request || !isActive(request)) return null;
    const [appointments, organization] = await Promise.all([
      db.interviewAppointments.where('requestId').equals(id).filter(isActive).toArray(),
      request.organizationId ? db.organizations.get(request.organizationId) : undefined,
    ]);
    return {
      request,
      appointments: appointments.sort((a, b) => b.startsAt - a.startsAt),
      organization,
    };
  }, [id]);

  if (data === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando…
      </p>
    );
  }
  if (data === null) {
    return (
      <EmptyState
        icon={UserRound}
        title="No encontramos esta solicitud"
        description="Puede que se haya eliminado."
      >
        <Link to="/entrevistas" className={cn(buttonVariants(), 'mt-5')}>
          Ir a Entrevistas
        </Link>
      </EmptyState>
    );
  }

  const { request, appointments, organization } = data;
  const current = appointments.find((a) => a.status === 'programada');
  const history = appointments.filter((a) => a !== current);
  const open = isRequestOpen(request.status);

  return (
    <>
      <PageHeader
        eyebrow={organization?.name ?? 'Sin barrio o rama'}
        title={`${TREATMENT_LABEL[request.treatment ?? 'hermano']} ${request.personName}`}
        actions={<Badge tone="primary">{REQUEST_STATUS_LABEL[request.status]}</Badge>}
      />

      <div className="space-y-5">
        <Card>
          {editing ? (
            <RequestForm
              initial={request}
              submitLabel="Guardar cambios"
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                const saved = await attempt(() => updateRequest(request.id, input), {
                  success: 'Solicitud actualizada',
                });
                if (saved) setEditing(false);
              }}
            />
          ) : (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Motivo</dt>
                  <dd>{reasonLabel(request)}</dd>
                </div>
                {request.phone && (
                  <div>
                    <dt className="text-muted">WhatsApp</dt>
                    <dd className="tabular-nums">+{request.phone}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted">Modalidad</dt>
                  <dd>{MODALITY_LABEL[request.modality ?? 'presencial']}</dd>
                </div>
                {request.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Notas administrativas</dt>
                    <dd className="whitespace-pre-wrap">{request.notes}</dd>
                  </div>
                )}
                {request.waitlist && (
                  <div className="sm:col-span-2">
                    <Badge tone="warning">En lista de espera</Badge>
                  </div>
                )}
              </dl>
              {open && (
                <Button
                  className="mt-4"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  Editar solicitud
                </Button>
              )}
            </>
          )}
        </Card>

        {current && (
          <Card aria-labelledby="cita-actual">
            <CardTitle>
              <span id="cita-actual">Cita programada</span>
            </CardTitle>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-semibold">
                  {formatClock(current.startsAt)}
                </p>
                <p className="text-muted">
                  {summaryTitle(new Date(current.startsAt))} · {leaderShort(current.leader, names)}
                  {current.special && ' · Día especial'}
                </p>
              </div>
              <ConfirmedToggle
                personName={request.personName}
                confirmed={current.confirmed === true}
                onChange={(next) => {
                  void attempt(() => setConfirmed(current.id, next));
                }}
              />
            </div>
            {rescheduling ? (
              <div className="mt-4 border-t border-border pt-4">
                <SchedulePanel
                  request={request}
                  organization={organization}
                  reschedule={current}
                  onDone={() => setRescheduling(false)}
                />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setRescheduling(true)}>
                  Reprogramar
                </Button>
                <Link
                  to={`/entrevistas/nueva?copiar=${request.id}`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  Agendar otra igual
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    attempt(() => completeAppointment(current.id), {
                      success: 'Entrevista marcada como completada',
                    })
                  }
                >
                  Marcar completada
                </Button>
                <ConfirmButton
                  confirmLabel="Sí, cancelar la cita"
                  onConfirm={async () => {
                    await attempt(() => cancelAppointment(current.id), {
                      success: 'Cita cancelada. La solicitud sigue pendiente de coordinar.',
                    });
                  }}
                >
                  Cancelar la cita
                </ConfirmButton>
              </div>
            )}
          </Card>
        )}

        {current && !rescheduling && (
          <MessageCard
            key={current.id}
            phone={request.phone}
            appointmentId={current.id}
            text={confirmationMessage({
              personName: request.personName,
              treatment: request.treatment,
              leader: current.leader,
              startsAt: current.startsAt,
              modality: request.modality,
              names,
            })}
          />
        )}

        {!current && open && (
          <Card aria-labelledby="programar">
            <CardTitle>
              <span id="programar">Programar entrevista</span>
            </CardTitle>
            <SchedulePanel request={request} organization={organization} />
          </Card>
        )}

        {history.length > 0 && (
          <Card aria-labelledby="historial-citas">
            <CardTitle>
              <span id="historial-citas">Historial de citas</span>
            </CardTitle>
            <ul className="space-y-1 text-sm">
              {history.map((a) => (
                <li key={a.id}>
                  {formatDateTime(a.startsAt)} · {leaderShort(a.leader, names)} ·{' '}
                  <span className="text-muted">{a.status}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {open && (
          <Card>
            <ConfirmButton
              size="default"
              confirmLabel="Sí, cancelar la solicitud"
              onConfirm={async () => {
                const done = await attempt(() => cancelRequest(request.id).then(() => true), {
                  success: 'Solicitud cancelada',
                });
                if (done !== undefined) navigate('/entrevistas');
              }}
            >
              Cancelar la solicitud
            </ConfirmButton>
          </Card>
        )}
      </div>
    </>
  );
}
