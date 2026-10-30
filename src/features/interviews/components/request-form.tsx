import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, describedBy, inputClass, textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { InterviewAppointment, InterviewKind, InterviewRequest, Leader } from '@/db/types';
import { toDateString } from '@/features/followups/model';
import { evaluateDraft, type SlotDraft } from '../draft';
import { KIND_INFO, KIND_ORDER, kindOf, suggestLeader } from '../model';
import type { NewRequestInput, ScheduleInput } from '../service';
import { useLeaderSlotData, usePresidencyNames } from '../use-interview-data';
import { Segmented } from './segmented';
import { SlotPicker } from './slot-picker';
import { cn } from '@/lib/utils';

const schema = z.object({
  personName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre de la persona.')
    .max(120, 'Máximo 120 caracteres.'),
  organizationId: z.string(),
  kindDetail: z.string().max(120, 'Máximo 120 caracteres.'),
  phone: z.string().max(30, 'Máximo 30 caracteres.'),
  notes: z.string().max(300, 'Máximo 300 caracteres.'),
});
type Values = z.infer<typeof schema>;

type Slot = Omit<ScheduleInput, 'requestId'>;

/**
 * Registro de una entrevista. Con `onSchedule` es el registro rápido (persona, motivo, quién y
 * cuándo en una sola pantalla). Sin él, solo edita los datos de la solicitud.
 * Solo datos administrativos: el contenido de la entrevista no se registra aquí.
 */
export function RequestForm({
  initial,
  copyFrom,
  submitLabel,
  onSubmit,
  onSchedule,
  onCancel,
}: {
  initial?: InterviewRequest;
  /** Agendar otra entrevista igual: copia motivo, barrio, líder, modalidad y día (no la persona). */
  copyFrom?: { request: InterviewRequest; appointment?: InterviewAppointment };
  submitLabel: string;
  onSubmit: (input: NewRequestInput) => Promise<unknown>;
  onSchedule?: (input: NewRequestInput, slot: Slot) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [now] = useState(() => Date.now());
  const names = usePresidencyNames();
  const organizations = useLiveQuery(
    () => db.organizations.filter((o) => isActive(o) && o.status === 'activa').toArray(),
    [],
  );

  const seed = initial ?? copyFrom?.request;
  const [treatment, setTreatment] = useState<'hermano' | 'hermana'>(
    initial?.treatment ?? 'hermano',
  );
  const [modality, setModality] = useState<'presencial' | 'virtual'>(
    seed?.modality ?? 'presencial',
  );
  const [kind, setKind] = useState<InterviewKind>(seed ? kindOf(seed) : 'renovacion_recomendacion');
  const [leaderPick, setLeaderPick] = useState<Leader | null>(
    copyFrom?.appointment?.leader ?? null,
  );
  const [draft, setDraft] = useState<SlotDraft>(() => ({
    date: toDateString(
      copyFrom?.appointment
        ? new Date(copyFrom.appointment.startsAt)
        : new Date(now + 24 * 3_600_000),
    ),
    time: '',
    special: false,
    authorized: false,
  }));

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      personName: initial?.personName ?? '',
      organizationId: seed?.organizationId ?? '',
      kindDetail: seed?.kindDetail ?? '',
      phone: initial?.phone ?? '',
      notes: initial?.notes ?? '',
    },
  });
  const organizationId = useWatch({ control, name: 'organizationId' });
  const organization = organizations?.find((o) => o.id === organizationId);

  const rule = KIND_INFO[kind].rule;
  const mustBeWithPresident = rule === 'obligatorio';
  const suggestion = suggestLeader(
    { kind, mustBeWithPresident, requestedLeader: undefined },
    organization,
  );
  const leader: Leader | undefined = leaderPick ?? suggestion.leader;
  const data = useLeaderSlotData(leader ?? 'presidente');
  const evaluation = evaluateDraft({
    draft,
    leader: leader ?? 'presidente',
    request: { mustBeWithPresident, kind },
    data,
  });
  const canSchedule = leader !== undefined && evaluation.canSubmit;

  const build = (v: Values): NewRequestInput => ({
    personName: v.personName,
    treatment,
    kind,
    kindDetail: v.kindDetail,
    modality,
    phone: v.phone,
    organizationId: v.organizationId || undefined,
    notes: v.notes,
  });

  const save = handleSubmit(async (v) => {
    await onSubmit(build(v));
  });
  const schedule = handleSubmit(async (v) => {
    if (!onSchedule || !leader) return;
    await onSchedule(build(v), {
      leader,
      startsAt: evaluation.startsAt,
      special: draft.special,
      presidentAuthorized: draft.authorized,
    });
  });

  const quick = onSchedule !== undefined;

  return (
    <form
      onSubmit={quick ? schedule : save}
      noValidate
      className="max-w-2xl space-y-6"
      aria-label={quick ? 'Nueva entrevista' : 'Editar entrevista'}
    >
      <Field label="Nombre de la persona" htmlFor="personName" error={errors.personName?.message}>
        <input
          id="personName"
          className={inputClass}
          autoComplete="off"
          aria-invalid={!!errors.personName}
          aria-describedby={describedBy('personName', errors.personName?.message)}
          {...register('personName')}
        />
      </Field>

      <Segmented
        label="Se le llama"
        value={treatment}
        onChange={setTreatment}
        options={[
          { value: 'hermano', label: 'Hermano' },
          { value: 'hermana', label: 'Hermana' },
        ]}
      />

      <Field
        label="WhatsApp (opcional)"
        htmlFor="phone"
        error={errors.phone?.message}
        hint="Con el número, un toque abre el chat con el mensaje escrito. Sin él, el mensaje se copia."
      >
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className={inputClass}
          placeholder="Ej. 71234567"
          aria-describedby={describedBy('phone', errors.phone?.message, 'x')}
          {...register('phone')}
        />
      </Field>

      <Field label="Barrio o rama" htmlFor="organizationId">
        <select
          id="organizationId"
          className={inputClass}
          {...register('organizationId', { onChange: () => setLeaderPick(null) })}
        >
          <option value="">Sin indicar</option>
          {organizations
            ?.slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </select>
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Motivo</legend>
        <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-2">
          {KIND_ORDER.map((k) => {
            const active = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setKind(k);
                  setLeaderPick(null);
                  setDraft((d) => ({ ...d, authorized: false }));
                }}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-sm transition-colors motion-reduce:transition-none',
                  active
                    ? 'border-primary bg-primary-soft font-semibold text-primary-soft-fg'
                    : 'border-border-strong bg-surface hover:bg-surface-2',
                )}
              >
                {KIND_INFO[k].label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {KIND_INFO[kind].note}
          {KIND_INFO[kind].manualRef && ` (Manual General ${KIND_INFO[kind].manualRef}).`}
        </p>
      </fieldset>

      {kind === 'llamamiento' && (
        <Field
          label="¿Qué llamamiento? (opcional)"
          htmlFor="kindDetail"
          error={errors.kindDetail?.message}
          hint="Lo verán los presidentes en la imagen. Si no lo sabes, déjalo vacío."
        >
          <input
            id="kindDetail"
            className={inputClass}
            aria-describedby="kindDetail-hint"
            {...register('kindDetail')}
          />
        </Field>
      )}

      <Segmented
        label="Modalidad"
        value={modality}
        onChange={setModality}
        options={[
          { value: 'presencial', label: 'Presencial' },
          { value: 'virtual', label: 'Virtual' },
        ]}
      />

      {quick && (
        <SlotPicker
          leader={leader}
          onLeaderChange={(l) => {
            setLeaderPick(l);
            setDraft((d) => ({ ...d, time: d.time, authorized: false }));
          }}
          leaderHint={suggestion.reason}
          lockedByRule={mustBeWithPresident}
          draft={draft}
          onDraftChange={setDraft}
          evaluation={evaluation}
          data={data}
          names={names}
          now={now}
        />
      )}

      <Field
        label="Nota (opcional)"
        htmlFor="notes"
        hint="Solo coordinación. No escribas lo conversado en la entrevista."
        error={errors.notes?.message}
      >
        <textarea
          id="notes"
          className={cn(textareaClass, 'min-h-20')}
          aria-describedby="notes-hint"
          {...register('notes')}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        {quick ? (
          <>
            <Button type="submit" disabled={isSubmitting || !canSchedule}>
              {isSubmitting ? 'Guardando…' : submitLabel}
            </Button>
            <Button variant="outline" disabled={isSubmitting} onClick={() => void save()}>
              Guardar sin horario
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : submitLabel}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
