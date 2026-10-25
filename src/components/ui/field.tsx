import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-muted disabled:opacity-60 aria-[invalid=true]:border-danger';

export const textareaClass =
  'min-h-24 w-full rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-base text-fg placeholder:text-muted disabled:opacity-60 aria-[invalid=true]:border-danger';

/** Etiqueta + control + ayuda + error junto al campo, enlazados para lectores de pantalla. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Para `aria-describedby` del control. */
export function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
