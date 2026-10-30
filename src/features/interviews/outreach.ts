import type { InterviewAppointment, InterviewRequest } from '@/db/types';
import { confirmationMessage, reminderMessage, whatsappUrl, type PresidencyNames } from './model';

export interface Outreach {
  kind: 'inicial' | 'recordatorio';
  label: string;
  text: string;
  /** Abre el chat de WhatsApp con el texto escrito (solo si hay número). */
  whatsapp?: string;
}

/**
 * Qué mensaje toca mandar: el primero si todavía no se avisó, el recordatorio si se avisó y no
 * confirmó. Si ya confirmó, no hace falta ninguno.
 */
export function outreachFor(
  request: InterviewRequest,
  appointment: InterviewAppointment,
  names: PresidencyNames,
  now: number,
): Outreach | null {
  if (appointment.confirmed === true) return null;
  const base = {
    personName: request.personName,
    treatment: request.treatment,
    leader: appointment.leader,
    startsAt: appointment.startsAt,
    modality: request.modality,
    names,
  };
  const reminder = appointment.contactedAt !== undefined;
  const text = reminder ? reminderMessage({ ...base, now }) : confirmationMessage(base);
  return {
    kind: reminder ? 'recordatorio' : 'inicial',
    label: reminder ? 'Enviar recordatorio' : 'Enviar mensaje',
    text,
    whatsapp: request.phone ? whatsappUrl(request.phone, text) : undefined,
  };
}
