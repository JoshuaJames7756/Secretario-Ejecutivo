import { useEffect, type ComponentType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title === 'Inicio' ? 'Secretaría de Estaca' : `${title} · Secretaría`;
  }, [title]);
}

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  usePageTitle(title);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm text-muted">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-prose text-muted text-pretty">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section
      className={cn('rounded-card border border-border bg-surface p-5 shadow-card', className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
  );
}

/** Etiqueta que indica en qué fase del proyecto llega una función. */
export function PhaseTag({ phase }: { phase: number }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted">
      Fase {phase}
    </span>
  );
}

interface EmptyStateProps {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  description: string;
  phase?: number;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, phase, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
        <Icon className="size-6" aria-hidden />
      </div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-muted text-pretty">{description}</p>
      {phase !== undefined && (
        <p className="mt-4">
          <PhaseTag phase={phase} />
        </p>
      )}
      {children}
    </div>
  );
}
