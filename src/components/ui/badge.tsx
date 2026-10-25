import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** El significado nunca depende solo del color: el texto siempre dice el estado. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
