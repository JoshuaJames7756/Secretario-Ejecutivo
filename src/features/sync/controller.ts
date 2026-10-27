import { liveQuery } from 'dexie';
import { db } from '@/db/database';
import { getDeviceId } from '@/db/settings';
import { AuthError, NetworkError, runSync, type SyncOutcome } from './engine';
import { createHttpTransport } from './http';

/**
 * Conecta el motor con la sesión. Clerk es solo la puerta de entrada: este módulo no sabe nada de
 * Clerk, solo recibe "una forma de pedir el token" cuando hay sesión. Sin sesión (o sin conexión,
 * o con Clerk sin configurar) la aplicación sigue funcionando igual en este dispositivo.
 */

export interface AuthBridge {
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  openSignIn: () => void;
  signOut: () => Promise<void>;
  email?: string;
}

export type AuthState = 'desconocida' | 'sin-sesion' | 'con-sesion' | 'no-autorizada';

export interface ControllerState {
  /** Hay clave de Clerk en esta compilación. Sin ella la sincronización no existe. */
  configured: boolean;
  auth: AuthState;
  running: boolean;
  /** Último error de red o de servidor (se borra al sincronizar bien). */
  error?: string;
  bridge: AuthBridge | null;
}

const PUBLISHABLE_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim();

let state: ControllerState = {
  configured: PUBLISHABLE_KEY.length > 0,
  auth: 'desconocida',
  running: false,
  bridge: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<ControllerState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const getControllerState = (): ControllerState => state;

export function subscribeController(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getPublishableKey = (): string => PUBLISHABLE_KEY;

/** Lo llama el puente de Clerk cuando cambia la sesión. `null` = Clerk no está disponible. */
export function setAuthBridge(bridge: AuthBridge | null): void {
  const auth: AuthState = !bridge
    ? 'desconocida'
    : bridge.isSignedIn
      ? state.auth === 'no-autorizada'
        ? 'no-autorizada'
        : 'con-sesion'
      : 'sin-sesion';
  setState({ bridge, auth });
}

/** Sincroniza ahora. Nunca lanza: el resultado se refleja en el estado. */
export async function triggerSync(): Promise<SyncOutcome | undefined> {
  const { bridge, auth, running } = state;
  if (!state.configured || !bridge || auth !== 'con-sesion' || running) return undefined;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ error: 'Sin conexión. Se sincronizará al volver.' });
    return undefined;
  }
  setState({ running: true });
  try {
    const outcome = await runSync(createHttpTransport(bridge.getToken), await getDeviceId());
    setState({ running: false, error: undefined });
    return outcome;
  } catch (error) {
    if (error instanceof AuthError) {
      setState({
        running: false,
        auth: error.forbidden ? 'no-autorizada' : 'sin-sesion',
        error: error.message,
      });
    } else if (error instanceof NetworkError) {
      setState({ running: false, error: error.message });
    } else {
      setState({
        running: false,
        error: 'No se pudo sincronizar. Tus datos siguen guardados aquí.',
      });
    }
    return undefined;
  }
}

/** Vigila los cambios locales y sincroniza poco después, sin saturar al servidor. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void triggerSync(), ms);
  };

  const subscription = liveQuery(() =>
    db.syncOps.where('status').equals('pendiente').count(),
  ).subscribe({
    next: (pending) => {
      if (pending > 0) later(3000);
    },
    error: () => undefined,
  });

  const onOnline = () => later(500);
  const onVisible = () => {
    if (document.visibilityState === 'visible') later(500);
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(() => void triggerSync(), 60_000);
  later(500);

  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    subscription.unsubscribe();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
