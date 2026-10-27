import { db } from '@/db/database';
import { applyRemoteDoc, syncKey, type EntityName, type TableEntities } from '@/db/repo';
import { SYNC_CURSOR_KEY, SYNC_LAST_KEY, getSetting, setSetting } from '@/db/settings';
import type { Id, SyncOperation } from '@/db/types';
import {
  MAX_DOC_BYTES,
  MAX_OPS_PER_PUSH,
  SYNC_ENTITIES,
  type PullResponse,
  type PushOp,
  type PushRequest,
  type PushResponse,
  type SyncDoc,
} from '../../../shared/contract';

/**
 * Motor de sincronización. Reglas que no se negocian:
 * - Lo local siempre manda en este dispositivo: nada se borra ni se reemplaza por algo del servidor
 *   si hay cambios sin enviar (se detecta el conflicto y lo decide la persona).
 * - El envío nunca pisa: indica sobre qué revisión del servidor se hizo el cambio.
 * - Cada operación es idempotente: reintentar tras un corte es seguro.
 * - Los adjuntos (archivos) todavía no se sincronizan: quedan solo en este dispositivo.
 */

export interface Transport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(since: number, limit: number): Promise<PullResponse>;
}

/** Sin conexión o fallo temporal del servidor. Se reintenta más tarde. */
export class NetworkError extends Error {
  constructor(message = 'No hay conexión con el servidor.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Falta iniciar sesión o la cuenta no está autorizada. */
export class AuthError extends Error {
  constructor(
    message = 'Hay que iniciar sesión para sincronizar.',
    readonly forbidden = false,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Solo los datos de negocio de texto se sincronizan. */
export const LOCAL_ONLY_ENTITIES: readonly string[] = ['attachments'];

const PAGE_SIZE = 100;
const MAX_PULL_PAGES = 50;
/** Margen bajo el límite de 600 KB del servidor por solicitud. */
const MAX_BATCH_BYTES = 400_000;
const encoder = new TextEncoder();

export interface SyncOutcome {
  sent: number;
  received: number;
  conflicts: number;
  failed: number;
}

/** Campos que no cuentan al decidir si dos versiones dicen lo mismo. */
const META_FIELDS = new Set(['rev', 'updatedAt']);

export function sameContent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (META_FIELDS.has(key)) continue;
    if (JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null)) return false;
  }
  return true;
}

/** Copia del documento lista para enviar: sin binarios ni valores que JSON no puede llevar. */
function toWireDoc(entity: Record<string, unknown>): SyncDoc {
  const { blob: _blob, ...rest } = entity;
  return JSON.parse(JSON.stringify(rest)) as SyncDoc;
}

function isKnownEntity(name: string): name is EntityName {
  return (SYNC_ENTITIES as readonly string[]).includes(name);
}

async function finishOps(ids: Id[]): Promise<void> {
  if (ids.length) await db.syncOps.bulkDelete(ids);
}

interface Candidate {
  op: SyncOperation;
  push: PushOp;
}

/** Elige, por documento, la operación más reciente: ella lleva la versión actual completa. */
async function collectCandidates(outcome: SyncOutcome): Promise<Candidate[]> {
  // Una operación "enviando" que quedó a medias (cierre de la app) se vuelve a intentar.
  await db.syncOps.where('status').equals('enviando').modify({ status: 'pendiente' });

  const pending = await db.syncOps.where('status').equals('pendiente').toArray();
  const conflictIds = new Set((await db.syncConflicts.toArray()).map((c) => c.id));

  const latest = new Map<string, SyncOperation>();
  const superseded: Id[] = [];
  for (const op of pending.sort((a, b) => a.createdAt - b.createdAt || a.rev - b.rev)) {
    const key = syncKey(op.entity, op.entityId);
    const previous = latest.get(key);
    if (previous) superseded.push(previous.id);
    latest.set(key, op);
  }
  await finishOps(superseded);

  const candidates: Candidate[] = [];
  for (const [key, op] of latest) {
    if (conflictIds.has(key)) continue; // espera la decisión de la persona
    if (LOCAL_ONLY_ENTITIES.includes(op.entity) || !isKnownEntity(op.entity)) {
      await finishOps([op.id]);
      continue;
    }
    const entity = (await db.table(op.entity).get(op.entityId)) as
      (TableEntities[EntityName] & Record<string, unknown>) | undefined;
    if (!entity) {
      await finishOps([op.id]); // se eliminó definitivamente: no hay nada que enviar
      continue;
    }
    const expectedRev = (await db.serverRevs.get(key))?.rev ?? 0;
    if (entity.rev <= expectedRev) {
      await finishOps([op.id]); // el servidor ya tiene esta versión
      continue;
    }
    const doc = toWireDoc(entity);
    if (encoder.encode(JSON.stringify(doc)).byteLength > MAX_DOC_BYTES) {
      await db.syncOps.update(op.id, {
        status: 'error',
        lastError: 'Es demasiado grande para sincronizarse.',
      });
      outcome.failed += 1;
      continue;
    }
    candidates.push({
      op,
      push: { opId: op.id, entity: op.entity, entityId: op.entityId, op: op.op, expectedRev, doc },
    });
  }
  return candidates;
}

function batches(items: Candidate[]): Candidate[][] {
  const out: Candidate[][] = [];
  let current: Candidate[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = encoder.encode(JSON.stringify(item.push)).byteLength;
    if (
      current.length >= MAX_OPS_PER_PUSH ||
      (current.length > 0 && bytes + size > MAX_BATCH_BYTES)
    ) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length) out.push(current);
  return out;
}

async function handleResult(
  candidate: Candidate,
  result: PushResponse['results'][number],
  outcome: SyncOutcome,
): Promise<void> {
  const { op, push } = candidate;
  const key = syncKey(op.entity, op.entityId);

  if (result.status === 'applied' || result.status === 'duplicate') {
    const rev = result.serverRev ?? push.doc.rev;
    const known = (await db.serverRevs.get(key))?.rev ?? 0;
    await db.serverRevs.put({ key, rev: Math.max(known, rev) });
    await finishOps([op.id]);
    outcome.sent += 1;
    return;
  }

  if (result.status === 'conflict' && result.serverDoc) {
    const server = result.serverDoc as Record<string, unknown>;
    const local = (await db.table(op.entity).get(op.entityId)) as
      Record<string, unknown> | undefined;
    // Mismo contenido en los dos lados (p. ej. la misma edición hecha en dos dispositivos):
    // no hay nada que decidir. Se adopta la revisión del servidor sin perder nada.
    if (local && sameContent(toWireDoc(local), server)) {
      await applyRemoteDoc(op.entity as EntityName, server as never, { force: true });
      await finishOps([op.id]);
      return;
    }
    await db.transaction('rw', db.syncOps, db.syncConflicts, async () => {
      await db.syncOps.update(op.id, { status: 'conflicto' });
      await db.syncConflicts.put({
        id: key,
        entity: op.entity,
        entityId: op.entityId,
        local: local ? toWireDoc(local) : {},
        server,
        detectedAt: Date.now(),
      });
    });
    outcome.conflicts += 1;
    return;
  }

  await db.syncOps.update(op.id, {
    status: 'error',
    attempts: op.attempts + 1,
    lastError: result.error ?? 'El servidor no aceptó este cambio.',
  });
  outcome.failed += 1;
}

async function pushPhase(transport: Transport, deviceId: string, outcome: SyncOutcome) {
  const candidates = await collectCandidates(outcome);
  for (const batch of batches(candidates)) {
    await db.syncOps.bulkUpdate(
      batch.map((c) => ({ key: c.op.id, changes: { status: 'enviando' } })),
    );
    let response: PushResponse;
    try {
      response = await transport.push({ deviceId, ops: batch.map((c) => c.push) });
    } catch (error) {
      // Nada se perdió: vuelven a pendientes para el próximo intento.
      await db.syncOps.bulkUpdate(
        batch.map((c) => ({
          key: c.op.id,
          changes: { status: 'pendiente' as const, attempts: c.op.attempts + 1 },
        })),
      );
      throw error;
    }
    const byId = new Map(response.results.map((r) => [r.opId, r]));
    for (const candidate of batch) {
      const result = byId.get(candidate.op.id);
      if (!result) {
        await db.syncOps.update(candidate.op.id, { status: 'pendiente' });
        continue;
      }
      await handleResult(candidate, result, outcome);
    }
  }
}

async function pullPhase(transport: Transport, outcome: SyncOutcome) {
  let cursor = (await getSetting<number>(SYNC_CURSOR_KEY)) ?? 0;
  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const response = await transport.pull(cursor, PAGE_SIZE);
    for (const change of response.changes) {
      if (LOCAL_ONLY_ENTITIES.includes(change.entity) || !isKnownEntity(change.entity)) continue;
      const result = await applyRemoteDoc(change.entity, change.doc as never);
      if (result === 'aplicado') outcome.received += 1;
    }
    cursor = response.cursor;
    await setSetting(SYNC_CURSOR_KEY, cursor);
    if (!response.hasMore) break;
  }
}

let running: Promise<SyncOutcome> | undefined;

/** Sincroniza ahora. Si ya hay una en curso, devuelve esa misma (nunca dos a la vez). */
export function runSync(transport: Transport, deviceId: string): Promise<SyncOutcome> {
  if (running) return running;
  const job = (async () => {
    const outcome: SyncOutcome = { sent: 0, received: 0, conflicts: 0, failed: 0 };
    await pushPhase(transport, deviceId, outcome);
    await pullPhase(transport, outcome);
    await setSetting(SYNC_LAST_KEY, Date.now());
    return outcome;
  })();
  running = job.finally(() => {
    running = undefined;
  });
  return running;
}

/** Vuelve a intentar lo que el servidor rechazó. */
export async function retryFailed(): Promise<number> {
  return db.syncOps.where('status').equals('error').modify({ status: 'pendiente', attempts: 0 });
}
