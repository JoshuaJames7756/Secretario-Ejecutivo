import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { purgeEntity, purgeExpired, restoreEntity } from '@/db/repo';
import { countExpired, listTrash } from '@/features/trash/service';
import { attempt } from '@/lib/actions';
import { formatDateTime } from '@/lib/utils';

export default function PapeleraPage() {
  const [now] = useState(() => Date.now());
  const data = useLiveQuery(
    async () => ({
      items: await listTrash(now),
      expired: await countExpired(now),
    }),
    [now],
  );

  return (
    <>
      <PageHeader
        title="Papelera"
        description="Lo que eliminas se conserva 30 días y se puede recuperar. Pasado ese plazo ya no."
      />
      {data === undefined ? (
        <p role="status" className="text-muted">
          Cargando…
        </p>
      ) : (
        <div className="space-y-5">
          {data.items.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="La papelera está vacía"
              description="Cuando elimines una reunión, un punto, un registro o un seguimiento, aparecerá aquí."
            />
          ) : (
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li
                  key={`${item.entity}:${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge>{item.kind}</Badge>
                      <span className="font-medium text-balance">{item.label}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Eliminado {formatDateTime(item.deletedAt)} ·{' '}
                      {item.daysLeft <= 1
                        ? 'vence hoy'
                        : `quedan ${item.daysLeft} ${item.daysLeft === 1 ? 'día' : 'días'}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        attempt(() => restoreEntity(item.entity, item.id), {
                          success: 'Recuperado',
                        })
                      }
                    >
                      Recuperar
                    </Button>
                    <ConfirmButton
                      ariaLabel={`Eliminar definitivamente: ${item.label}`}
                      confirmLabel="Eliminar para siempre"
                      onConfirm={() =>
                        attempt(() => purgeEntity(item.entity, item.id), {
                          success: 'Eliminado definitivamente',
                        })
                      }
                    >
                      Eliminar para siempre
                    </ConfirmButton>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.expired > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm">
                Hay {data.expired} {data.expired === 1 ? 'elemento' : 'elementos'} con más de 30
                días en la papelera. Ya no se pueden recuperar.
              </p>
              <ConfirmButton
                size="default"
                confirmLabel="Sí, eliminarlos"
                onConfirm={async () => {
                  await attempt(() => purgeExpired(), { success: 'Papelera depurada' });
                }}
              >
                Eliminar definitivamente los vencidos
              </ConfirmButton>
            </div>
          )}
        </div>
      )}
    </>
  );
}
