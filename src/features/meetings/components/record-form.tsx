import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, inputClass, textareaClass } from '@/components/ui/field';
import type { AgendaItem, Id, RecordType } from '@/db/types';
import {
  RECORD_TYPES_FOR_QUICK_ADD,
  RECORD_TYPE_HELP,
  RECORD_TYPE_LABEL,
} from '@/features/meetings/labels';
import { addRecord } from '@/features/meetings/service';
import { attempt } from '@/lib/actions';
import { cn } from '@/lib/utils';

type QuickType = Exclude<RecordType, 'nota'>;

/**
 * Registro rápido durante la reunión. El tipo SIEMPRE lo elige la persona: la aplicación nunca
 * convierte una propuesta en decisión ni asigna responsables por su cuenta.
 */
export function RecordForm({
  meetingId,
  agenda,
  currentItemId,
}: {
  meetingId: Id;
  agenda: AgendaItem[];
  currentItemId?: Id;
}) {
  const [type, setType] = useState<QuickType | null>(null);
  const [content, setContent] = useState('');
  const [agendaItemId, setAgendaItemId] = useState<string>('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const createsFollowUp = type === 'asignacion' || type === 'pendiente';
  // Si no se eligió un punto, se usa el punto actual de la reunión.
  const linkedItem =
    agendaItemId === '' ? currentItemId : agendaItemId === 'ninguno' ? undefined : agendaItemId;

  const reset = () => {
    setType(null);
    setContent('');
    setAgendaItemId('');
    setAssignee('');
    setDueDate('');
    setIsPrivate(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!type) return;
    setBusy(true);
    const result = await attempt(() =>
      addRecord({
        meetingId,
        agendaItemId: linkedItem,
        type,
        content,
        isPrivate,
        assignee,
        dueDate,
      }),
    );
    setBusy(false);
    if (!result) return; // el error ya se mostró; el texto se conserva
    toast.success(
      result.followUp
        ? `${RECORD_TYPE_LABEL[type]} registrada y añadida a Seguimientos`
        : `${RECORD_TYPE_LABEL[type]} registrada`,
    );
    reset();
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Tipo de registro" className="flex flex-wrap gap-2">
        {RECORD_TYPES_FOR_QUICK_ADD.map((value) => {
          const selected = type === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setType(selected ? null : value)}
              className={cn(
                'min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary-soft text-primary-soft-fg'
                  : 'border-border-strong bg-surface hover:bg-surface-2',
              )}
            >
              {RECORD_TYPE_LABEL[value]}
            </button>
          );
        })}
      </div>

      {type === null ? (
        <p className="text-sm text-muted">
          Elige qué quieres registrar. Cada tipo significa algo distinto y la aplicación no los
          convierte entre sí.
        </p>
      ) : (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-border bg-surface-2 p-3"
        >
          <p className="text-sm text-muted">{RECORD_TYPE_HELP[type]}</p>

          <Field label={RECORD_TYPE_LABEL[type]} htmlFor="registro-contenido">
            <textarea
              id="registro-contenido"
              className={textareaClass}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Punto de agenda relacionado" htmlFor="registro-punto">
            <select
              id="registro-punto"
              className={inputClass}
              value={agendaItemId}
              onChange={(e) => setAgendaItemId(e.target.value)}
            >
              <option value="">{currentItemId ? 'Punto actual' : 'Ninguno'}</option>
              {currentItemId && <option value="ninguno">Ninguno</option>}
              {agenda.map((item, i) => (
                <option key={item.id} value={item.id}>
                  {i + 1}. {item.title}
                </option>
              ))}
            </select>
          </Field>

          {createsFollowUp && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Responsable (opcional)" htmlFor="registro-responsable">
                <input
                  id="registro-responsable"
                  className={inputClass}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                />
              </Field>
              <Field label="Fecha límite (opcional)" htmlFor="registro-fecha">
                <input
                  id="registro-fecha"
                  type="date"
                  className={inputClass}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            Privado: se excluye de los informes por defecto
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !content.trim()}>
              {busy ? 'Guardando…' : 'Registrar'}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          </div>
          {createsFollowUp && (
            <p className="text-sm text-muted">Se añadirá también a Seguimientos.</p>
          )}
        </form>
      )}
    </div>
  );
}
