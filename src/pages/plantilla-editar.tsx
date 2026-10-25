import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, describedBy, inputClass, textareaClass } from '@/components/ui/field';
import { db } from '@/db/database';
import type { MeetingTemplate } from '@/db/types';
import { linesToList } from '@/features/meetings/labels';
import { agendaToText, textToAgenda } from '@/features/templates/format';
import { updateTemplate } from '@/features/templates/service';
import { attempt } from '@/lib/actions';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Escribe un nombre para la plantilla.')
    .max(120, 'Máximo 120 caracteres.'),
  category: z.string().trim().max(60, 'Máximo 60 caracteres.'),
  description: z.string().max(600, 'Máximo 600 caracteres.'),
  leader: z.string().max(120, 'Máximo 120 caracteres.'),
  suggestedFrequency: z.string().max(160, 'Máximo 160 caracteres.'),
  durationMin: z
    .string()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 600), {
      message: 'Indica minutos entre 5 y 600, o déjalo vacío.',
    }),
  participants: z.string(),
  agenda: z.string(),
  checklist: z.string(),
});

type FormValues = z.infer<typeof schema>;

function TemplateForm({ template }: { template: MeetingTemplate }) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template.name,
      category: template.category,
      description: template.description ?? '',
      leader: template.leader ?? '',
      suggestedFrequency: template.suggestedFrequency ?? '',
      durationMin: template.durationMin ? String(template.durationMin) : '',
      participants: template.suggestedParticipants.join('\n'),
      agenda: agendaToText(template.agendaPoints),
      checklist: template.checklist.join('\n'),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const saved = await attempt(
      () =>
        updateTemplate(template.id, {
          name: values.name,
          category: values.category,
          description: values.description,
          leader: values.leader,
          suggestedFrequency: values.suggestedFrequency,
          durationMin: values.durationMin ? Number(values.durationMin) : undefined,
          suggestedParticipants: linesToList(values.participants),
          agendaPoints: textToAgenda(values.agenda),
          checklist: linesToList(values.checklist),
        }),
      { success: 'Plantilla guardada. Las reuniones ya creadas no cambian.' },
    );
    if (saved) navigate(`/plantillas/${template.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
      <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
        <input
          id="name"
          className={inputClass}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy('name', errors.name?.message)}
          {...register('name')}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Categoría" htmlFor="category" error={errors.category?.message}>
          <input id="category" className={inputClass} {...register('category')} />
        </Field>
        <Field label="Dirige" htmlFor="leader" error={errors.leader?.message}>
          <input id="leader" className={inputClass} {...register('leader')} />
        </Field>
        <Field
          label="Frecuencia sugerida"
          htmlFor="suggestedFrequency"
          hint="Es una configuración tuya, no una indicación del Manual."
          error={errors.suggestedFrequency?.message}
        >
          <input
            id="suggestedFrequency"
            className={inputClass}
            {...register('suggestedFrequency')}
          />
        </Field>
        <Field
          label="Duración orientativa (minutos)"
          htmlFor="durationMin"
          error={errors.durationMin?.message}
        >
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
      <Field label="Descripción" htmlFor="description" error={errors.description?.message}>
        <textarea id="description" className={textareaClass} {...register('description')} />
      </Field>
      <Field label="Participantes sugeridos" htmlFor="participants" hint="Uno por línea.">
        <textarea id="participants" className={textareaClass} {...register('participants')} />
      </Field>
      <Field
        label="Puntos de agenda"
        htmlFor="agenda"
        hint='Uno por línea. Puedes añadir una descripción después de una barra vertical: "Presupuesto | Revisar el gasto del trimestre".'
      >
        <textarea id="agenda" className={textareaClass} {...register('agenda')} />
      </Field>
      <Field label="Lista de preparación" htmlFor="checklist" hint="Una por línea.">
        <textarea id="checklist" className={textareaClass} {...register('checklist')} />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar plantilla'}
        </Button>
        <Link to={`/plantillas/${template.id}`} className={buttonVariants({ variant: 'ghost' })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

export default function PlantillaEditarPage() {
  const { id = '' } = useParams<{ id: string }>();
  const template = useLiveQuery(async () => {
    const row = await db.templates.get(id);
    return row && row.deletedAt === undefined ? row : null;
  }, [id]);

  if (template === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando…
      </p>
    );
  }
  if (template === null) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No encontramos esta plantilla"
        description="Pudo haber sido eliminada."
      >
        <Link to="/plantillas" className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}>
          Volver a plantillas
        </Link>
      </EmptyState>
    );
  }
  if (template.origin === 'oficial') {
    return (
      <EmptyState
        icon={BookOpen}
        title="Las plantillas oficiales no se editan"
        description="Duplícala como plantilla local para adaptarla sin alterar la referencia del Manual."
      >
        <Link
          to={`/plantillas/${template.id}`}
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}
        >
          Volver a la plantilla
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Editar plantilla" title={template.name} />
      <TemplateForm key={template.id} template={template} />
    </>
  );
}
