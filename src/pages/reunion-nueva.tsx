import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { dayToDateTimeLocal } from '@/features/calendar/model';
import { PageHeader } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Field, describedBy, inputClass, textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import type { MeetingTemplate } from '@/db/types';
import {
  fromDateTimeLocal,
  linesToList,
  nextFullHour,
  toDateTimeLocal,
} from '@/features/meetings/labels';
import { meetingFormSchema, type MeetingFormValues } from '@/features/meetings/schemas';
import { createMeeting } from '@/features/meetings/service';
import { attempt } from '@/lib/actions';

function NewMeetingForm({
  templates,
  initialTemplate,
  initialDate,
}: {
  templates: MeetingTemplate[];
  initialTemplate?: MeetingTemplate;
  initialDate?: string;
}) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    getValues,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      templateId: initialTemplate?.id ?? '',
      title: initialTemplate?.name ?? '',
      startsAt: initialDate ? dayToDateTimeLocal(initialDate) : toDateTimeLocal(nextFullHour()),
      durationMin: String(initialTemplate?.durationMin ?? 60),
      place: '',
      participants: initialTemplate?.suggestedParticipants.join('\n') ?? '',
    },
  });

  const selectedId = useWatch({ control, name: 'templateId' });
  const selected = templates.find((t) => t.id === selectedId);

  // Al elegir otra plantilla se ofrecen sus datos, sin pisar lo que la persona ya escribió.
  const onTemplateChange = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (!getValues('title').trim()) setValue('title', t.name);
    if (!getValues('participants').trim())
      setValue('participants', t.suggestedParticipants.join('\n'));
    if (t.durationMin) setValue('durationMin', String(t.durationMin));
  };

  const onSubmit = handleSubmit(async (values) => {
    const meeting = await attempt(() =>
      createMeeting({
        title: values.title,
        startsAt: fromDateTimeLocal(values.startsAt),
        durationMin: Number(values.durationMin),
        place: values.place,
        participants: linesToList(values.participants),
        templateId: values.templateId || undefined,
      }),
    );
    if (meeting) navigate(`/reuniones/${meeting.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
      <Field
        label="Plantilla (opcional)"
        htmlFor="templateId"
        hint="Se copian sus puntos de agenda. Después la reunión es independiente."
      >
        <select
          id="templateId"
          className={inputClass}
          aria-describedby="templateId-hint"
          {...register('templateId', { onChange: (e) => onTemplateChange(e.target.value) })}
        >
          <option value="">Sin plantilla</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <p role="status" className="rounded-xl bg-primary-soft p-3 text-sm text-primary-soft-fg">
          Se copiarán {selected.agendaPoints.length}{' '}
          {selected.agendaPoints.length === 1 ? 'punto' : 'puntos'} de agenda. Podrás cambiarlos sin
          afectar la plantilla.
        </p>
      )}

      <Field label="Nombre" htmlFor="title" error={errors.title?.message}>
        <input
          id="title"
          className={inputClass}
          aria-invalid={!!errors.title}
          aria-describedby={describedBy('title', errors.title?.message)}
          {...register('title')}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Fecha y hora" htmlFor="startsAt" error={errors.startsAt?.message}>
          <input
            id="startsAt"
            type="datetime-local"
            className={inputClass}
            aria-invalid={!!errors.startsAt}
            aria-describedby={describedBy('startsAt', errors.startsAt?.message)}
            {...register('startsAt')}
          />
        </Field>
        <Field label="Duración (minutos)" htmlFor="durationMin" error={errors.durationMin?.message}>
          <input
            id="durationMin"
            inputMode="numeric"
            className={inputClass}
            aria-invalid={!!errors.durationMin}
            aria-describedby={describedBy('durationMin', errors.durationMin?.message)}
            {...register('durationMin')}
          />
        </Field>
      </div>
      <Field label="Lugar (opcional)" htmlFor="place" error={errors.place?.message}>
        <input id="place" className={inputClass} {...register('place')} />
      </Field>
      <Field label="Participantes" htmlFor="participants" hint="Uno por línea.">
        <textarea
          id="participants"
          className={textareaClass}
          aria-describedby="participants-hint"
          {...register('participants')}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando…' : 'Crear reunión'}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default function ReunionNuevaPage() {
  const [params] = useSearchParams();
  const prefill = params.get('plantilla') ?? '';
  const rawDate = params.get('fecha') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;
  const templates = useLiveQuery(async () => {
    const rows = await db.templates.filter((t) => t.deletedAt === undefined).toArray();
    return rows
      .filter((t) => t.status === 'activo' || t.id === prefill)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [prefill]);

  return (
    <>
      <PageHeader title="Nueva reunión" />
      {templates === undefined ? (
        <p role="status" className="text-muted">
          Cargando…
        </p>
      ) : (
        <NewMeetingForm
          templates={templates}
          initialTemplate={templates.find((t) => t.id === prefill)}
          initialDate={date}
        />
      )}
    </>
  );
}
