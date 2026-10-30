import { CalendarClock } from 'lucide-react';
import type { InterviewAppointment, Leader, LeaderAvailability } from '@/db/types';
import { Field, inputClass } from '@/components/ui/field';
import { toDateString } from '@/features/followups/model';
import { useLastTime } from '../use-interview-data';
import { cn } from '@/lib/utils';
import { draftStartsAt, type DraftEvaluation, type SlotDraft } from '../draft';
import {
  BLOCK_MIN,
  LEADERS,
  blockStart,
  blocksForDay,
  formatClock,
  leaderShort,
  upcomingInterviewDays,
  type PresidencyNames,
} from '../model';

const dayChip = new Intl.DateTimeFormat('es-BO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const pad = (n: number) => String(n).padStart(2, '0');

function chipClass(active: boolean, disabled = false) {
  return cn(
    'min-h-11 rounded-xl border px-3 text-sm tabular-nums transition-colors motion-reduce:transition-none',
    active
      ? 'border-primary bg-primary-soft font-semibold text-primary-soft-fg'
      : 'border-border-strong bg-surface hover:bg-surface-2',
    disabled && 'cursor-not-allowed opacity-50 hover:bg-surface',
  );
}

/** Interruptor con texto: «Día especial». */
function Switch({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  id: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 left-0.5 size-6 rounded-full bg-surface shadow transition-transform motion-reduce:transition-none',
            checked && 'translate-x-5',
          )}
        />
      </button>
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Elige con quién, el día y la hora. La hora se escoge por bloques de media hora (con cupo
 * visible) y se puede afinar a 5, 10, 15 minutos. «Día especial» permite salir del horario
 * habitual sin avisos.
 */
export function SlotPicker({
  leader,
  onLeaderChange,
  leaderHint,
  lockedByRule,
  draft,
  onDraftChange,
  evaluation,
  data,
  names,
  now,
  ignoreAppointmentId,
}: {
  leader?: Leader;
  onLeaderChange: (leader: Leader) => void;
  leaderHint?: string;
  /** El Manual exige al presidente: otro líder pide la autorización expresa. */
  lockedByRule: boolean;
  draft: SlotDraft;
  onDraftChange: (next: SlotDraft) => void;
  evaluation: DraftEvaluation;
  data?: { rules: LeaderAvailability[]; appointments: InterviewAppointment[] };
  names: PresidencyNames;
  now: number;
  ignoreAppointmentId?: string;
}) {
  const set = (patch: Partial<SlotDraft>) => onDraftChange({ ...draft, ...patch });
  const dayStart = draft.date ? new Date(`${draft.date}T00:00`) : undefined;
  const slotLeader: Leader = leader ?? 'presidente';
  const blocks =
    data && dayStart && leader
      ? blocksForDay({
          leader: slotLeader,
          day: dayStart,
          rules: data.rules,
          appointments: data.appointments,
          ignoreAppointmentId,
        })
      : [];
  const days =
    data && leader
      ? upcomingInterviewDays({
          leader: slotLeader,
          from: now,
          rules: data.rules,
          appointments: data.appointments.filter((a) => a.id !== ignoreAppointmentId),
        })
      : [];
  const quickDays = (() => {
    const out: { key: string; label: string }[] = [];
    const add = (d: Date, label: string) => {
      const key = toDateString(d);
      if (!out.some((o) => o.key === key)) out.push({ key, label });
    };
    const today = new Date(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    add(today, 'Hoy');
    add(tomorrow, 'Mañana');
    for (const d of days) add(d, dayChip.format(d));
    return out;
  })();
  const lastTime = useLastTime();
  const startsAt = draftStartsAt(draft);
  const selectedBlock = Number.isFinite(startsAt) ? blockStart(startsAt) : undefined;
  const offsets = [0, 5, 10, 15, 20, 25];
  const hasAvailability = data?.rules.some((r) => r.kind === 'disponible') ?? false;

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Quién entrevista</legend>
        <div role="radiogroup" aria-label="Quién entrevista" className="grid grid-cols-3 gap-2">
          {LEADERS.map((l) => {
            const active = l === leader;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onLeaderChange(l)}
                className={cn(chipClass(active), 'text-center leading-tight')}
              >
                {leaderShort(l, names)}
              </button>
            );
          })}
        </div>
        {leaderHint && <p className="mt-1.5 text-sm text-muted">{leaderHint}</p>}
        {lockedByRule && leader && leader !== 'presidente' && (
          <label className="mt-2 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={draft.authorized}
              onChange={(e) => set({ authorized: e.target.checked })}
            />
            El presidente lo autorizó (caso urgente)
          </label>
        )}
      </fieldset>

      <div className="space-y-3">
        <Field label="Día" htmlFor="cita-dia">
          <input
            id="cita-dia"
            type="date"
            className={inputClass}
            value={draft.date}
            onChange={(e) => set({ date: e.target.value, time: '' })}
          />
        </Field>
        <ul className="flex flex-wrap gap-2" aria-label="Atajos de día">
          {quickDays.map(({ key, label }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => set({ date: key, time: '' })}
                className={chipClass(draft.date === key)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {blocks.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Bloque (hasta 3 por media hora)</p>
          <ul className="flex flex-wrap gap-2">
            {blocks.map((b) => (
              <li key={b.startsAt}>
                <button
                  type="button"
                  disabled={b.full}
                  aria-label={`${formatClock(b.startsAt)}, ${b.taken} de 3 ocupados${b.full ? ', lleno' : ''}`}
                  onClick={() => {
                    const d = new Date(b.startsAt);
                    set({ time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
                  }}
                  className={cn(chipClass(selectedBlock === b.startsAt, b.full), 'text-left')}
                >
                  <span className="block leading-tight">{formatClock(b.startsAt)}</span>
                  <span className="block text-xs font-normal text-muted">
                    {b.full ? 'Lleno' : `${b.taken} de 3`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {leader && draft.date && data && blocks.length === 0 && (
        <p className="text-sm text-muted">
          {hasAvailability
            ? `${leaderShort(leader, names)} no tiene entrevistas habituales ese día. Escribe la hora abajo y marca «Día especial».`
            : `${leaderShort(leader, names)} no tiene horarios configurados. Escribe la hora abajo.`}
        </p>
      )}

      <div>
        <Field
          label="Hora exacta"
          htmlFor="cita-hora"
          hint={`Le dices a la persona esta hora. Cada bloque dura ${BLOCK_MIN} minutos, pero puedes poner 8:10, 8:15, 8:45…`}
        >
          <input
            id="cita-hora"
            type="time"
            step={300}
            className={inputClass}
            aria-describedby="cita-hora-hint"
            value={draft.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        </Field>
        {lastTime && draft.date && draft.time !== lastTime && (
          <button
            type="button"
            onClick={() => set({ time: lastTime })}
            className={cn(chipClass(false), 'mt-2 min-h-9 px-2.5')}
          >
            Como la última vez: {formatClock(new Date(`${draft.date}T${lastTime}`).getTime())}
          </button>
        )}
        {selectedBlock !== undefined && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Afinar la hora dentro del bloque">
            {offsets.map((o) => {
              const ms = selectedBlock + o * 60_000;
              const d = new Date(ms);
              const value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => set({ time: value })}
                    className={cn(chipClass(draft.time === value), 'min-h-9 px-2.5')}
                  >
                    {formatClock(ms)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Switch
        id="dia-especial"
        checked={draft.special}
        onChange={(special) => set({ special })}
        label="Día especial u horario fuera de lo habitual"
        hint="Por ejemplo, un domingo antes de la sacramental. No se avisa si es otro día."
      />

      {(evaluation.hardBlock || (!draft.special && evaluation.issues.length > 0)) && (
        <div
          role="alert"
          className="space-y-1.5 rounded-xl bg-warning-soft p-3 text-sm text-warning"
        >
          <ul className="list-disc pl-5">
            {evaluation.issues.map((i) => (
              <li key={i.kind}>{i.message}</li>
            ))}
          </ul>
          {evaluation.hardBlock ? (
            <p className="font-medium">Elige otro bloque u otra hora.</p>
          ) : (
            !draft.special && (
              <button
                type="button"
                onClick={() => set({ special: true })}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg font-medium underline underline-offset-2"
              >
                <CalendarClock className="size-4" aria-hidden />
                Es un día especial: agendar igual
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
