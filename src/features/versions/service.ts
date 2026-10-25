import { db } from '@/db/database';
import { newId } from '@/db/settings';
import type { Id, NoteVersion } from '@/db/types';

/**
 * Historial de versiones de notas. Política (para que no crezca sin control):
 * - Se guarda el texto ANTERIOR cuando se sobrescribe, como mucho una vez cada 5 minutos.
 * - Siempre se guarda si el texto nuevo es mucho más corto (se borró buena parte de la nota).
 * - Se conservan las últimas 20 versiones de cada nota.
 * - Solo es local: no se sincroniza ni entra en el respaldo. Al eliminar definitivamente algo,
 *   también se borran sus versiones.
 */
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_VERSIONS = 20;
const SHRINK_MIN_LENGTH = 40;

export type VersionedEntity = NoteVersion['entity'];

/** Llamar DENTRO de la transacción que guarda el texto nuevo. */
export async function captureVersion(
  entity: VersionedEntity,
  entityId: Id,
  previous: string,
  next: string,
  now = Date.now(),
): Promise<void> {
  if (!previous.trim() || previous === next) return;
  const existing = await db.versions
    .where('[entity+entityId]')
    .equals([entity, entityId])
    .toArray();
  const latest = existing.reduce<NoteVersion | undefined>(
    (a, b) => (!a || b.at > a.at ? b : a),
    undefined,
  );
  if (latest?.content === previous) return;

  const shrank = previous.length >= SHRINK_MIN_LENGTH && next.length < previous.length / 2;
  const due = !latest || now - latest.at >= VERSION_INTERVAL_MS;
  if (!due && !shrank) return;

  await db.versions.add({ id: newId(), entity, entityId, content: previous, at: now });

  const excess = existing.length + 1 - MAX_VERSIONS;
  if (excess > 0) {
    const oldest = [...existing].sort((x, y) => x.at - y.at).slice(0, excess);
    await db.versions.bulkDelete(oldest.map((v) => v.id));
  }
}

/** Versiones guardadas de una nota, la más reciente primero. */
export async function listVersions(entity: VersionedEntity, entityId: Id): Promise<NoteVersion[]> {
  const rows = await db.versions.where('[entity+entityId]').equals([entity, entityId]).toArray();
  return rows.sort((a, b) => b.at - a.at);
}

/** Guarda el texto actual como versión sin esperar el intervalo (p. ej. justo antes de restaurar otra). */
export async function snapshotNow(
  entity: VersionedEntity,
  entityId: Id,
  content: string,
  now = Date.now(),
): Promise<void> {
  if (!content.trim()) return;
  await db.transaction('rw', db.versions, async () => {
    const latest = (await listVersions(entity, entityId))[0];
    if (latest?.content === content) return;
    await db.versions.add({ id: newId(), entity, entityId, content, at: now });
    const rows = await listVersions(entity, entityId);
    if (rows.length > MAX_VERSIONS) {
      await db.versions.bulkDelete(rows.slice(MAX_VERSIONS).map((v) => v.id));
    }
  });
}
