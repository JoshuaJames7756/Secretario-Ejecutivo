import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Copy, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Card, CardTitle, EmptyState, PageHeader } from '@/components/shared/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import { agendaQuery, recordsQuery } from '@/features/meetings/service';
import {
  SECTION_LABEL,
  SECTION_ORDER,
  buildReport,
  type SectionKey,
} from '@/features/reports/build';
import { cn } from '@/lib/utils';

const DEFAULT_SECTIONS: SectionKey[] = [
  'resumen',
  'agenda',
  'decisiones',
  'asignaciones',
  'pendientes',
];

export default function ReunionInformePage() {
  const { id = '' } = useParams<{ id: string }>();
  const [sections, setSections] = useState<SectionKey[]>(DEFAULT_SECTIONS);
  const [includePrivate, setIncludePrivate] = useState(false);
  const [style, setStyle] = useState<'whatsapp' | 'texto'>('whatsapp');
  const [excluded, setExcluded] = useState<string[]>([]);

  const data = useLiveQuery(async () => {
    const meeting = await db.meetings.get(id);
    if (!meeting || !isActive(meeting)) return null;
    const [agenda, records, followUps] = await Promise.all([
      agendaQuery(id),
      recordsQuery(id),
      db.followUps.where('originMeetingId').equals(id).filter(isActive).toArray(),
    ]);
    return { meeting, agenda, records, followUps };
  }, [id]);

  const report = useMemo(
    () =>
      data
        ? buildReport(data, {
            sections,
            includePrivate,
            style,
            agendaItemIds: data.agenda.map((a) => a.id).filter((x) => !excluded.includes(x)),
          })
        : undefined,
    [data, sections, includePrivate, style, excluded],
  );

  if (data === undefined) {
    return (
      <p role="status" className="text-muted">
        Cargando…
      </p>
    );
  }
  if (data === null || !report) {
    return (
      <EmptyState
        icon={Copy}
        title="No encontramos esta reunión"
        description="Puede que se haya eliminado."
      >
        <Link to="/reuniones" className={cn(buttonVariants(), 'mt-5')}>
          Ir a Reuniones
        </Link>
      </EmptyState>
    );
  }

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.text);
      toast.success('Informe copiado. Pégalo donde quieras compartirlo.');
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  };

  return (
    <>
      <PageHeader
        title="Informe de la reunión"
        eyebrow={data.meeting.title}
        description="Elige qué incluir y revisa la vista previa. Nada se envía automáticamente."
        actions={
          <Link to={`/reuniones/${id}`} className={cn(buttonVariants({ variant: 'outline' }))}>
            <ArrowLeft className="size-4" aria-hidden />
            Volver a la reunión
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2 print:hidden">
          <Card aria-labelledby="secciones">
            <CardTitle>
              <span id="secciones">Secciones</span>
            </CardTitle>
            <ul className="space-y-1">
              {SECTION_ORDER.map((key) => (
                <li key={key}>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={sections.includes(key)}
                      onChange={() => setSections((s) => toggle(s, key))}
                    />
                    {SECTION_LABEL[key]}
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          {data.agenda.length > 0 && (
            <Card aria-labelledby="puntos">
              <CardTitle>
                <span id="puntos">Puntos de agenda</span>
              </CardTitle>
              <ul className="space-y-1">
                {data.agenda.map((a, i) => (
                  <li key={a.id}>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--primary)]"
                        checked={!excluded.includes(a.id)}
                        onChange={() => setExcluded((x) => toggle(x, a.id))}
                      />
                      {i + 1}. {a.title}
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card aria-labelledby="privacidad">
            <CardTitle>
              <span id="privacidad">Privacidad y formato</span>
            </CardTitle>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={includePrivate}
                onChange={(e) => setIncludePrivate(e.target.checked)}
              />
              Incluir registros y notas privados
            </label>
            {report.excludedPrivate > 0 && (
              <p role="status" className="mt-1 text-sm text-muted">
                {report.excludedPrivate}{' '}
                {report.excludedPrivate === 1 ? 'registro privado' : 'registros privados'} no se
                incluyó.
              </p>
            )}
            <div role="radiogroup" aria-label="Formato" className="mt-3 flex gap-2">
              {(
                [
                  ['whatsapp', 'WhatsApp'],
                  ['texto', 'Texto plano'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={style === value}
                  onClick={() => setStyle(value)}
                  className={cn(
                    'min-h-11 rounded-xl border px-3 text-sm font-medium',
                    style === value
                      ? 'border-primary bg-primary-soft text-primary-soft-fg'
                      : 'border-border-strong bg-surface hover:bg-surface-2',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-3 print:col-span-5">
          <Card aria-labelledby="vista-previa">
            <CardTitle>
              <span id="vista-previa" className="print:hidden">
                Vista previa
              </span>
            </CardTitle>
            <pre
              id="informe-imprimible"
              className="font-sans text-base leading-relaxed whitespace-pre-wrap"
              aria-label="Texto del informe"
            >
              {report.text}
            </pre>
          </Card>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={copy}>
              <Copy className="size-4" aria-hidden />
              Copiar informe
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Imprimir o guardar como PDF
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
