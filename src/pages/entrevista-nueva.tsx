import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/shared/page';
import { RequestForm } from '@/features/interviews/components/request-form';
import { createRequest } from '@/features/interviews/service';
import { attempt } from '@/lib/actions';

export default function EntrevistaNuevaPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Nueva solicitud de entrevista"
        description="Registra solo lo necesario para coordinar la cita."
      />
      <RequestForm
        submitLabel="Registrar solicitud"
        onCancel={() => navigate('/entrevistas')}
        onSubmit={async (input) => {
          const created = await attempt(() => createRequest(input), {
            success: 'Solicitud registrada',
          });
          if (created) navigate(`/entrevistas/${created.id}`);
        }}
      />
    </>
  );
}
