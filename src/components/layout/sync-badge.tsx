import {
  AlertTriangle,
  Cloud,
  CloudOff,
  CloudUpload,
  HardDrive,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { useSyncStatus, type SyncPhase } from '@/features/sync/use-sync-status';
import { cn } from '@/lib/utils';

const ICONS: Record<SyncPhase, LucideIcon> = {
  desactivada: HardDrive,
  'sin-sesion': HardDrive,
  'no-autorizada': AlertTriangle,
  sincronizando: LoaderCircle,
  conflicto: AlertTriangle,
  error: AlertTriangle,
  'sin-conexion': CloudOff,
  pendiente: CloudUpload,
  sincronizado: Cloud,
};

/**
 * Estado de guardado siempre a la vista. Lo local siempre está guardado; esto dice si además
 * está copiado en el servidor. Lleva a la pantalla de sincronización.
 */
export function SyncBadge({ className }: { className?: string }) {
  const status = useSyncStatus();
  const Icon = ICONS[status.phase];
  const attention =
    status.phase === 'conflicto' || status.phase === 'error' || status.phase === 'no-autorizada';
  return (
    <Link
      to="/sincronizacion"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-xs font-medium',
        attention ? 'border-warning text-fg' : 'border-border text-muted',
        className,
      )}
      title="Ver el estado de la sincronización. Tus datos siempre se guardan primero en este dispositivo."
    >
      <Icon
        className={cn('size-3.5', status.phase === 'sincronizando' && 'animate-spin')}
        aria-hidden
      />
      {status.label}
    </Link>
  );
}
