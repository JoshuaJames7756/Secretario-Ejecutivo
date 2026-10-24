import type { Table } from 'dexie';
import { db } from './database';
import { getDeviceId, newId } from './settings';
import type {
  AgendaItem,
  Attachment,
  BaseEntity,
  ChangeOp,
  FollowUp,
  Id,
  InterviewAppointment,
  InterviewRequest,
  LeaderAvailability,
  MeetingOccurrence,
  MeetingRecord,
  MeetingTemplate,
  Organization,
} from './types';

/** Tablas de negocio: todas llevan `rev`, borrado lógico, historial y cola de sincronización. */
export interface TableEntities {
  templates: MeetingTemplate;
  meetings: MeetingOccurrence;
  agendaItems: AgendaItem;
  records: MeetingRecord;
  followUps: FollowUp;
  organizations: Organization;
  leaderAvailability: LeaderAvailability;
  interviewRequests: InterviewRequest;
  interviewAppointments: InterviewAppointment;
  attachments: Attachment;
}

export type EntityName = keyof TableEntities;

export const ENTITY_NAMES: EntityName[] = [
  'templates',
  'meetings',
  'agendaItems',
  'records',
  'followUps',
  'organizations',
  'leaderAvailability',
  'interviewRequests',
  'interviewAppointments',
  'attachments',
];

/** Los registros eliminados se pueden recuperar durante 30 días. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/* ---------- Errores con mensaje comprensible para la interfaz ---------- */

/** No se pudo guardar en este dispositivo. La interfaz debe avisar siempre. */
export class LocalSaveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LocalSaveError';
  }
}

export class RecordNotFoundError extends Error {
  constructor(entity: string, id: Id) {
    super(`No existe el registro ${id} en ${entity}.`);
    this.name = 'RecordNotFoundError';
  }
}

/** Otro cambio (p. ej. de otro dispositivo) modificó el registro antes que este. */
export class RevisionConflictError extends Error {
  constructor(
    public readonly expectedRev: number,
    public readonly actualRev: number,
  ) {
    super(`El registro cambió (revisión ${actualRev}, se esperaba ${expectedRev}).`);
    this.name = 'RevisionConflictError';
  }
}

export class RecoveryWindowExpiredError extends Error {
  constructor() {
    super('Pasaron más de 30 días desde la eliminación: ya no se puede recuperar.');
    this.name = 'RecoveryWindowExpiredError';
  }
}

const DOMAIN_ERRORS = [
  RecordNotFoundError,
  RevisionConflictError,
  RecoveryWindowExpiredError,
  LocalSaveError,
];

function describeStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return 'No hay espacio disponible en este dispositivo. Libera espacio o genera un respaldo.';
  }
  if (name === 'InvalidStateError' || name === 'DatabaseClosedError') {
    return 'La base de datos local no está disponible. Cierra otras pestañas de la app y recarga.';
  }
  return 'No se pudo guardar en este dispositivo. Tu cambio no se registró.';
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (DOMAIN_ERRORS.some((E) => error instanceof E)) throw error;
    throw new LocalSaveError(describeStorageError(error), { cause: error });
  }
}

/* ---------- Utilidades ---------- */

function table<K extends EntityName>(name: K): Table<TableEntities[K], string> {
  return db.table(name) as unknown as Table<TableEntities[K], string>;
}

type NewEntity<T extends BaseEntity> = Omit<T, keyof BaseEntity> & { id?: Id };
type Patch<T extends BaseEntity> = Partial<Omit<T, keyof BaseEntity>>;

/** Registra el cambio en el historial y en la cola de sincronización. Va dentro de la misma transacción. */
async function track(
  entity: EntityName,
  entityId: Id,
  op: ChangeOp,
  rev: number,
  at: number,
  deviceId: Id,
): Promise<void> {
  await db.changeLog.add({ id: newId(), entity, entityId, op, rev, at });
  if (op === 'purge') return; // La purga es mantenimiento local, no se sincroniza.
  await db.syncOps.add({
    id: newId(),
    entity,
    entityId,
    op: op === 'create' || op === 'update' ? 'upsert' : op,
    rev,
    deviceId,
    status: 'pendiente',
    attempts: 0,
    createdAt: at,
  });
}

export function isActive(entity: BaseEntity): boolean {
  return entity.deletedAt === undefined;
}

export function isRecoverable(entity: BaseEntity, now = Date.now()): boolean {
  return entity.deletedAt !== undefined && now - entity.deletedAt < TRASH_RETENTION_MS;
}

/* ---------- Operaciones ---------- */

/**
 * Crea un registro. El registro, su historial y su operación de sincronización se guardan
 * en una sola transacción: o se guardan los tres o ninguno.
 * Es idempotente por `id`: repetirla con el mismo id devuelve el registro existente.
 */
export async function createEntity<K extends EntityName>(
  name: K,
  data: NewEntity<TableEntities[K]>,
): Promise<TableEntities[K]> {
  const deviceId = await getDeviceId();
  return guard(() =>
    db.transaction('rw', db.table(name), db.changeLog, db.syncOps, async () => {
      const t = table(name);
      if (data.id) {
        const existing = await t.get(data.id);
        if (existing) return existing;
      }
      const at = Date.now();
      const entity = {
        ...data,
        id: data.id ?? newId(),
        createdAt: at,
        updatedAt: at,
        rev: 1,
      } as unknown as TableEntities[K];
      await t.add(entity);
      await track(name, entity.id, 'create', 1, at, deviceId);
      return entity;
    }),
  );
}

/**
 * Modifica un registro activo. Con `expectedRev` falla si el registro cambió desde que se leyó,
 * para no pisar cambios sin avisar.
 */
export async function updateEntity<K extends EntityName>(
  name: K,
  id: Id,
  patch: Patch<TableEntities[K]>,
  options: { expectedRev?: number } = {},
): Promise<TableEntities[K]> {
  const deviceId = await getDeviceId();
  return guard(() =>
    db.transaction('rw', db.table(name), db.changeLog, db.syncOps, async () => {
      const t = table(name);
      const current = await t.get(id);
      if (!current || !isActive(current)) throw new RecordNotFoundError(name, id);
      if (options.expectedRev !== undefined && options.expectedRev !== current.rev) {
        throw new RevisionConflictError(options.expectedRev, current.rev);
      }
      const at = Date.now();
      const next = { ...current, ...patch, updatedAt: at, rev: current.rev + 1 };
      await t.put(next);
      await track(name, id, 'update', next.rev, at, deviceId);
      return next;
    }),
  );
}

/** Eliminación lógica: el registro sigue en la base y se puede restaurar durante 30 días. */
export async function softDeleteEntity<K extends EntityName>(
  name: K,
  id: Id,
): Promise<TableEntities[K]> {
  const deviceId = await getDeviceId();
  return guard(() =>
    db.transaction('rw', db.table(name), db.changeLog, db.syncOps, async () => {
      const t = table(name);
      const current = await t.get(id);
      if (!current || !isActive(current)) throw new RecordNotFoundError(name, id);
      const at = Date.now();
      const next = { ...current, deletedAt: at, updatedAt: at, rev: current.rev + 1 };
      await t.put(next);
      await track(name, id, 'delete', next.rev, at, deviceId);
      return next;
    }),
  );
}

export async function restoreEntity<K extends EntityName>(
  name: K,
  id: Id,
  now = Date.now(),
): Promise<TableEntities[K]> {
  const deviceId = await getDeviceId();
  return guard(() =>
    db.transaction('rw', db.table(name), db.changeLog, db.syncOps, async () => {
      const t = table(name);
      const current = await t.get(id);
      if (!current) throw new RecordNotFoundError(name, id);
      if (isActive(current)) return current;
      if (!isRecoverable(current, now)) throw new RecoveryWindowExpiredError();
      const { deletedAt: _removed, ...rest } = current;
      const next = { ...rest, updatedAt: now, rev: current.rev + 1 } as typeof current;
      await t.put(next);
      await track(name, id, 'restore', next.rev, now, deviceId);
      return next;
    }),
  );
}

/**
 * Elimina de forma definitiva lo que lleva más de 30 días en la papelera.
 * Es una acción explícita: no se ejecuta sola en cada arranque.
 */
export async function purgeExpired(now = Date.now()): Promise<number> {
  const deviceId = await getDeviceId();
  let purged = 0;
  for (const name of ENTITY_NAMES) {
    await guard(() =>
      db.transaction('rw', db.table(name), db.changeLog, db.syncOps, async () => {
        const expired = await table(name)
          .filter((e) => e.deletedAt !== undefined && now - e.deletedAt >= TRASH_RETENTION_MS)
          .toArray();
        for (const entity of expired) {
          await table(name).delete(entity.id);
          await track(name, entity.id, 'purge', entity.rev, now, deviceId);
          purged += 1;
        }
      }),
    );
  }
  return purged;
}
