import { and, asc, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  MAX_DOC_BYTES,
  type PullChange,
  type PullResponse,
  type PushOp,
  type PushRequest,
  type PushResponse,
  type PushResult,
  type SyncDoc,
  type SyncEntity,
  docSchema,
} from '../shared/contract';
import { docs } from './db/schema';

const OPS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

interface DocRow {
  rev: number;
  data: string;
}

function parseDoc(text: string): SyncDoc | undefined {
  try {
    const parsed = docSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function currentSeq(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'seq'")
    .first<{ value: number }>();
  return row?.value ?? 0;
}

/** Comprobaciones que no necesitan la base de datos. Devuelve el motivo si se debe rechazar. */
function validate(op: PushOp): string | undefined {
  if (op.doc.id !== op.entityId) return 'El documento no coincide con su identificador.';
  if (op.doc.rev <= op.expectedRev) return 'La revisión debe ser mayor que la esperada.';
  if (encoder.encode(JSON.stringify(op.doc)).byteLength > MAX_DOC_BYTES) {
    return 'El documento es demasiado grande.';
  }
  return undefined;
}

/**
 * Aplica una operación de forma atómica. La concurrencia optimista vive en SQL: el UPDATE solo
 * ocurre si la revisión del servidor sigue siendo la esperada (`WHERE docs.rev = expectedRev`), de
 * modo que dos envíos simultáneos nunca se pisan. La operación se registra en `ops` solo si el
 * documento cambió realmente.
 *
 * Se usa SQL directo (no el ORM) porque necesitamos `changes()` y un lote transaccional exacto.
 */
async function applyOp(
  db: D1Database,
  op: PushOp,
  deviceId: string,
  now: number,
): Promise<PushResult> {
  const known = await db
    .prepare('SELECT rev FROM ops WHERE op_id = ?')
    .bind(op.opId)
    .first<{ rev: number }>();
  if (known) return { opId: op.opId, status: 'duplicate', serverRev: known.rev };

  const bad = validate(op);
  if (bad) return { opId: op.opId, status: 'rejected', error: bad };

  const data = JSON.stringify(op.doc);
  const [, upsert] = await db.batch([
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('seq', 1)
       ON CONFLICT(key) DO UPDATE SET value = value + 1`,
    ),
    db
      .prepare(
        `INSERT INTO docs (entity, id, rev, deleted_at, data, seq, updated_at, device_id)
         VALUES (?1, ?2, ?3, ?4, ?5, (SELECT value FROM meta WHERE key = 'seq'), ?6, ?7)
         ON CONFLICT(entity, id) DO UPDATE SET
           rev = excluded.rev,
           deleted_at = excluded.deleted_at,
           data = excluded.data,
           seq = excluded.seq,
           updated_at = excluded.updated_at,
           device_id = excluded.device_id
         WHERE docs.rev = ?8`,
      )
      .bind(
        op.entity,
        op.entityId,
        op.doc.rev,
        op.doc.deletedAt ?? null,
        data,
        now,
        deviceId,
        op.expectedRev,
      ),
    db
      .prepare(
        `INSERT INTO ops (op_id, entity, entity_id, rev, applied_at)
         SELECT ?1, ?2, ?3, ?4, ?5 WHERE changes() > 0`,
      )
      .bind(op.opId, op.entity, op.entityId, op.doc.rev, now),
  ]);

  if ((upsert?.meta.changes ?? 0) > 0) {
    return { opId: op.opId, status: 'applied', serverRev: op.doc.rev };
  }

  const server = await db
    .prepare('SELECT rev, data FROM docs WHERE entity = ? AND id = ?')
    .bind(op.entity, op.entityId)
    .first<DocRow>();
  const serverDoc = server ? parseDoc(server.data) : undefined;
  return { opId: op.opId, status: 'conflict', serverRev: server?.rev, serverDoc };
}

/** Procesa un lote en orden. Un conflicto o rechazo no detiene el resto. */
export async function pushOps(
  db: D1Database,
  request: PushRequest,
  now: number = Date.now(),
): Promise<PushResponse> {
  const results: PushResult[] = [];
  for (const op of request.ops) {
    results.push(await applyOp(db, op, request.deviceId, now));
  }
  // Limpieza barata de operaciones antiguas (indexada por applied_at).
  await db
    .prepare('DELETE FROM ops WHERE applied_at < ?')
    .bind(now - OPS_RETENTION_MS)
    .run();
  return { results, cursor: await currentSeq(db) };
}

/** Cambios posteriores a `since`, en orden. Pide uno extra para saber si hay más. */
export async function pullChanges(
  db: D1Database,
  since: number,
  limit: number,
): Promise<PullResponse> {
  const orm = drizzle(db);
  const rows = await orm
    .select()
    .from(docs)
    .where(and(gt(docs.seq, since)))
    .orderBy(asc(docs.seq))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const changes: PullChange[] = [];
  for (const row of page) {
    const doc = parseDoc(row.data);
    if (!doc) continue; // dato corrupto: no se entrega, pero el cursor avanza
    changes.push({
      entity: row.entity as SyncEntity,
      id: row.id,
      rev: row.rev,
      seq: row.seq,
      deviceId: row.deviceId,
      doc,
    });
  }
  const last = page.at(-1);
  return { changes, cursor: last ? last.seq : since, hasMore: rows.length > limit };
}
