import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from '@/features/meetings/labels';
import {
  MIN_QUERY_LENGTH,
  RESULT_KIND_LABEL,
  search,
  type ResultKind,
} from '@/features/search/service';
import { cn, formatDateTime } from '@/lib/utils';

const KINDS = Object.keys(RESULT_KIND_LABEL) as ResultKind[];

export default function HistorialPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ResultKind | 'todos'>('todos');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const deferred = useDeferredValue(query);
  const ready = deferred.trim().length >= MIN_QUERY_LENGTH;

  const results = useLiveQuery(
    () =>
      ready
        ? search(deferred, {
            kinds: kind === 'todos' ? undefined : [kind],
            from: from ? new Date(`${from}T00:00:00`).getTime() : undefined,
            to: to ? new Date(`${to}T23:59:59`).getTime() : undefined,
          })
        : Promise.resolve(undefined),
    [deferred, kind, from, to, ready],
  );

  const recent = useLiveQuery(async () => {
    const all = await db.meetings.filter((m) => isActive(m) && m.status === 'cerrada').toArray();
    return all.sort((a, b) => b.startsAt - a.startsAt).slice(0, 10);
  }, []);

  return (
    <>
      <PageHeader
        title="Historial y búsqueda"
        description="Busca en reuniones, notas, decisiones, asignaciones y entrevistas. Cada resultado abre el registro original."
        actions={
          <Link to="/papelera" className={cn(buttonVariants({ variant: 'outline' }))}>
            <Trash2 className="size-4" aria-hidden />
            Papelera
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Field
          label="Buscar"
          htmlFor="buscar"
          className="sm:col-span-2"
          hint="No distingue mayúsculas ni tildes."
        >
          <input
            id="buscar"
            type="search"
            className={inputClass}
            aria-describedby="buscar-hint"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Desde" htmlFor="buscar-desde">
          <input
            id="buscar-desde"
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Hasta" htmlFor="buscar-hasta">
          <input
            id="buscar-hasta"
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>

      <div role="radiogroup" aria-label="Tipo de resultado" className="mb-5 flex flex-wrap gap-2">
        {(['todos', ...KINDS] as const).map((value) => {
          const selected = kind === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(value)}
              className={cn(
                'min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary-soft text-primary-soft-fg'
                  : 'border-border-strong bg-surface hover:bg-surface-2',
              )}
            >
              {value === 'todos' ? 'Todo' : RESULT_KIND_LABEL[value]}
            </button>
          );
        })}
      </div>

      {!ready ? (
        <section aria-label="Reuniones recientes" className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">Últimas reuniones cerradas</h2>
          {recent === undefined ? (
            <p role="status" className="text-muted">
              Cargando…
            </p>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nada que buscar todavía"
              description={`Escribe al menos ${MIN_QUERY_LENGTH} letras para buscar. Cuando cierres reuniones, las últimas aparecerán aquí.`}
            />
          ) : (
            <ul className="space-y-2">
              {recent.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/reuniones/${m.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
                  >
                    <span>
                      <span className="block font-medium">{m.title}</span>
                      <span className="block text-sm text-muted">{formatDateTime(m.startsAt)}</span>
                    </span>
                    <Badge tone={MEETING_STATUS_TONE[m.status]}>
                      {MEETING_STATUS_LABEL[m.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : results === undefined ? (
        <p role="status" className="text-muted">
          Buscando…
        </p>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description="Prueba con otras palabras, quita el filtro de tipo o amplía las fechas."
        />
      ) : (
        <section aria-label="Resultados">
          <p role="status" className="mb-2 text-sm text-muted">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </p>
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <Link
                  to={r.to}
                  className="block rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="primary">{RESULT_KIND_LABEL[r.kind]}</Badge>
                    {r.isPrivate && <Badge tone="warning">Privado</Badge>}
                    {r.context && <span className="text-sm text-muted">{r.context}</span>}
                    {r.at !== undefined && (
                      <span className="text-sm text-muted">· {formatDateTime(r.at)}</span>
                    )}
                  </span>
                  <span className="mt-1 block font-medium text-balance">{r.title}</span>
                  {r.snippet && (
                    <span className="mt-0.5 block text-sm text-muted">{r.snippet}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
