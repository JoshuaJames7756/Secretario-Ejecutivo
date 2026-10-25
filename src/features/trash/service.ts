import { db } from '@/db/database';
import { ENTITY_NAMES, TRASH_RETENTION_MS, type EntityName } from '@/db/repo';
import type { BaseEntity } from '@/db/types';
import { toDateString } from '@/features/followups/model';

export const ENTITY_LABEL: Record<EntityName, string> = {
  templates: 'Plantilla',
  meetings: 'Reunión',
  agendaItems: 'Punto de agenda',
  records: 'Registro o nota',
  followUps: 'Seguimiento',
  organizations: 'Barrio o rama',
  leaderAvailability: 'Horario de líder',
  interviewRequests: 'Solicitud de entrevista',
  interviewAppointments: 'Cita de entrevista',
  attachments: 'Adjunto',
};

export interface TrashItem {
  entity: EntityName;
  id: string;
  kind: string;
  label: string;
  deletedAt: number;
  /** Días que quedan para recuperarlo (se redondea hacia arriba: 1 = vence hoy). */
  daysLeft: number;
}

function preview(text: unknown, max = 80): string {
  const t = String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t || '(sin texto)';
}

function labelOf(entity: EntityName, row: Record<string, unknown>): string {
  switch (entity) {
    case 'templates':
    case 'organizations':
      return preview(row.name);
    case 'meetings':
    case 'agendaItems':
    case 'followUps':
    case 'attachments':
      return preview(row.title);
    case 'records':
      return preview(row.content);
    case 'interviewRequests':
      return preview(row.personName);
    case 'interviewAppointments':
      return `Cita del ${toDateString(new Date(row.startsAt as number))}`;
    case 'leaderAvailability':
      return `Horario ${String(row.leader ?? '')}`;
  }
}

export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_MS - now) / 86_400_000));
}

/** Todo lo eliminado y todavía recuperable, lo más reciente primero. */
export async function listTrash(now = Date.now()): Promise<TrashItem[]> {
  const items: TrashItem[] = [];
  for (const entity of ENTITY_NAMES) {
    const rows = (await db
      .table(entity)
      .filter((r: BaseEntity) => r.deletedAt !== undefined)
      .toArray()) as (BaseEntity & Record<string, unknown>)[];
    for (const row of rows) {
      if (now - row.deletedAt! >= TRASH_RETENTION_MS) continue; // vencido: ya no se recupera
      items.push({
        entity,
        id: row.id,
        kind: ENTITY_LABEL[entity],
        label: labelOf(entity, row),
        deletedAt: row.deletedAt!,
        daysLeft: daysLeft(row.deletedAt!, now),
      });
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function countExpired(now = Date.now()): Promise<number> {
  let total = 0;
  for (const entity of ENTITY_NAMES) {
    total += await db
      .table(entity)
      .filter(
        (r: BaseEntity) => r.deletedAt !== undefined && now - r.deletedAt >= TRASH_RETENTION_MS,
      )
      .count();
  }
  return total;
}
