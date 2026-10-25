import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import type { AgendaItem, Id } from '@/db/types';
import {
  addAgendaItem,
  agendaQuery,
  moveAgendaItem,
  removeAgendaItem,
  updateAgendaItem,
} from '@/features/meetings/service';
import { attempt } from '@/lib/actions';

function AgendaRow({
  item,
  index,
  total,
  meetingId,
  editable,
}: {
  item: AgendaItem;
  index: number;
  total: number;
  meetingId: Id;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');

  const startEdit = () => {
    setTitle(item.title);
    setDescription(item.description ?? '');
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await attempt(() => updateAgendaItem(item.id, { title, description }));
    if (saved) setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-xl border border-primary bg-surface p-3">
        <form onSubmit={save} className="space-y-3">
          <Field label="Título del punto" htmlFor={`t-${item.id}`}>
            <input
              id={`t-${item.id}`}
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Descripción (opcional)" htmlFor={`d-${item.id}`}>
            <input
              id={`d-${item.id}`}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!title.trim()}>
              Guardar punto
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-fg"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-balance">{item.title}</p>
          {item.description && <p className="mt-0.5 text-sm text-muted">{item.description}</p>}
          {item.notes && (
            <p className="mt-2 rounded-lg bg-surface-2 p-2.5 text-sm whitespace-pre-wrap">
              {item.notes}
            </p>
          )}
          {item.prep === 'lista' && (
            <p className="mt-2">
              <Badge tone="success">Preparado</Badge>
            </p>
          )}
        </div>
      </div>

      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Subir «${item.title}»`}
            disabled={index === 0}
            onClick={() => attempt(() => moveAgendaItem(meetingId, item.id, -1))}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Bajar «${item.title}»`}
            disabled={index === total - 1}
            onClick={() => attempt(() => moveAgendaItem(meetingId, item.id, 1))}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar «${item.title}»`}
            onClick={startEdit}
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              attempt(() =>
                updateAgendaItem(item.id, { prep: item.prep === 'lista' ? 'pendiente' : 'lista' }),
              )
            }
          >
            {item.prep === 'lista' ? 'Quitar «preparado»' : 'Marcar preparado'}
          </Button>
          <ConfirmButton
            ariaLabel={`Eliminar «${item.title}»`}
            confirmLabel="Eliminar punto"
            onConfirm={() =>
              attempt(() => removeAgendaItem(item.id), {
                success: 'Punto eliminado. Se puede recuperar durante 30 días.',
              })
            }
          >
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </li>
  );
}

function AddAgendaItem({ meetingId }: { meetingId: Id }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const added = await attempt(() => addAgendaItem(meetingId, { title }));
    setBusy(false);
    if (added) setTitle('');
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Field
        label="Agregar un punto"
        htmlFor={`nuevo-punto-${meetingId}`}
        className="min-w-56 flex-1"
      >
        <input
          id={`nuevo-punto-${meetingId}`}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del punto de agenda"
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || !title.trim()}>
        <Plus className="size-4" aria-hidden />
        Agregar
      </Button>
    </form>
  );
}

/** Agenda propia de la reunión: independiente de la plantilla de la que se copió. */
export function AgendaEditor({ meetingId, editable }: { meetingId: Id; editable: boolean }) {
  const items = useLiveQuery(() => agendaQuery(meetingId), [meetingId]);

  if (items === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando agenda…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="text-muted">
          La agenda está vacía.{editable ? ' Agrega el primer punto.' : ''}
        </p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <AgendaRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              meetingId={meetingId}
              editable={editable}
            />
          ))}
        </ol>
      )}
      {editable && <AddAgendaItem meetingId={meetingId} />}
    </div>
  );
}
