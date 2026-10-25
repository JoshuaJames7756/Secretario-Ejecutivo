import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  Copy,
  ExternalLink,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmButton } from '@/components/shared/confirm-button';
import { Card, CardTitle, EmptyState, PageHeader } from '@/components/shared/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { db } from '@/db/database';
import { softDeleteEntity } from '@/db/repo';
import { TemplateBadges } from '@/features/templates/components/template-badges';
import {
  duplicateAsLocal,
  markReferenceReviewed,
  setTemplateStatus,
} from '@/features/templates/service';
import { attempt } from '@/lib/actions';
import { cn, formatDateTime } from '@/lib/utils';
import { BookOpen } from 'lucide-react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {children}
    </Card>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function PlantillaDetallePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // undefined = cargando, null = no existe o fue eliminada
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
        description="Pudo haber sido eliminada. Las eliminadas se pueden recuperar durante 30 días."
      >
        <Link to="/plantillas" className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}>
          Volver a plantillas
        </Link>
      </EmptyState>
    );
  }

  const isOfficial = template.origin === 'oficial';

  const duplicate = async () => {
    const copy = await attempt(() => duplicateAsLocal(template.id), {
      success: 'Copia local creada. Ahora puedes adaptarla.',
    });
    if (copy) navigate(`/plantillas/${copy.id}/editar`);
  };

  const remove = async () => {
    const done = await attempt(() => softDeleteEntity('templates', template.id), {
      success: 'Plantilla eliminada. Se puede recuperar durante 30 días.',
    });
    if (done) navigate('/plantillas');
  };

  return (
    <>
      <PageHeader eyebrow={template.category} title={template.name} />
      <div className="mb-6">
        <TemplateBadges template={template} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {template.status === 'activo' && (
          <Link
            to={`/reuniones/nueva?plantilla=${template.id}`}
            className={buttonVariants({ variant: 'default' })}
          >
            <CalendarPlus className="size-4" aria-hidden />
            Programar reunión
          </Link>
        )}
        <Button variant="outline" onClick={duplicate}>
          <Copy className="size-4" aria-hidden />
          Duplicar como plantilla local
        </Button>
        {!isOfficial && (
          <Link
            to={`/plantillas/${template.id}/editar`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </Link>
        )}
        <Button
          variant="ghost"
          onClick={() =>
            attempt(() =>
              setTemplateStatus(template.id, template.status === 'activo' ? 'archivado' : 'activo'),
            )
          }
        >
          {template.status === 'activo' ? (
            <>
              <Archive className="size-4" aria-hidden />
              Archivar
            </>
          ) : (
            <>
              <ArchiveRestore className="size-4" aria-hidden />
              Restaurar
            </>
          )}
        </Button>
        <ConfirmButton size="default" confirmLabel="Eliminar" onConfirm={remove}>
          Eliminar
        </ConfirmButton>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {isOfficial && (
          <Section title="Referencia del Manual General">
            <p>
              Sección <strong>{template.manualRef}</strong>
              {template.manualUrl && (
                <>
                  {' · '}
                  <a
                    href={template.manualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary-soft-fg underline underline-offset-2"
                  >
                    Abrir el capítulo
                    <ExternalLink className="size-3.5" aria-hidden />
                    <span className="sr-only">(se abre en una pestaña nueva)</span>
                  </a>
                </>
              )}
            </p>
            {template.lastReviewedAt ? (
              <p className="mt-3 flex items-center gap-2 text-success">
                <ShieldCheck className="size-4" aria-hidden />
                Comparada con el texto oficial el {formatDateTime(template.lastReviewedAt)}.
              </p>
            ) : (
              <div className="mt-3 space-y-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">
                <p>
                  Estos datos se extrajeron de forma automática y aún no se han comparado con el
                  texto oficial. Abre el capítulo, revisa el nombre, quién dirige, los participantes
                  y la frecuencia, y luego confirma.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    attempt(() => markReferenceReviewed(template.id), {
                      success: 'Referencia marcada como verificada',
                    })
                  }
                >
                  Ya la comparé: marcar como verificada
                </Button>
              </div>
            )}
          </Section>
        )}

        <Section title="Descripción">
          <p className="text-pretty">{template.description ?? 'Sin descripción.'}</p>
          {template.leader && (
            <p className="mt-3">
              <span className="text-muted">Dirige: </span>
              {template.leader}
            </p>
          )}
        </Section>

        <Section title="Frecuencia sugerida">
          {template.suggestedFrequency ? (
            <>
              <p>{template.suggestedFrequency}</p>
              {template.frequencyBasis && (
                <p className="mt-1 text-sm text-muted">Fundamento: {template.frequencyBasis}</p>
              )}
            </>
          ) : (
            <p className="text-muted">
              {isOfficial
                ? 'El Manual no indica una frecuencia para esta reunión. Se configura según tu estaca.'
                : 'Sin definir.'}
            </p>
          )}
        </Section>

        <Section title="Participantes sugeridos">
          <BulletList items={template.suggestedParticipants} empty="Sin participantes definidos." />
        </Section>

        <Section title="Puntos de agenda sugeridos">
          {isOfficial && (
            <p className="mb-3 text-sm text-muted">
              Son sugerencias de la aplicación, no indicaciones del Manual. Al programar una reunión
              se copian y puedes cambiarlos libremente.
            </p>
          )}
          {template.agendaPoints.length === 0 ? (
            <p className="text-muted">Sin puntos de agenda.</p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5">
              {template.agendaPoints.map((point) => (
                <li key={point.title}>
                  {point.title}
                  {point.description && (
                    <span className="block text-sm text-muted">{point.description}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Lista de preparación">
          <BulletList items={template.checklist} empty="Sin lista de preparación." />
        </Section>
      </div>
    </>
  );
}
