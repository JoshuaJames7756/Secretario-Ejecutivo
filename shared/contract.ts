import { z } from 'zod';

/**
 * Contrato entre la aplicación y el servidor de sincronización. Lo comparten ambos lados, así que
 * un cambio aquí rompe la compilación de los dos hasta que se actualicen.
 *
 * Modelo: el servidor guarda una copia de cada documento (entidad + id) con su revisión. Cada envío
 * indica sobre qué revisión del servidor se hizo el cambio (`expectedRev`). Si el servidor ya
 * avanzó, NO se sobrescribe: se devuelve un conflicto con la versión del servidor.
 */

/** Debe coincidir con ENTITY_NAMES de la aplicación (hay una prueba que lo comprueba). */
export const SYNC_ENTITIES = [
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
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const MAX_OPS_PER_PUSH = 25;
export const MAX_DOC_BYTES = 100_000;
export const MAX_BODY_BYTES = 600_000;
export const MAX_PULL_LIMIT = 200;

export const docSchema = z.looseObject({
  id: z.string().min(1).max(200),
  rev: z.number().int().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
});
export type SyncDoc = z.infer<typeof docSchema>;

export const pushOpSchema = z.object({
  opId: z.string().min(1).max(100),
  entity: z.enum(SYNC_ENTITIES),
  entityId: z.string().min(1).max(200),
  op: z.enum(['upsert', 'delete', 'restore']),
  /** Revisión del servidor sobre la que se hizo el cambio. 0 = el servidor no lo conoce. */
  expectedRev: z.number().int().min(0),
  doc: docSchema,
});
export type PushOp = z.infer<typeof pushOpSchema>;

export const pushRequestSchema = z.object({
  deviceId: z.string().min(1).max(100),
  ops: z.array(pushOpSchema).min(1).max(MAX_OPS_PER_PUSH),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export type PushResultStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';

export interface PushResult {
  opId: string;
  status: PushResultStatus;
  /** Revisión que tiene el servidor tras procesar la operación. */
  serverRev?: number;
  /** Solo en conflictos: la versión que hay en el servidor. */
  serverDoc?: SyncDoc;
  /** Solo en rechazos: motivo escrito para personas. */
  error?: string;
}

export interface PushResponse {
  results: PushResult[];
  cursor: number;
}

export const pullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(100),
});

export interface PullChange {
  entity: SyncEntity;
  id: string;
  rev: number;
  seq: number;
  deviceId: string;
  doc: SyncDoc;
}

export interface PullResponse {
  changes: PullChange[];
  /** Último `seq` entregado: se envía como `since` en la siguiente consulta. */
  cursor: number;
  hasMore: boolean;
}
