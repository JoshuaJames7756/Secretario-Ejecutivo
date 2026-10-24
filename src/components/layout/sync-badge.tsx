import { HardDrive } from 'lucide-react';

/**
 * Estado de guardado. En la Fase 1 no existe sincronización: el texto lo dice con claridad
 * para no dar a entender que hay un respaldo en la nube.
 */
export function SyncBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted ${className ?? ''}`}
      title="La sincronización con la nube se activará en una fase posterior. Tus datos están guardados solo en este dispositivo."
    >
      <HardDrive className="size-3.5" aria-hidden />
      Guardado en este dispositivo
    </span>
  );
}
