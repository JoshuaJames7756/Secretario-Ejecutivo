import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { InterviewAppointment, InterviewRequest, Leader } from '@/db/types';
import { toDateString } from '@/features/followups/model';
import { attempt } from '@/lib/actions';
import { evaluateDraft, type SlotDraft } from '../draft';
import { suggestLeader } from '../model';
import { rescheduleAppointment, scheduleAppointment, setWaitlist } from '../service';
import { useLeaderSlotData, usePresidencyNames } from '../use-interview-data';
import { SlotPicker } from './slot-picker';

/**
 * Programa o reprograma la cita de una solicitud que ya existe. Un bloque de media hora admite
 * hasta 3 entrevistas por líder; fuera del horario habitual se marca «día especial».
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
  const [now] = useState(() => Date.now());
  const names = usePresidencyNames();
  const suggestion = suggestLeader(request, organization);
  const [leader, setLeader] = useState<Leader | undefined>(reschedule?.leader ?? suggestion.leader);
  const [draft, setDraft] = useState<SlotDraft>(() => {
    const base = reschedule ? new Date(reschedule.startsAt) : new Date(now + 24 * 3_600_000);
    return {
      date: toDateString(base),
      time: '',
      special: false,
      authorized: false,
    };
  });
  const [busy, setBusy] = useState(false);

  const data = useLeaderSlotData(leader ?? 'presidente');
  const evaluation = evaluateDraft({
    draft,
    leader: leader ?? 'presidente',
    request,
    data,
    ignoreAppointmentId: reschedule?.id,
  });
  const canSubmit = leader !== undefined && evaluation.canSubmit && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!leader) return;
    setBusy(true);
    const common = {
      leader,
      startsAt: evaluation.startsAt,
      special: draft.special,
      presidentAuthorized: draft.authorized,
    };
    const result = await attempt(
      () =>
        reschedule
          ? rescheduleAppointment(reschedule.id, common)
          : scheduleAppointment({ requestId: request.id, ...common }),
      { success: reschedule ? 'Entrevista reprogramada' : 'Entrevista agendada' },
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
      <SlotPicker
        leader={leader}
        onLeaderChange={(l) => {
          setLeader(l);
          setDraft((d) => ({ ...d, authorized: false }));
        }}
        leaderHint={suggestion.reason}
        lockedByRule={request.mustBeWithPresident}
        draft={draft}
        onDraftChange={setDraft}
        evaluation={evaluation}
        data={data}
        names={names}
        now={now}
        ignoreAppointmentId={reschedule?.id}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {busy ? 'Guardando…' : reschedule ? 'Reprogramar' : 'Agendar entrevista'}
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
