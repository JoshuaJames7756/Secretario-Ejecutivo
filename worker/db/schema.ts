import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Copia de cada documento sincronizado. `data` es el documento completo en JSON: así el servidor
 * no depende de la estructura de cada entidad y añadir un campo en la app no exige migrar D1.
 * `seq` crece con cada cambio aceptado y permite pedir "todo lo posterior a X".
 */
export const docs = sqliteTable(
  'docs',
  {
    entity: text('entity').notNull(),
    id: text('id').notNull(),
    rev: integer('rev').notNull(),
    deletedAt: integer('deleted_at'),
    data: text('data').notNull(),
    seq: integer('seq').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deviceId: text('device_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entity, t.id] }), index('docs_seq_idx').on(t.seq)],
);

/** Operaciones ya aplicadas: reintentar una no crea duplicados (idempotencia). */
export const ops = sqliteTable(
  'ops',
  {
    opId: text('op_id').primaryKey(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    rev: integer('rev').notNull(),
    appliedAt: integer('applied_at').notNull(),
  },
  (t) => [index('ops_applied_idx').on(t.appliedAt)],
);

/** Contador global de cambios (clave "seq"). */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: integer('value').notNull(),
});
