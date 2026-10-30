import { ArrowLeft, Copy, Download, FileText, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Card, CardTitle, PageHeader } from '@/components/shared/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { Segmented } from '@/features/interviews/components/segmented';
import { toDateString } from '@/features/followups/model';
import { ConfirmedToggle } from '@/features/interviews/components/confirmed-toggle';
import {
  copyImage,
  downloadImage,
  renderSummaryBlob,
  shareImage,
  summaryText,
  summaryTitle,
  weekText,
} from '@/features/interviews/day-summary';
import { formatClock } from '@/features/interviews/model';
import { setConfirmed } from '@/features/interviews/service';
import { usePresidencyNames } from '@/features/interviews/use-interview-data';
import { useDaysEntries } from '@/features/interviews/use-summary';
import { attempt, describeError } from '@/lib/actions';
import { cn } from '@/lib/utils';

/**
 * Imagen con la agenda de un día (hora, nombre, barrio, motivo y quién entrevista) para pegar en
 * el grupo de la presidencia. Se dibuja en el teléfono: no se sube a ningún servidor.
 */
export default function EntrevistasResumenPage() {
  const [params, setParams] = useSearchParams();
  const [tomorrow] = useState(() => toDateString(new Date(Date.now() + 24 * 3_600_000)));
  const dateKey = params.get('fecha') ?? tomorrow;
  const week = params.get('modo') === 'semana';
  const day = new Date(`${dateKey}T12:00:00`);
  const lastDay = new Date(day);
  lastDay.setDate(lastDay.getDate() + 6);
  const names = usePresidencyNames();
  const days = useDaysEntries(dateKey, week ? 7 : 1);
  const entries = days?.flatMap((d) => d.entries);
  const shortDay = (d: Date) => summaryTitle(d).split(' ').slice(1).join(' ');
  const header = week
    ? { eyebrow: 'Entrevistas de la semana', title: `${shortDay(day)} al ${shortDay(lastDay)}` }
    : { eyebrow: 'Entrevistas de estaca', title: summaryTitle(day) };
  const label = week ? header.title : summaryTitle(day);

  const [blob, setBlob] = useState<Blob | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!days) return;
    let cancelled = false;
    let url: string | undefined;
    renderSummaryBlob(days, names, header)
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setPreviewUrl(url);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // `day` se deriva de `dateKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, names, dateKey, week]);

  const filename = `entrevistas-${week ? 'semana-' : ''}${dateKey}.png`;

  const share = async () => {
    if (!blob) return;
    try {
      const result = await shareImage(blob, filename);
      if (result === 'unsupported') {
        downloadImage(blob, filename);
        toast.info('Este navegador no puede compartir directo. Se descargó la imagen.');
      }
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const copy = async () => {
    if (!blob) return;
    try {
      if (await copyImage(blob)) toast.success('Imagen copiada. Pégala en el grupo.');
      else toast.info('Este navegador no permite copiar imágenes. Usa «Compartir» o «Descargar».');
    } catch {
      toast.error('No se pudo copiar la imagen. Usa «Compartir» o «Descargar».');
    }
  };

  const copyText = async () => {
    if (!entries) return;
    try {
      await navigator.clipboard.writeText(
        week ? weekText(days ?? [], names, header.title) : summaryText(day, entries, names),
      );
      toast.success('Texto copiado.');
    } catch {
      toast.error('No se pudo copiar el texto.');
    }
  };

  return (
    <>
      <PageHeader
        title="Resumen para el grupo"
        description="Imagen con la hora, la persona, el barrio, el motivo y quién entrevista."
        actions={
          <Link to="/entrevistas" className={cn(buttonVariants({ variant: 'outline' }))}>
            <ArrowLeft className="size-4" aria-hidden />
            Entrevistas
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="space-y-5">
          <Card>
            <div className="mb-4">
              <Segmented
                label="Qué enviar"
                value={week ? 'semana' : 'dia'}
                onChange={(v) =>
                  setParams({ fecha: dateKey, ...(v === 'semana' ? { modo: 'semana' } : {}) })
                }
                options={[
                  { value: 'dia', label: 'Un día' },
                  { value: 'semana', label: 'Siete días' },
                ]}
              />
            </div>
            <Field label={week ? 'Desde el día' : 'Día de las entrevistas'} htmlFor="resumen-fecha">
              <input
                id="resumen-fecha"
                type="date"
                className={inputClass}
                value={dateKey}
                onChange={(e) =>
                  e.target.value &&
                  setParams({ fecha: e.target.value, ...(week ? { modo: 'semana' } : {}) })
                }
              />
            </Field>
            <p className="mt-2 text-sm text-muted">
              Por defecto, mañana: {summaryTitle(new Date(`${tomorrow}T12:00`))}.
            </p>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => void share()} disabled={!blob || !entries?.length}>
                <Share2 className="size-4" aria-hidden />
                Compartir imagen (WhatsApp)
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => void copy()}
                  disabled={!blob || !entries?.length}
                >
                  <Copy className="size-4" aria-hidden />
                  Copiar imagen
                </Button>
                <Button
                  variant="outline"
                  onClick={() => blob && downloadImage(blob, filename)}
                  disabled={!blob || !entries?.length}
                >
                  <Download className="size-4" aria-hidden />
                  Descargar
                </Button>
              </div>
              <Button variant="ghost" onClick={() => void copyText()} disabled={!entries?.length}>
                <FileText className="size-4" aria-hidden />
                Copiar como texto
              </Button>
            </div>
          </Card>

          {entries && entries.length > 0 && (
            <Card aria-labelledby="confirmar-dia">
              <CardTitle>
                <span id="confirmar-dia">Confirmaciones</span>
              </CardTitle>
              <p className="mb-3 text-sm text-muted">Se reflejan en la imagen.</p>
              <ul className="space-y-2">
                {entries
                  .slice()
                  .sort((a, b) => a.startsAt - b.startsAt)
                  .map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-sm">
                        <span className="font-medium tabular-nums">{formatClock(e.startsAt)}</span>{' '}
                        <span className="truncate">{e.name}</span>
                      </span>
                      <ConfirmedToggle
                        size="sm"
                        personName={e.name}
                        confirmed={e.confirmed}
                        onChange={(next) => {
                          void attempt(() => setConfirmed(e.id, next));
                        }}
                      />
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>

        <div>
          {entries === undefined && (
            <p role="status" className="text-muted">
              Preparando…
            </p>
          )}
          {failed && (
            <p role="alert" className="text-danger">
              No se pudo preparar la imagen en este dispositivo. Usa «Copiar como texto».
            </p>
          )}
          {entries?.length === 0 && (
            <p className="rounded-xl bg-surface-2 p-4 text-muted">
              No hay entrevistas agendadas para {label}.
            </p>
          )}
          {previewUrl && entries && entries.length > 0 && (
            <img
              src={previewUrl}
              alt={`Entrevistas de ${label}: ${entries.length}`}
              className="w-full max-w-xl rounded-xl border border-border shadow-card"
            />
          )}
        </div>
      </div>
    </>
  );
}
