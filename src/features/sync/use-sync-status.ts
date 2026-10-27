import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { db } from '@/db/database';
import { SYNC_LAST_KEY, getSetting } from '@/db/settings';
import { getControllerState, subscribeController } from './controller';

export type SyncPhase =
  | 'desactivada'
  | 'sin-sesion'
  | 'no-autorizada'
  | 'sincronizando'
  | 'conflicto'
  | 'error'
  | 'sin-conexion'
  | 'pendiente'
  | 'sincronizado';

export interface SyncStatus {
  phase: SyncPhase;
  /** Texto corto para la interfaz, escrito para personas. */
  label: string;
  pending: number;
  conflicts: number;
  failed: number;
  lastAt?: number;
  error?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Función pura: de los números y del estado de la sesión al estado que se muestra. */
export function describePhase(input: {
  configured: boolean;
  auth: 'desconocida' | 'sin-sesion' | 'con-sesion' | 'no-autorizada';
  running: boolean;
  error?: string;
  pending: number;
  conflicts: number;
  failed: number;
}): Pick<SyncStatus, 'phase' | 'label'> {
  if (!input.configured) return { phase: 'desactivada', label: 'Guardado en este dispositivo' };
  if (input.auth === 'no-autorizada') {
    return { phase: 'no-autorizada', label: 'Cuenta no autorizada' };
  }
  if (input.auth !== 'con-sesion') {
    return { phase: 'sin-sesion', label: 'Solo en este dispositivo' };
  }
  if (input.conflicts > 0) {
    return {
      phase: 'conflicto',
      label: `${plural(input.conflicts, 'conflicto', 'conflictos')} por resolver`,
    };
  }
  if (input.running) return { phase: 'sincronizando', label: 'Sincronizando…' };
  if (input.failed > 0) {
    return { phase: 'error', label: `${plural(input.failed, 'cambio', 'cambios')} sin enviar` };
  }
  if (input.error) return { phase: 'sin-conexion', label: 'Sin conexión con el servidor' };
  if (input.pending > 0) {
    return {
      phase: 'pendiente',
      label: `${plural(input.pending, 'cambio', 'cambios')} por enviar`,
    };
  }
  return { phase: 'sincronizado', label: 'Sincronizado' };
}

export function useSyncStatus(): SyncStatus {
  const controller = useSyncExternalStore(subscribeController, getControllerState);
  const counts = useLiveQuery(async () => {
    const [pending, failed, conflicts, lastAt] = await Promise.all([
      db.syncOps.where('status').anyOf('pendiente', 'enviando').count(),
      db.syncOps.where('status').equals('error').count(),
      db.syncConflicts.count(),
      getSetting<number>(SYNC_LAST_KEY),
    ]);
    return { pending, failed, conflicts, lastAt };
  }, []);

  const pending = counts?.pending ?? 0;
  const failed = counts?.failed ?? 0;
  const conflicts = counts?.conflicts ?? 0;
  return {
    ...describePhase({
      configured: controller.configured,
      auth: controller.auth,
      running: controller.running,
      error: controller.error,
      pending,
      conflicts,
      failed,
    }),
    pending,
    conflicts,
    failed,
    lastAt: counts?.lastAt,
    error: controller.error,
  };
}
