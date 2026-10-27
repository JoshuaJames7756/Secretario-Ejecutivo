import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, PageHeader } from '@/components/shared/page';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { db } from '@/db/database';
import { getControllerState, subscribeController, triggerSync } from '@/features/sync/controller';
import { ConflictCard } from '@/features/sync/components/conflict-card';
import { retryFailed } from '@/features/sync/engine';
import { useSyncStatus, type SyncPhase } from '@/features/sync/use-sync-status';
import { attempt } from '@/lib/actions';
import { formatDateTime } from '@/lib/utils';

const TONE: Record<SyncPhase, BadgeTone> = {
  desactivada: 'neutral',
  'sin-sesion': 'neutral',
  'no-autorizada': 'danger',
  sincronizando: 'primary',
  conflicto: 'warning',
  error: 'warning',
  'sin-conexion': 'warning',
  pendiente: 'primary',
  sincronizado: 'success',
};

export default function SincronizacionPage() {
  const status = useSyncStatus();
  const controller = useSyncExternalStore(subscribeController, getControllerState);
  const conflicts = useLiveQuery(() => db.syncConflicts.orderBy('id').toArray(), []);
  const bridge = controller.bridge;
  const signedIn = controller.auth === 'con-sesion';

  const syncNow = async () => {
    const outcome = await triggerSync();
    const after = getControllerState();
    if (after.error) toast.error(after.error);
    else if (outcome) {
      toast.success(
        outcome.sent + outcome.received === 0
          ? 'Todo estaba al día.'
          : `Enviados ${outcome.sent}, recibidos ${outcome.received}.`,
      );
    }
  };

  return (
    <>
      <PageHeader
        title="Sincronización"
        description="Tus datos siempre se guardan primero en este dispositivo y funcionan sin conexión. Con sesión iniciada, además se copian a tu servidor privado para usarlos en otro dispositivo."
      />

      <div className="space-y-5">
        <Card aria-labelledby="estado-sync">
          <CardTitle>
            <span id="estado-sync">Estado</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[status.phase]}>{status.label}</Badge>
            {status.lastAt && (
              <span className="text-sm text-muted">
                Última vez: {formatDateTime(status.lastAt)}
              </span>
            )}
          </div>

          {!controller.configured && (
            <p className="mt-3 text-sm">
              La sincronización no está activada en esta versión de la aplicación. Todo funciona en
              este dispositivo. Para activarla hace falta configurar el inicio de sesión (consulta
              el README, sección Fase 4).
            </p>
          )}

          {controller.configured && controller.auth === 'desconocida' && (
            <p className="mt-3 text-sm text-muted">
              Cargando el inicio de sesión. Si no tienes conexión, la aplicación funciona igual y se
              conectará cuando vuelva internet.
            </p>
          )}

          {controller.auth === 'no-autorizada' && (
            <p className="mt-3 text-sm">
              Esta cuenta no tiene permiso para usar este servidor. Cierra la sesión e inicia con la
              cuenta correcta. Mientras tanto nada se envía y todo sigue guardado aquí.
            </p>
          )}

          {status.error && signedIn && <p className="mt-3 text-sm">{status.error}</p>}

          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-muted">Por enviar</dt>
              <dd className="text-xl font-semibold">{status.pending}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-muted">Sin enviar</dt>
              <dd className="text-xl font-semibold">{status.failed}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-muted">Conflictos</dt>
              <dd className="text-xl font-semibold">{status.conflicts}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {controller.configured && bridge && !bridge.isSignedIn && (
              <Button onClick={() => bridge.openSignIn()}>Iniciar sesión para sincronizar</Button>
            )}
            {signedIn && (
              <Button onClick={() => void syncNow()} disabled={controller.running}>
                {controller.running ? 'Sincronizando…' : 'Sincronizar ahora'}
              </Button>
            )}
            {status.failed > 0 && signedIn && (
              <Button
                variant="outline"
                onClick={() =>
                  attempt(async () => {
                    await retryFailed();
                    await triggerSync();
                  })
                }
              >
                Reintentar lo que falló
              </Button>
            )}
            {bridge?.isSignedIn && (
              <Button variant="ghost" onClick={() => void bridge.signOut()}>
                Cerrar sesión{bridge.email ? ` (${bridge.email})` : ''}
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">
            Cerrar sesión no borra nada de este dispositivo. Los archivos adjuntos todavía no se
            sincronizan: se quedan solo aquí.
          </p>
        </Card>

        {conflicts && conflicts.length > 0 && (
          <Card aria-labelledby="conflictos">
            <CardTitle>
              <span id="conflictos">Cambios por decidir</span>
            </CardTitle>
            <p className="mb-3 text-sm text-muted">
              Estos elementos se cambiaron aquí y en otro dispositivo a la vez. Nada se ha pisado:
              elige cuál versión conservar.
            </p>
            <ul className="space-y-3">
              {conflicts.map((conflict) => (
                <ConflictCard key={conflict.id} conflict={conflict} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
