import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { PageHeader } from '@/components/shared/page';
import { RequestForm } from '@/features/interviews/components/request-form';
import { createAndSchedule, createRequest } from '@/features/interviews/service';
import { attempt } from '@/lib/actions';

export default function EntrevistaNuevaPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const copyId = params.get('copiar');
  const source = useLiveQuery(async () => {
    if (!copyId) return null;
    const request = await db.interviewRequests.get(copyId);
    if (!request || !isActive(request)) return null;
    const appointment = (
      await db.interviewAppointments.where('requestId').equals(copyId).filter(isActive).toArray()
    )
      .filter((a) => a.status === 'programada')
      .sort((a, b) => b.startsAt - a.startsAt)[0];
    return { request, appointment };
  }, [copyId]);
  if (copyId && source === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando…
      </p>
    );
  }
  return (
    <>
      <PageHeader
        title="Nueva entrevista"
        description="Persona, motivo, quién y cuándo, todo en una pantalla."
      />
      <RequestForm
        copyFrom={source ?? undefined}
        submitLabel="Agendar entrevista"
        onCancel={() => navigate('/entrevistas')}
        onSubmit={async (input) => {
          const created = await attempt(() => createRequest(input), {
            success: 'Guardada sin horario. Quedó por coordinar.',
          });
          if (created) navigate(`/entrevistas/${created.id}`);
        }}
        onSchedule={async (input, slot) => {
          const created = await attempt(() => createAndSchedule(input, slot), {
            success: 'Entrevista agendada',
          });
          if (created) navigate(`/entrevistas/${created.request.id}`);
        }}
      />
    </>
  );
}
