import { verifyToken } from '@clerk/backend';
import { createMiddleware } from 'hono/factory';
import type { Env } from './env';

export type AppEnv = { Bindings: Env; Variables: { userId: string } };

/**
 * Zero-Trust: el navegador solo presenta un token. El servidor lo verifica (firma, caducidad,
 * origen) y además exige que sea la persona dueña de la app. Un usuario válido de Clerk que no sea
 * el dueño recibe 403: así no depende de que el registro público esté cerrado en Clerk.
 * Los mensajes de error no revelan el motivo exacto.
 */
export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return c.json({ error: 'No autenticado.' }, 401);

  if (!c.env.CLERK_JWT_KEY || !c.env.OWNER_USER_ID) {
    // Mal configurado: mejor cerrar todo que dejar abierto.
    return c.json({ error: 'Servidor sin configurar.' }, 503);
  }

  let sub: string | undefined;
  try {
    const payload = await verifyToken(token, {
      jwtKey: c.env.CLERK_JWT_KEY,
      authorizedParties: c.env.APP_ORIGIN ? [c.env.APP_ORIGIN] : undefined,
    });
    sub = payload.sub;
  } catch {
    return c.json({ error: 'Sesión no válida o caducada.' }, 401);
  }

  if (!sub || sub !== c.env.OWNER_USER_ID) {
    return c.json({ error: 'No autorizado.' }, 403);
  }
  c.set('userId', sub);
  await next();
});
