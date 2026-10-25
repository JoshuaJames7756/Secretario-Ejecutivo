import { Check, CircleAlert, Loader2, PencilLine } from 'lucide-react';
import type { SaveState } from '@/hooks/use-autosave';
import { cn } from '@/lib/utils';

/**
 * Indicador de guardado. "Guardado en este dispositivo" no afirma que exista copia en la nube
 * (especificación, 15.2): la sincronización llega en una fase posterior.
 */
export function SaveStatus({
  state,
  onRetry,
  className,
}: {
  state: SaveState;
  onRetry?: () => void;
  className?: string;
}) {
  const content = {
    saved: { icon: Check, text: 'Guardado en este dispositivo', tone: 'text-muted' },
    pending: { icon: PencilLine, text: 'Cambios sin guardar…', tone: 'text-muted' },
    saving: { icon: Loader2, text: 'Guardando…', tone: 'text-muted' },
    error: {
      icon: CircleAlert,
      text: 'No se pudo guardar. Tu texto sigue en pantalla.',
      tone: 'text-danger',
    },
  }[state];
  const Icon = content.icon;

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-1.5 text-sm', content.tone, className)}
    >
      <Icon className={cn('size-4 shrink-0', state === 'saving' && 'animate-spin')} aria-hidden />
      <span>{content.text}</span>
      {state === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 font-medium underline underline-offset-2"
        >
          Reintentar
        </button>
      )}
    </p>
  );
}
