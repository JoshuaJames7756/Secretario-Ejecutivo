import { useLiveQuery } from 'dexie-react-hooks';
import { ListChecks, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, inputClass, textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import type { FollowUp, FollowUpStatus } from '@/db/types';
import {
  FOLLOW_UP_KIND_LABEL,
  FOLLOW_UP_STATUS_LABEL,
  STATUSES_BY_KIND,
  isClosedStatus,
  isOverdue,
  toDateString,
  type FollowUpKind,
} from '@/features/followups/model';
import {
  createFollowUp,
  setFollowUpStatus,
  updateFollowUpDetails,
} from '@/features/followups/service';
import { attempt } from '@/lib/actions';

type StatusFilter = 'abiertos' | 'cerrados' | 'todos';
type KindFilter = 'todos' | FollowUpKind;

function NewFollowUpForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<FollowUpKind>('pendiente');
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const created = await attempt(() => createFollowUp({ kind, text, assignee, dueDate }), {
      success: 'Seguimiento creado',
    });
    setBusy(false);
    if (created) onDone();
  };

  return (
    <form
      onSubmit={submit}
      className="mb-6 space-y-4 rounded-card border border-border bg-surface p-5"
      aria-label="Nuevo seguimiento"
    >
      <Field label="Tipo" htmlFor="nuevo-tipo">
        <select
          id="nuevo-tipo"
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as FollowUpKind)}
        >
          <option value="pendiente">{FOLLOW_UP_KIND_LABEL.pendiente}</option>
          <option value="asignacion">{FOLLOW_UP_KIND_LABEL.asignacion}</option>
        </select>
      </Field>
      <Field label="Asunto" htmlFor="nuevo-texto">
        <textarea
          id="nuevo-texto"
          className={textareaClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsable (opcional)" htmlFor="nuevo-responsable">
          <input
            id="nuevo-responsable"
            className={inputClass}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
        </Field>
        <Field label="Fecha límite (opcional)" htmlFor="nuevo-fecha">
          <input
            id="nuevo-fecha"
            type="date"
            className={inputClass}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Guardando…' : 'Crear'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FollowUpCard({ item, today }: { item: FollowUp; today: string }) {
  const [editing, setEditing] = useState(false);
  const [assignee, setAssignee] = useState(item.assignee ?? '');
  const [dueDate, setDueDate] = useState(item.dueDate ?? '');
  const [nextReview, setNextReview] = useState(item.nextReviewDate ?? '');
  const origin = useLiveQuery(
    async () => (item.originMeetingId ? await db.meetings.get(item.originMeetingId) : undefined),
    [item.originMeetingId],
  );
  const overdue = isOverdue(item, today);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await attempt(
      () => updateFollowUpDetails(item.id, { assignee, dueDate, nextReviewDate: nextReview }),
      { success: 'Seguimiento actualizado' },
    );
    if (saved) setEditing(false);
  };

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="primary">{FOLLOW_UP_KIND_LABEL[item.kind]}</Badge>
        <Badge tone={isClosedStatus(item.status) ? 'success' : 'neutral'}>
          {FOLLOW_UP_STATUS_LABEL[item.status]}
        </Badge>
        {overdue && <Badge tone="danger">Vencido</Badge>}
      </div>
      <p className="mt-2 font-medium text-balance">{item.title}</p>
      {item.description && (
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{item.description}</p>
      )}

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <div>
          <dt className="inline">Responsable: </dt>
          <dd className="inline">{item.assignee ?? 'Sin asignar'}</dd>
        </div>
        <div>
          <dt className="inline">Fecha límite: </dt>
          <dd className="inline">{item.dueDate ?? 'Sin fecha'}</dd>
        </div>
        {item.nextReviewDate && (
          <div>
            <dt className="inline">Próxima revisión: </dt>
            <dd className="inline">{item.nextReviewDate}</dd>
          </div>
        )}
        {origin && (
          <div>
            <dt className="inline">Origen: </dt>
            <dd className="inline">
              <Link
                to={`/reuniones/${origin.id}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {origin.title}
              </Link>
            </dd>
          </div>
        )}
      </dl>

      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Responsable" htmlFor={`r-${item.id}`}>
              <input
                id={`r-${item.id}`}
                className={inputClass}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              />
            </Field>
            <Field label="Fecha límite" htmlFor={`f-${item.id}`}>
              <input
                id={`f-${item.id}`}
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field label="Próxima revisión" htmlFor={`p-${item.id}`}>
              <input
                id={`p-${item.id}`}
                type="date"
                className={inputClass}
                value={nextReview}
                onChange={(e) => setNextReview(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div className="space-y-1">
            <label htmlFor={`estado-${item.id}`} className="block text-sm font-medium">
              Estado
            </label>
            <select
              id={`estado-${item.id}`}
              className={`${inputClass} min-w-52`}
              value={item.status}
              onChange={(e) =>
                attempt(() => setFollowUpStatus(item.id, e.target.value as FollowUpStatus))
              }
            >
              {STATUSES_BY_KIND[item.kind].map((status) => (
                <option key={status} value={status}>
                  {FOLLOW_UP_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar responsable y fechas
          </Button>
        </div>
      )}
    </li>
  );
}

export default function SeguimientosPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('abiertos');
  const [kindFilter, setKindFilter] = useState<KindFilter>('todos');
  const [creating, setCreating] = useState(false);
  // Fecha de hoy fija mientras la pantalla está abierta (render puro).
  const [today] = useState(() => toDateString(new Date()));

  const items = useLiveQuery(() => db.followUps.filter((f) => f.deletedAt === undefined).toArray());

  const shown = items
    ?.filter((f) => {
      if (statusFilter === 'abiertos' && isClosedStatus(f.status)) return false;
      if (statusFilter === 'cerrados' && !isClosedStatus(f.status)) return false;
      return kindFilter === 'todos' || f.kind === kindFilter;
    })
    .sort((a, b) => {
      // Vencidos primero, luego por fecha límite; lo que no tiene fecha va al final.
      const da = a.dueDate ?? '9999-12-31';
      const db_ = b.dueDate ?? '9999-12-31';
      return da.localeCompare(db_) || a.createdAt - b.createdAt;
    });

  return (
    <>
      <PageHeader
        title="Seguimientos"
        description="Asuntos pendientes y asignaciones que se revisan en reuniones posteriores."
        actions={
          !creating ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              Nuevo seguimiento
            </Button>
          ) : undefined
        }
      />

      {creating && <NewFollowUpForm onDone={() => setCreating(false)} />}

      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Mostrar" htmlFor="filtro-estado">
          <select
            id="filtro-estado"
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="abiertos">Abiertos</option>
            <option value="cerrados">Cerrados</option>
            <option value="todos">Todos</option>
          </select>
        </Field>
        <Field label="Tipo" htmlFor="filtro-tipo">
          <select
            id="filtro-tipo"
            className={inputClass}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
          >
            <option value="todos">Todos</option>
            <option value="asignacion">{FOLLOW_UP_KIND_LABEL.asignacion}s</option>
            <option value="pendiente">{FOLLOW_UP_KIND_LABEL.pendiente}s</option>
          </select>
        </Field>
      </div>

      {shown === undefined ? (
        <p role="status" className="text-muted">
          Cargando seguimientos…
        </p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={items && items.length > 0 ? 'Nada con estos filtros' : 'Sin seguimientos'}
          description={
            items && items.length > 0
              ? 'Cambia los filtros para ver otros asuntos.'
              : 'Las asignaciones y asuntos pendientes que registres en una reunión aparecerán aquí. También puedes crear uno directamente.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((item) => (
            <FollowUpCard key={item.id} item={item} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}
