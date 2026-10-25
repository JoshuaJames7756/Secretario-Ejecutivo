import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, CircleAlert, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { EmptyState, PageHeader } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/components/ui/field';
import { db } from '@/db/database';
import { isActive } from '@/db/repo';
import type { MeetingTemplate } from '@/db/types';
import { TEMPLATE_CATEGORY_ORDER } from '@/features/templates/catalog';
import { TemplateBadges } from '@/features/templates/components/template-badges';
import { createBlankTemplate } from '@/features/templates/service';
import { attempt } from '@/lib/actions';

function groupByCategory(templates: MeetingTemplate[]): [string, MeetingTemplate[]][] {
  const groups = new Map<string, MeetingTemplate[]>();
  for (const t of templates) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  const rank = (category: string) => {
    const i = TEMPLATE_CATEGORY_ORDER.indexOf(category);
    return i === -1 ? TEMPLATE_CATEGORY_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'es'))
    .map(([category, items]) => [
      category,
      items.sort((a, b) => a.name.localeCompare(b.name, 'es')),
    ]);
}

function NewTemplateForm() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Nueva plantilla
      </Button>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const created = await attempt(() => createBlankTemplate(name));
    setBusy(false);
    if (created) navigate(`/plantillas/${created.id}/editar`);
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
      <Field label="Nombre de la plantilla" htmlFor="nueva-plantilla" className="min-w-56 flex-1">
        <input
          id="nueva-plantilla"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <Button type="submit" disabled={busy || !name.trim()}>
        Crear
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}

export default function PlantillasPage() {
  const [showArchived, setShowArchived] = useState(false);
  const templates = useLiveQuery(() => db.templates.filter(isActive).toArray(), []);

  const visible = templates?.filter((t) => showArchived || t.status === 'activo');
  const archivedCount = templates?.filter((t) => t.status === 'archivado').length ?? 0;
  const unverified =
    visible?.filter((t) => t.origin === 'oficial' && !t.lastReviewedAt).length ?? 0;

  return (
    <>
      <PageHeader
        title="Plantillas y Manual"
        description="Catálogo de reuniones basado en el Manual General y tus plantillas locales. Cambiar una plantilla nunca altera reuniones ya programadas o realizadas."
        actions={<NewTemplateForm />}
      />

      {unverified > 0 && (
        <div
          role="note"
          className="mb-5 flex gap-3 rounded-card border border-border bg-warning-soft p-4 text-warning"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <strong>{unverified} referencias del Manual por verificar.</strong> Los nombres, las
            secciones y las frecuencias se extrajeron de los capítulos 6 y 29 de forma automática.
            Compáralos con el texto oficial y márcalos como verificados desde el detalle de cada
            plantilla.
          </p>
        </div>
      )}

      {visible === undefined ? (
        <p role="status" className="text-muted">
          Cargando plantillas…
        </p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No hay plantillas"
          description="Crea una plantilla local para empezar a programar reuniones."
        />
      ) : (
        <div className="space-y-8">
          {groupByCategory(visible).map(([category, items]) => (
            <section key={category} aria-labelledby={`cat-${category}`}>
              <h2 id={`cat-${category}`} className="mb-3 text-sm font-semibold text-muted">
                {category}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/plantillas/${t.id}`}
                      className="block h-full rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-2"
                    >
                      <p className="font-medium text-balance">{t.name}</p>
                      <div className="mt-2">
                        <TemplateBadges template={t} />
                      </div>
                      <p className="mt-3 text-sm text-muted">
                        {t.suggestedFrequency ?? 'Frecuencia no definida'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <p className="mt-8">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Ocultar archivadas' : `Mostrar archivadas (${archivedCount})`}
          </Button>
        </p>
      )}
    </>
  );
}
