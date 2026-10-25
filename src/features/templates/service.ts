import { db } from '@/db/database';
import { createEntity, runInTransaction, updateEntity, RecordNotFoundError } from '@/db/repo';
import { getSetting, setSetting } from '@/db/settings';
import type { AgendaPointTemplate, Id, MeetingTemplate } from '@/db/types';
import { ValidationError } from '@/features/followups/service';
import { CATALOG, CATALOG_VERSION } from './catalog';

const CATALOG_VERSION_KEY = 'catalogVersion';

/**
 * Carga el catálogo inicial. Es idempotente y no sobrescribe: si una plantilla ya existe
 * (incluso editada, archivada o eliminada), se respeta tal como está.
 */
export async function seedCatalog(): Promise<void> {
  if ((await getSetting<number>(CATALOG_VERSION_KEY)) === CATALOG_VERSION) return;
  await runInTransaction(async () => {
    for (const entry of CATALOG) await createEntity('templates', entry);
    await setSetting(CATALOG_VERSION_KEY, CATALOG_VERSION);
  });
}

export class OfficialTemplateError extends Error {
  constructor() {
    super(
      'Las plantillas oficiales no se editan. Duplícala como plantilla local para adaptarla sin alterar la referencia del Manual.',
    );
    this.name = 'OfficialTemplateError';
  }
}

async function getActive(id: Id): Promise<MeetingTemplate> {
  const template = await db.templates.get(id);
  if (!template || template.deletedAt !== undefined) throw new RecordNotFoundError('templates', id);
  return template;
}

/**
 * Copia una plantilla como local. La copia no hereda la referencia del Manual: así una
 * configuración propia nunca se presenta como indicación oficial (especificación, 5.4).
 */
export async function duplicateAsLocal(id: Id): Promise<MeetingTemplate> {
  const source = await getActive(id);
  return createEntity('templates', {
    name: `${source.name} (local)`,
    category: source.category,
    description: source.description,
    suggestedParticipants: [...source.suggestedParticipants],
    leader: source.leader,
    suggestedFrequency: source.suggestedFrequency,
    frequencyBasis: source.suggestedFrequency ? 'Configuración local' : undefined,
    durationMin: source.durationMin,
    agendaPoints: source.agendaPoints.map((p) => ({ ...p })),
    checklist: [...source.checklist],
    origin: 'local',
    status: 'activo',
  });
}

export async function createBlankTemplate(name: string): Promise<MeetingTemplate> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError('La plantilla necesita un nombre.');
  return createEntity('templates', {
    name: trimmed,
    category: 'Otras reuniones',
    suggestedParticipants: [],
    agendaPoints: [],
    checklist: [],
    origin: 'personal',
    status: 'activo',
  });
}

export interface TemplateEdit {
  name: string;
  category: string;
  description?: string;
  suggestedParticipants: string[];
  leader?: string;
  suggestedFrequency?: string;
  durationMin?: number;
  agendaPoints: AgendaPointTemplate[];
  checklist: string[];
}

/** Edita una plantilla local o personal. Las oficiales se duplican primero. */
export async function updateTemplate(id: Id, edit: TemplateEdit): Promise<MeetingTemplate> {
  return runInTransaction(async () => {
    const current = await getActive(id);
    if (current.origin === 'oficial') throw new OfficialTemplateError();
    const name = edit.name.trim();
    if (!name) throw new ValidationError('La plantilla necesita un nombre.');
    return updateEntity('templates', id, {
      name,
      category: edit.category.trim() || 'Otras reuniones',
      description: edit.description?.trim() || undefined,
      suggestedParticipants: edit.suggestedParticipants,
      leader: edit.leader?.trim() || undefined,
      suggestedFrequency: edit.suggestedFrequency?.trim() || undefined,
      frequencyBasis: edit.suggestedFrequency?.trim() ? 'Configuración local' : undefined,
      durationMin: edit.durationMin,
      agendaPoints: edit.agendaPoints,
      checklist: edit.checklist,
    });
  });
}

/** La persona confirma que comparó la referencia con el texto vivo del Manual. */
export async function markReferenceReviewed(id: Id, at = Date.now()): Promise<MeetingTemplate> {
  return runInTransaction(async () => {
    const current = await getActive(id);
    if (current.origin !== 'oficial') {
      throw new ValidationError(
        'Solo las plantillas oficiales tienen una referencia que verificar.',
      );
    }
    return updateEntity('templates', id, { lastReviewedAt: at });
  });
}

export async function setTemplateStatus(id: Id, status: MeetingTemplate['status']) {
  return updateEntity('templates', id, { status });
}
