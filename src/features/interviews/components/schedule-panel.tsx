import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { InterviewAppointment, InterviewRequest, Leader } from '@/db/types';
import { fromDateTimeLocal, nextFullHour, toDateTimeLocal } from '@/features/meetings/labels';
import { attempt } from '@/lib/actions';
import { cn, formatDateTime } from '@/lib/utils';
import { LEADERS, LEADER_LABEL, checkSlot, suggestLeader, suggestSlots } from '../model';
import { rescheduleAppointment, scheduleAppointment, setWaitlist } from '../service';

/**
 * Programa o reprograma una cita. Los choques con otra cita del mismo líder se bloquean siempre;
 * salir de la disponibilidad configurada solo se permite con una confirmación expresa.
 */
export function SchedulePanel({
  request,
  organization,
  reschedule,
  onDone,
}: {
  request: InterviewRequest;
  organization?: { name: string; assignedLeader?: Leader };
  /** Si viene una cita, se reprograma esa cita. */
  reschedule?: InterviewAppointment;
  onDone?: () => void;
}) {
  const suggestion = suggestLeader(request, organization);
  const [leader, setLeader] = useState<Leader>(
    reschedule?.leader ?? suggestion.leader ?? 'primer_consejero',
  );
  const [duration, setDuration] = useState(String(reschedule?.durationMin ?? 30));
  const [when, setWhen] = useState(() => toDateTimeLocal(reschedule?.startsAt ?? nextFullHour()));
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const data = useLiveQuery(async () => {
    const [rules, appointments] = await Promise.all([
      db.leaderAvailability.where('leader').equals(leader).filter(isActive).toArray(),
      db.interviewAppointments
        .where('[leader+startsAt]')
        .between([leader, Dexie.minKey], [leader, Dexie.maxKey])
        .filter(isActive)
        .toArray(),
    ]);
    return { rules, appointments };
  }, [leader]);

  const durationMin = Number(duration);
  const startsAt = fromDateTimeLocal(when);
  const validInput =
    Number.isFinite(startsAt) &&
    Number.isInteger(durationMin) &&
    durationMin >= 5 &&
    durationMin <= 240;

  const issues =
    data && validInput
      ? checkSlot({
          leader,
          startsAt,
          durationMin,
          rules: data.rules,
          appointments: data.appointments,
          ignoreAppointmentId: reschedule?.id,
        })
      : [];
  const hardBlock = issues.some((i) => !i.overridable);
  const softIssues = issues.filter((i) => i.overridable);
  const slots =
    data && Number.isInteger(durationMin) && durationMin >= 5
      ? suggestSlots({
          leader,
          from: Math.max(now, 0),
          durationMin,
          rules: data.rules,
          appointments: data.appointments.filter((a) => a.id !== reschedule?.id),
        })
      : [];

  const locked = request.mustBeWithPresident;
  const canSubmit = validInput && !hardBlock && (softIssues.length === 0 || override) && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const common = { leader, startsAt, durationMin, overrideAvailability: override };
    const result = await attempt(
      () =>
        reschedule
          ? rescheduleAppointment(reschedule.id, common)
          : scheduleAppointment({ requestId: request.id, ...common }),
      { success: reschedule ? 'Cita reprogramada' : 'Cita programada' },
    );
    setBusy(false);
    if (result) onDone?.();
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
      aria-label={reschedule ? 'Reprogramar' : 'Programar'}
    >
      <Field
        label="Líder"
        htmlFor="leader"
        hint={locked ? 'Debe ser con el presidente de estaca.' : suggestion.reason}
      >
        <select
          id="leader"
          className={inputClass}
          aria-describedby="leader-hint"
          value={leader}
          disabled={locked}
          onChange={(e) => {
            setLeader(e.target.value as Leader);
            setOverride(false);
          }}
        >
          {LEADERS.map((l) => (
            <option key={l} value={l}>
              {LEADER_LABEL[l]}
              {suggestion.leader === l ? ' (sugerido)' : ''}
            </option>
          ))}
        </select>
      </Field>

      {slots.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Próximos horarios libres</p>
          <ul className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <li key={slot}>
                <button
                  type="button"
                  onClick={() => {
                    setWhen(toDateTimeLocal(slot));
                    setOverride(false);
                  }}
                  className={cn(
                    'min-h-11 rounded-xl border px-3 text-sm tabular-nums',
                    startsAt === slot
                      ? 'border-primary bg-primary-soft text-primary-soft-fg'
                      : 'border-border-strong bg-surface hover:bg-surface-2',
                  )}
                >
                  {formatDateTime(slot)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && slots.length === 0 && !data.rules.some((r) => r.kind === 'disponible') && (
        <p className="text-sm text-muted">
          {LEADER_LABEL[leader]} no tiene disponibilidad configurada, así que no hay horarios para
          sugerir. Puedes elegir uno manualmente o configurarla en «Barrios y disponibilidad».
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha y hora" htmlFor="cita-fecha">
          <input
            id="cita-fecha"
            type="datetime-local"
            className={inputClass}
            value={when}
            onChange={(e) => {
              setWhen(e.target.value);
              setOverride(false);
            }}
          />
        </Field>
        <Field label="Duración (minutos)" htmlFor="cita-duracion">
          <input
            id="cita-duracion"
            inputMode="numeric"
            className={inputClass}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
      </div>

      {issues.length > 0 && (
        <div role="alert" className="space-y-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <ul className="list-disc pl-5">
            {issues.map((i) => (
              <li key={i.kind}>{i.message}</li>
            ))}
          </ul>
          {hardBlock ? (
            <p className="font-medium">Elige otro horario: no se permiten dos citas a la vez.</p>
          ) : (
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
              />
              Agendar de todos modos
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {busy ? 'Guardando…' : reschedule ? 'Reprogramar cita' : 'Programar cita'}
        </Button>
        {reschedule ? (
          <Button variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              attempt(() => setWaitlist(request.id, !request.waitlist), {
                success: request.waitlist
                  ? 'Quitada de la lista de espera'
                  : 'Añadida a la lista de espera',
              })
            }
          >
            {request.waitlist ? 'Quitar de la lista de espera' : 'Poner en lista de espera'}
          </Button>
        )}
      </div>
    </form>
  );
}
