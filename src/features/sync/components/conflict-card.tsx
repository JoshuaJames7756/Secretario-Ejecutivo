import { ConfirmButton } from '@/components/shared/confirm-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SyncConflict } from '@/db/types';
import { attempt } from '@/lib/actions';
import { formatDateTime } from '@/lib/utils';
import { canKeepBoth, differences, keepBoth, keepMine, keepTheirs } from '../conflicts';

const ENTITY_LABEL: Record<string, string> = {
  templates: 'Plantilla',
  meetings: 'Reunión',
  agendaItems: 'Punto de agenda',
  records: 'Registro de reunión',
  followUps: 'Seguimiento',
  organizations: 'Organización',
  leaderAvailability: 'Disponibilidad de un líder',
  interviewRequests: 'Solicitud de entrevista',
  interviewAppointments: 'Cita de entrevista',
};

const FIELD_LABEL: Record<string, string> = {
  content: 'Texto',
  notes: 'Notas',
  title: 'Título',
  description: 'Descripción',
  status: 'Estado',
  name: 'Nombre',
  dueDate: 'Fecha límite',
  assignee: 'Responsable',
  place: 'Lugar',
  startsAt: 'Inicio',
  deletedAt: 'Eliminado',
  isPrivate: 'Privado',
  type: 'Tipo',
  order: 'Posición',
  prep: 'Preparación',
};

function show(value: unknown): string {
  if (value === undefined || value === null || value === '') return '(vacío)';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && value > 946_684_800_000) return formatDateTime(value);
  return JSON.stringify(value);
}

/**
 * Un cambio hecho aquí chocó con otro hecho en otro dispositivo. Nada se aplicó todavía:
 * la persona ve los dos lados y decide. Ninguna opción pierde texto en silencio.
 */
export function ConflictCard({ conflict }: { conflict: SyncConflict }) {
  const diffs = differences(conflict);
  const label = ENTITY_LABEL[conflict.entity] ?? 'Elemento';
  const serverDeleted = conflict.server['deletedAt'] !== undefined;
  const localDeleted = conflict.local['deletedAt'] !== undefined;

  return (
    <li className="rounded-xl border border-warning bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Conflicto</Badge>
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted">detectado {formatDateTime(conflict.detectedAt)}</span>
      </div>
      {(serverDeleted || localDeleted) && (
        <p className="mt-2 text-sm">
          {serverDeleted
            ? 'En el otro dispositivo este elemento se eliminó.'
            : 'Aquí este elemento se eliminó y en el otro dispositivo se modificó.'}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {diffs.length === 0 && (
          <p className="text-sm text-muted">Los dos lados tienen cambios en datos internos.</p>
        )}
        {diffs.map((d) => (
          <div key={d.field}>
            <p className="mb-1 text-sm font-medium">{FIELD_LABEL[d.field] ?? d.field}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-surface-2 p-2.5 text-sm">
                <p className="mb-1 text-xs font-semibold text-muted uppercase">Este dispositivo</p>
                <p className="whitespace-pre-wrap">{show(d.local)}</p>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5 text-sm">
                <p className="mb-1 text-xs font-semibold text-muted uppercase">Servidor</p>
                <p className="whitespace-pre-wrap">{show(d.server)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          onClick={() =>
            attempt(() => keepMine(conflict), {
              success: 'Se conservó la versión de este dispositivo.',
            })
          }
        >
          Conservar la de este dispositivo
        </Button>
        {canKeepBoth(conflict) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              attempt(() => keepBoth(conflict), { success: 'Se unieron los dos textos.' })
            }
          >
            Conservar ambas
          </Button>
        )}
        <ConfirmButton
          confirmLabel="Usar la del servidor"
          onConfirm={() =>
            attempt(() => keepTheirs(conflict), { success: 'Se usó la versión del servidor.' })
          }
        >
          Usar la del servidor
        </ConfirmButton>
      </div>
      <p className="mt-2 text-xs text-muted">
        Si eliges la del servidor, el texto que escribiste aquí queda en «Versiones anteriores».
      </p>
    </li>
  );
}
