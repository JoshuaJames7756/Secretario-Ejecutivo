import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Marca de «Confirmada». Es un interruptor accesible (role="switch"): el estado se lee en
 * texto, no solo por color. El círculo se rellena con una pequeña transición que respeta
 * la preferencia de movimiento reducido.
 */
export function ConfirmedToggle({
  confirmed,
  onChange,
  personName,
  size = 'md',
  stacked,
  disabled,
}: {
  confirmed: boolean;
  onChange: (next: boolean) => void;
  personName: string;
  size?: 'sm' | 'md';
  /** Círculo arriba y texto debajo: ocupa poco ancho en el teléfono. */
  stacked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={confirmed}
      aria-label={`Confirmada: ${personName}`}
      disabled={disabled}
      onClick={() => onChange(!confirmed)}
      className={cn(
        'group shrink-0 border font-medium transition-colors duration-200 motion-reduce:transition-none',
        stacked
          ? 'flex w-[4.75rem] flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] leading-tight'
          : 'inline-flex items-center gap-2 rounded-full text-sm',
        !stacked && (size === 'md' ? 'min-h-11 py-1 pr-3.5 pl-1.5' : 'min-h-9 py-0.5 pr-3 pl-1'),
        confirmed
          ? 'border-success/40 bg-success-soft text-success'
          : 'border-border-strong bg-surface text-muted hover:bg-surface-2',
        disabled && 'opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-full border-2 transition-all duration-200 motion-reduce:transition-none',
          size === 'md' ? 'size-7' : 'size-6',
          confirmed
            ? 'scale-100 border-success bg-success text-surface'
            : 'border-border-strong bg-transparent text-transparent group-hover:border-muted',
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
      <span className={stacked ? 'text-center' : undefined}>
        {confirmed ? 'Confirmada' : 'Sin confirmar'}
      </span>
    </button>
  );
}
