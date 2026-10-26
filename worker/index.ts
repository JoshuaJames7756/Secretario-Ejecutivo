import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { MAX_BODY_BYTES, pullQuerySchema, pushRequestSchema } from '../shared/contract';
import { requireOwner, type AppEnv } from './auth';
import type { Env } from './env';
import { pullChanges, pushOps } from './sync';

export const app = new Hono<AppEnv>();

app.use('/api/*', secureHeaders());

// Sin autenticación: solo confirma que el servidor responde. No revela datos.
app.get('/api/health', (c) => c.json({ ok: true }));

const api = new Hono<AppEnv>();
api.use('*', requireOwner);

api.post(
  '/sync/push',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'La solicitud es demasiado grande.' }, 413),
  }),
  async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON no válido.' }, 400);
    }
    const parsed = pushRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Solicitud no válida.' }, 400);
    return c.json(await pushOps(c.env.DB, parsed.data));
  },
);

api.get('/sync/pull', async (c) => {
  const parsed = pullQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Parámetros no válidos.' }, 400);
  return c.json(await pullChanges(c.env.DB, parsed.data.since, parsed.data.limit));
});

app.route('/api', api);

app.notFound((c) => c.json({ error: 'No encontrado.' }, 404));
app.onError((_err, c) => c.json({ error: 'Error interno.' }, 500));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
