import type { PullResponse, PushResponse } from '../../../shared/contract';
import { AuthError, NetworkError, type Transport } from './engine';

/**
 * Transporte real: HTTPS hacia /api con el token de sesión de Clerk.
 * El token se pide en cada solicitud (dura poco y Clerk lo renueva solo).
 */
export function createHttpTransport(
  getToken: () => Promise<string | null>,
  baseUrl = '',
): Transport {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken().catch(() => null);
    if (!token) throw new AuthError();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      });
    } catch {
      throw new NetworkError();
    }

    if (response.status === 401) throw new AuthError('La sesión caducó. Inicia sesión otra vez.');
    if (response.status === 403) {
      throw new AuthError('Esta cuenta no está autorizada para esta aplicación.', true);
    }
    if (response.status === 503) {
      throw new NetworkError('El servidor aún no está configurado.');
    }
    if (response.status >= 500) throw new NetworkError('El servidor tuvo un problema temporal.');
    if (!response.ok) throw new Error('El servidor rechazó la solicitud.');
    return (await response.json()) as T;
  }

  return {
    push: (request) =>
      call<PushResponse>('/api/sync/push', { method: 'POST', body: JSON.stringify(request) }),
    pull: (since, limit) => call<PullResponse>(`/api/sync/pull?since=${since}&limit=${limit}`),
  };
}
