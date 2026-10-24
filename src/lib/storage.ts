export interface StorageStatus {
  /** El navegador ofrece la API de almacenamiento. */
  supported: boolean;
  /** true = el navegador no borrará los datos por falta de espacio. null = no se puede saber. */
  persisted: boolean | null;
  usage?: number;
  quota?: number;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: null };
  }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted?.().catch(() => null) ?? Promise.resolve(null),
    navigator.storage.estimate?.().catch(() => undefined) ?? Promise.resolve(undefined),
  ]);
  return {
    supported: true,
    persisted,
    usage: estimate?.usage,
    quota: estimate?.quota,
  };
}

/**
 * Pide al navegador que proteja los datos de la app frente a limpiezas automáticas.
 * Chrome en Android decide según el uso (app instalada, visitas frecuentes); puede responder que no.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'sin datos';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
