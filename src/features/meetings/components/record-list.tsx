import { useLiveQuery } from 'dexie-react-hooks';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Badge } from '@/components/ui/badge';
import type { Id, MeetingRecord, RecordType } from '@/db/types';
import { RECORD_TYPE_LABEL } from '@/features/meetings/labels';
import { agendaQuery, recordsQuery, removeRecord } from '@/features/meetings/service';
import { attempt } from '@/lib/actions';

/** Orden de lectura en un resumen: lo decidido primero. */
const GROUP_ORDER: Exclude<RecordType, 'nota'>[] = [
  'decision',
  'asignacion',
  'pendiente',
  'propuesta',
  'informativa',
];

const GROUP_TITLE: Record<Exclude<RecordType, 'nota'>, string> = {
  decision: 'Decisiones confirmadas',
  asignacion: 'Asignaciones',
  pendiente: 'Asuntos pendientes',
  propuesta: 'Propuestas',
  informativa: 'Notas informativas',
};

export function RecordList({ meetingId, editable }: { meetingId: Id; editable: boolean }) {
  const records = useLiveQuery(() => recordsQuery(meetingId), [meetingId]);
  const agenda = useLiveQuery(() => agendaQuery(meetingId), [meetingId]);

  if (records === undefined || agenda === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando registros…
      </p>
    );
  }

  const titleOf = (id?: Id) => agenda.find((a) => a.id === id)?.title;
  const byType = (type: RecordType): MeetingRecord[] => records.filter((r) => r.type === type);
  const shown = GROUP_ORDER.filter((type) => byType(type).length > 0);

  if (shown.length === 0) {
    return (
      <p className="text-muted">Todavía no hay decisiones, asignaciones ni otros registros.</p>
    );
  }

  return (
    <div className="space-y-5">
      {shown.map((type) => (
        <section key={type} aria-label={GROUP_TITLE[type]}>
          <h3 className="mb-2 text-sm font-semibold text-muted">
            {GROUP_TITLE[type]} ({byType(type).length})
          </h3>
          <ul className="space-y-2">
            {byType(type).map((record) => (
              <li key={record.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="primary">{RECORD_TYPE_LABEL[record.type]}</Badge>
                  {record.isPrivate && <Badge tone="warning">Privado</Badge>}
                  {titleOf(record.agendaItemId) && (
                    <span className="text-sm text-muted">En: {titleOf(record.agendaItemId)}</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap">{record.content}</p>
                {editable && (
                  <div className="mt-2 border-t border-border pt-2">
                    <ConfirmButton
                      ariaLabel={`Eliminar registro: ${record.content.slice(0, 40)}`}
                      confirmLabel="Eliminar registro"
                      onConfirm={() =>
                        attempt(() => removeRecord(record.id), {
                          success: 'Registro eliminado. Se puede recuperar durante 30 días.',
                        })
                      }
                    >
                      Eliminar
                    </ConfirmButton>
                    {(record.type === 'asignacion' || record.type === 'pendiente') && (
                      <span className="ml-2 text-sm text-muted">
                        El seguimiento creado no se elimina.
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
