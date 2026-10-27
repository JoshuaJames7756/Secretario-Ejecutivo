import { db } from '@/db/database';
import {
  applyRemoteDoc,
  rebaseForSync,
  runInTransaction,
  updateEntity,
  type EntityName,
} from '@/db/repo';
import type { SyncConflict } from '@/db/types';
import { snapshotNow, type VersionedEntity } from '@/features/versions/service';

/** Campo de texto libre que se puede conservar de ambos lados. Solo donde tiene sentido unir. */
export const MERGEABLE_TEXT_FIELD: Partial<Record<string, string>> = {
  records: 'content',
  agendaItems: 'notes',
};

export function canKeepBoth(conflict: SyncConflict): boolean {
  const field = MERGEABLE_TEXT_FIELD[conflict.entity];
  if (!field || conflict.server['deletedAt'] !== undefined) return false;
  const local = conflict.local[field];
  const server = conflict.server[field];
  return typeof local === 'string' && typeof server === 'string' && local !== server;
}

const HIDDEN_FIELDS = new Set(['id', 'rev', 'createdAt', 'updatedAt', 'deviceId']);

export interface FieldDifference {
  field: string;
  local: unknown;
  server: unknown;
}

/** Campos que dicen algo distinto en cada lado (sin los técnicos). */
export function differences(conflict: SyncConflict): FieldDifference[] {
  const fields = new Set([...Object.keys(conflict.local), ...Object.keys(conflict.server)]);
  const out: FieldDifference[] = [];
  for (const field of fields) {
    if (HIDDEN_FIELDS.has(field)) continue;
    const l = conflict.local[field];
    const s = conflict.server[field];
    if (JSON.stringify(l ?? null) !== JSON.stringify(s ?? null))
      out.push({ field, local: l, server: s });
  }
  return out;
}

async function dropOpsAndConflict(conflict: SyncConflict): Promise<void> {
  const ops = await db.syncOps
    .where('[entity+entityId]')
    .equals([conflict.entity, conflict.entityId])
    .toArray();
  // Solo las que esperaban esta decisión; una operación nueva creada después de rebasar se conserva.
  await db.syncOps.bulkDelete(
    ops.filter((o) => o.status === 'conflicto' || o.status === 'pendiente').map((o) => o.id),
  );
  await db.syncConflicts.delete(conflict.id);
}

/** Conservar la versión de este dispositivo: se vuelve a enviar sobre la del servidor, sin perderla. */
export async function keepMine(conflict: SyncConflict): Promise<void> {
  const serverRev = Number(conflict.server['rev'] ?? 0);
  await runInTransaction(async () => {
    await dropOpsAndConflict(conflict);
    await rebaseForSync(conflict.entity as EntityName, conflict.entityId, serverRev);
  });
}

/** Usar la versión del servidor. El texto local no se pierde: queda en "Versiones anteriores". */
export async function keepTheirs(conflict: SyncConflict): Promise<void> {
  await runInTransaction(async () => {
    const field = MERGEABLE_TEXT_FIELD[conflict.entity];
    const localText = field ? conflict.local[field] : undefined;
    if (field && typeof localText === 'string' && localText.trim()) {
      await snapshotNow(conflict.entity as VersionedEntity, conflict.entityId, localText);
    }
    await dropOpsAndConflict(conflict);
    await applyRemoteDoc(conflict.entity as EntityName, conflict.server as never, { force: true });
  });
}

/** Unir los dos textos: queda el del servidor y, debajo, el de este dispositivo. */
export function mergeTexts(server: string, local: string): string {
  return `${server}\n\nVersión escrita en este dispositivo:\n${local}`;
}

export async function keepBoth(conflict: SyncConflict): Promise<void> {
  const field = MERGEABLE_TEXT_FIELD[conflict.entity];
  if (!field || !canKeepBoth(conflict)) throw new Error('Este elemento no se puede unir.');
  const merged = mergeTexts(String(conflict.server[field]), String(conflict.local[field]));
  await runInTransaction(async () => {
    await dropOpsAndConflict(conflict);
    await applyRemoteDoc(conflict.entity as EntityName, conflict.server as never, { force: true });
    await updateEntity(conflict.entity as 'records', conflict.entityId, { [field]: merged });
  });
}
