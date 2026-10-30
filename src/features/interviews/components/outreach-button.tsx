import { Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { InterviewAppointment, InterviewRequest } from '@/db/types';
import { attempt } from '@/lib/actions';
import { outreachFor } from '../outreach';
import { markContacted } from '../service';
import { usePresidencyNames } from '../use-interview-data';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Un toque para avisar: abre WhatsApp con el mensaje escrito (si hay número) o lo copia.
 * Pasa solo de «mensaje» a «recordatorio» y desaparece cuando la persona confirma.
 */
export function OutreachButton({
  request,
  appointment,
  now,
}: {
  request: InterviewRequest;
  appointment: InterviewAppointment;
  now: number;
}) {
  const names = usePresidencyNames();
  const outreach = outreachFor(request, appointment, names, now);
  if (!outreach) return null;

  const send = async () => {
    if (outreach.whatsapp) {
      window.open(outreach.whatsapp, '_blank', 'noopener');
    } else if (await copy(outreach.text)) {
      toast.success('Mensaje copiado. Pégalo en WhatsApp.');
    } else {
      toast.error('No se pudo copiar. Ábrela y copia el texto del detalle.');
      return;
    }
    await attempt(() => markContacted(appointment.id));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={() => void send()}>
        <MessageCircle className="size-4" aria-hidden />
        {outreach.label}
        {!outreach.whatsapp && ' (copiar)'}
      </Button>
      {outreach.whatsapp && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Copiar el texto para ${request.personName}`}
          onClick={async () => {
            if (await copy(outreach.text)) {
              toast.success('Texto copiado.');
              await attempt(() => markContacted(appointment.id));
            } else toast.error('No se pudo copiar.');
          }}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
