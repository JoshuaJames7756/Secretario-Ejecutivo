import { db } from '@/db/database';
import { ENTITY_NAMES, type EntityName } from '@/db/repo';
import { SETTING_KEYS, setSetting } from '@/db/settings';
import { APP_VERSION } from '@/lib/constants';
import { ValidationError } from '@/features/followups/service';
import { PBKDF2_ITERATIONS, decrypt, encrypt, sha256Hex, type KdfParams } from './crypto';

export const BACKUP_FORMAT = 'secretaria-estaca-respaldo';
export const BACKUP_VERSION = 1;
export const MIN_PASSWORD_LENGTH = 10;

type Rows = Record<string, unknown>[];

interface Payload {
  createdAt: number;
  appVersion: string;
  schemaVersion: number;
  counts: Record<string, number>;
  tables: Record<string, Rows>;
}

/** Lo único legible del archivo. Va autenticado: alterarlo hace fallar el descifrado. */
interface Header {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  appVersion: string;
}

interface Envelope extends Header {
  kdf: KdfParams;
  iv: string;
  data: string;
  /** SHA-256 del contenido sin cifrar: permite comprobar que se restauró lo que se exportó. */
  checksum: string;
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export interface BackupSummary {
  createdAt: number;
  appVersion: string;
  counts: Record<string, number>;
  total: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function headerBytes(h: Header): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    JSON.stringify({
      format: h.format,
      version: h.version,
      createdAt: h.createdAt,
      appVersion: h.appVersion,
    }),
  );
}

export function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
}

/** Datos incluidos: todas las tablas de contenido (incluida la papelera). Sin ajustes del dispositivo. */
async function collect(): Promise<Payload> {
  const tables: Record<string, Rows> = {};
  const counts: Record<string, number> = {};
  await db.transaction(
    'r',
    ENTITY_NAMES.map((n) => db.table(n)),
    async () => {
      for (const name of ENTITY_NAMES) {
        const rows = (await db.table(name).toArray()) as Rows;
        tables[name] = rows;
        counts[name] = rows.length;
      }
    },
  );
  return {
    createdAt: Date.now(),
    appVersion: APP_VERSION,
    schemaVersion: db.verno,
    counts,
    tables,
  };
}

function summarize(payload: Payload): BackupSummary {
  const total = Object.values(payload.counts).reduce((sum, n) => sum + n, 0);
  return {
    createdAt: payload.createdAt,
    appVersion: payload.appVersion,
    counts: payload.counts,
    total,
  };
}

/**
 * Genera el respaldo cifrado y lo VERIFICA antes de entregarlo: lo descifra de nuevo y comprueba
 * que el contenido es idéntico. Si algo falla, no se entrega un archivo dudoso.
 */
export async function createBackup(
  password: string,
  options: { iterations?: number } = {},
): Promise<{ text: string; summary: BackupSummary }> {
  checkPassword(password);
  const payload = await collect();
  const plain = encoder.encode(JSON.stringify(payload));
  const checksum = await sha256Hex(plain);

  const header: Header = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: payload.createdAt,
    appVersion: payload.appVersion,
  };
  const sealed = await encrypt(
    plain,
    password,
    headerBytes(header),
    options.iterations ?? PBKDF2_ITERATIONS,
  );
  const envelope: Envelope = { ...header, ...sealed, checksum };
  const text = JSON.stringify(envelope);

  // Verificación: abrir lo que acabamos de generar.
  const reopened = await openBackup(text, password);
  if (reopened.checksum !== checksum || reopened.summary.total !== summarize(payload).total) {
    throw new BackupFormatError('No se pudo verificar el respaldo. No se guardó ningún archivo.');
  }
  return { text, summary: reopened.summary };
}

/** Anota que hubo un respaldo. Se llama cuando la persona confirma que lo guardó. */
export async function markBackupDone(at = Date.now()): Promise<void> {
  await setSetting(SETTING_KEYS.lastBackupAt, at);
}

function parseEnvelope(text: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFormatError('Este archivo no es un respaldo de Secretaría de Estaca.');
  }
  const e = parsed as Partial<Envelope> | null;
  if (!e || e.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('Este archivo no es un respaldo de Secretaría de Estaca.');
  }
  if (typeof e.version !== 'number' || e.version > BACKUP_VERSION) {
    throw new BackupFormatError(
      'Este respaldo es de una versión más nueva. Actualiza la aplicación para abrirlo.',
    );
  }
  if (
    typeof e.createdAt !== 'number' ||
    typeof e.appVersion !== 'string' ||
    typeof e.iv !== 'string' ||
    typeof e.data !== 'string' ||
    typeof e.checksum !== 'string' ||
    !e.kdf ||
    e.kdf.name !== 'PBKDF2-SHA256' ||
    typeof e.kdf.salt !== 'string' ||
    !Number.isInteger(e.kdf.iterations) ||
    e.kdf.iterations < 1 ||
    e.kdf.iterations > 5_000_000
  ) {
    throw new BackupFormatError('El archivo de respaldo está incompleto o dañado.');
  }
  return e as Envelope;
}

function validatePayload(value: unknown): Payload {
  const p = value as Partial<Payload> | null;
  if (!p || typeof p !== 'object' || !p.tables || typeof p.tables !== 'object') {
    throw new BackupFormatError('El contenido del respaldo no es válido.');
  }
  if (typeof p.schemaVersion !== 'number' || p.schemaVersion > db.verno) {
    throw new BackupFormatError(
      'Este respaldo viene de un esquema de datos más nuevo. Actualiza la aplicación.',
    );
  }
  const counts: Record<string, number> = {};
  for (const name of ENTITY_NAMES) {
    const rows = (p.tables as Record<string, unknown>)[name];
    if (!Array.isArray(rows)) {
      throw new BackupFormatError(`Falta la sección «${name}» en el respaldo.`);
    }
    for (const row of rows) {
      const r = row as { id?: unknown; rev?: unknown };
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.rev !== 'number') {
        throw new BackupFormatError(`Hay registros inválidos en «${name}».`);
      }
    }
    counts[name] = rows.length;
  }
  return {
    createdAt: p.createdAt as number,
    appVersion: String(p.appVersion ?? ''),
    schemaVersion: p.schemaVersion,
    counts,
    tables: p.tables as Record<string, Rows>,
  };
}

/** Descifra y valida un respaldo SIN tocar los datos actuales. Sirve para previsualizar. */
export async function openBackup(
  text: string,
  password: string,
): Promise<{ summary: BackupSummary; payload: Payload; checksum: string }> {
  const envelope = parseEnvelope(text);
  const plain = await decrypt(envelope, password, headerBytes(envelope));
  const checksum = await sha256Hex(plain);
  if (checksum !== envelope.checksum) {
    throw new BackupFormatError('El contenido del respaldo no coincide con su verificación.');
  }
  let json: unknown;
  try {
    json = JSON.parse(decoder.decode(plain));
  } catch {
    throw new BackupFormatError('El contenido del respaldo no es válido.');
  }
  const payload = validatePayload(json);
  return { summary: summarize(payload), payload, checksum };
}

/**
 * Restaura REEMPLAZANDO los datos actuales. Todo ocurre en una transacción: si algo falla,
 * los datos actuales quedan intactos. Después se comprueba que cada tabla tiene los registros
 * esperados.
 */
export async function restoreBackup(text: string, password: string): Promise<BackupSummary> {
  const { payload, summary } = await openBackup(text, password);
  const names: EntityName[] = ENTITY_NAMES;

  await db.transaction(
    'rw',
    [...names.map((n) => db.table(n)), db.changeLog, db.syncOps, db.versions],
    async () => {
      for (const name of names) {
        await db.table(name).clear();
        await db.table(name).bulkPut(payload.tables[name] ?? []);
      }
      // El historial de cambios y la cola de sincronización pertenecen a los datos anteriores.
      await db.changeLog.clear();
      await db.syncOps.clear();
      await db.versions.clear();
    },
  );

  for (const name of names) {
    const actual = await db.table(name).count();
    if (actual !== (payload.counts[name] ?? 0)) {
      throw new BackupFormatError(
        `La verificación posterior a la restauración falló en «${name}». Restaura de nuevo.`,
      );
    }
  }
  return summary;
}

export function backupFileName(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `respaldo-secretaria-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.json`;
}
