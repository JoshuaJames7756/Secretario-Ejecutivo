import { z } from 'zod';

/** Valida el formulario de reunión. Todos los campos son texto (así los entrega el formulario). */
export const meetingFormSchema = z.object({
  templateId: z.string(),
  title: z
    .string()
    .trim()
    .min(1, 'Escribe un nombre para la reunión.')
    .max(120, 'Máximo 120 caracteres.'),
  startsAt: z
    .string()
    .min(1, 'Indica la fecha y la hora.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'La fecha o la hora no son válidas.'),
  durationMin: z
    .string()
    .regex(/^\d+$/, 'Indica los minutos con un número entero.')
    .refine(
      (v) => Number(v) >= 5 && Number(v) <= 600,
      'La duración debe estar entre 5 y 600 minutos.',
    ),
  place: z.string().max(120, 'Máximo 120 caracteres.'),
  participants: z.string(),
});

export type MeetingFormValues = z.infer<typeof meetingFormSchema>;
