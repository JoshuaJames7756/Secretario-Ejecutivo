import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, describedBy, inputClass, textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { InterviewRequest, Leader } from '@/db/types';
import { toDateString } from '@/features/followups/model';
import { LEADERS, LEADER_LABEL } from '../model';
import type { NewRequestInput } from '../service';

const schema = z.object({
  personName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre de la persona.')
    .max(120, 'Máximo 120 caracteres.'),
  organizationId: z.string(),
  requestedBy: z.string().max(120, 'Máximo 120 caracteres.'),
  receivedAt: z.string().min(1, 'Indica la fecha de recepción.'),
  requestedLeader: z.string(),
  mustBeWithPresident: z.boolean(),
  timePreferences: z.string().max(300, 'Máximo 300 caracteres.'),
  notes: z.string().max(300, 'Máximo 300 caracteres.'),
});
type Values = z.infer<typeof schema>;

/** Solo datos administrativos. El motivo y lo conversado no se registran aquí. */
export function RequestForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: InterviewRequest;
  submitLabel: string;
  onSubmit: (input: NewRequestInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  // Referencia fija mientras el formulario está abierto (render puro).
  const [now] = useState(() => Date.now());
  const organizations = useLiveQuery(
    () => db.organizations.filter((o) => isActive(o) && o.status === 'activa').toArray(),
    [],
  );
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      personName: initial?.personName ?? '',
      organizationId: initial?.organizationId ?? '',
      requestedBy: initial?.requestedBy ?? '',
      receivedAt: toDateString(new Date(initial?.receivedAt ?? now)),
      requestedLeader: initial?.mustBeWithPresident ? '' : (initial?.requestedLeader ?? ''),
      mustBeWithPresident: initial?.mustBeWithPresident ?? false,
      timePreferences: initial?.timePreferences ?? '',
      notes: initial?.notes ?? '',
    },
  });
  const mustPresident = useWatch({ control, name: 'mustBeWithPresident' });

  const submit = handleSubmit(async (v) => {
    await onSubmit({
      personName: v.personName,
      organizationId: v.organizationId || undefined,
      requestedBy: v.requestedBy,
      receivedAt: new Date(`${v.receivedAt}T12:00:00`).getTime(),
      requestedLeader: (v.requestedLeader || undefined) as Leader | undefined,
      mustBeWithPresident: v.mustBeWithPresident,
      timePreferences: v.timePreferences,
      notes: v.notes,
    });
  });

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl space-y-5">
      <Field label="Nombre de la persona" htmlFor="personName" error={errors.personName?.message}>
        <input
          id="personName"
          className={inputClass}
          aria-invalid={!!errors.personName}
          aria-describedby={describedBy('personName', errors.personName?.message)}
          {...register('personName')}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Barrio o rama" htmlFor="organizationId">
          <select id="organizationId" className={inputClass} {...register('organizationId')}>
            <option value="">Sin indicar</option>
            {organizations
              ?.sort((a, b) => a.name.localeCompare(b.name, 'es'))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Líder que la solicita (opcional)" htmlFor="requestedBy">
          <input id="requestedBy" className={inputClass} {...register('requestedBy')} />
        </Field>
        <Field label="Fecha de recepción" htmlFor="receivedAt" error={errors.receivedAt?.message}>
          <input id="receivedAt" type="date" className={inputClass} {...register('receivedAt')} />
        </Field>
        <Field
          label="Con quién (opcional)"
          htmlFor="requestedLeader"
          hint="Si no eliges, se sugiere según el barrio."
        >
          <select
            id="requestedLeader"
            className={inputClass}
            disabled={mustPresident}
            aria-describedby="requestedLeader-hint"
            {...register('requestedLeader')}
          >
            <option value="">Sin preferencia</option>
            {LEADERS.map((l) => (
              <option key={l} value={l}>
                {LEADER_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-[var(--primary)]"
          {...register('mustBeWithPresident')}
        />
        Debe ser específicamente con el presidente de estaca
      </label>
      <Field
        label="Preferencias de horario"
        htmlFor="timePreferences"
        error={errors.timePreferences?.message}
      >
        <textarea id="timePreferences" className={textareaClass} {...register('timePreferences')} />
      </Field>
      <Field
        label="Notas administrativas"
        htmlFor="notes"
        hint="Solo coordinación. No escribas el motivo ni lo conversado en la entrevista."
        error={errors.notes?.message}
      >
        <textarea
          id="notes"
          className={textareaClass}
          aria-describedby="notes-hint"
          {...register('notes')}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
