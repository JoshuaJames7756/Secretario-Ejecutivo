import { db } from './database';

export const SETTING_KEYS = {
  deviceId: 'deviceId',
  lastBackupAt: 'lastBackupAt',
} as const;

/** Último cambio del servidor que este dispositivo ya recibió. */
export const SYNC_CURSOR_KEY = 'sync.cursor';
/** Momento de la última sincronización completa. */
export const SYNC_LAST_KEY = 'sync.lastAt';

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export function newId(): string {
  return crypto.randomUUID();
}

let cachedDeviceId: string | undefined;

/** Identificador estable de este dispositivo. Se usa para distinguir de dónde viene cada cambio. */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await getSetting<string>(SETTING_KEYS.deviceId);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const created = newId();
  await setSetting(SETTING_KEYS.deviceId, created);
  cachedDeviceId = created;
  return created;
}

/** Solo para pruebas: olvida el identificador en memoria. */
export function resetDeviceIdCache(): void {
  cachedDeviceId = undefined;
}
