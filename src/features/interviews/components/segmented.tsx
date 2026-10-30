import { cn } from '@/lib/utils';

/** Selector de una opción entre pocas, con botones grandes (un toque y listo). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'min-h-11 rounded-xl border px-3 text-sm leading-tight transition-colors motion-reduce:transition-none',
                active
                  ? 'border-primary bg-primary-soft font-semibold text-primary-soft-fg'
                  : 'border-border-strong bg-surface hover:bg-surface-2',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
