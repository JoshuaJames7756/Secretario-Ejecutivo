# Secretaría de Estaca

Aplicación web progresiva (PWA), privada y funcional sin conexión, para organizar reuniones, agendas,
seguimientos y entrevistas. Especificación completa en el documento `Context` del proyecto.

**Estado:** Fase 1 de 6 (base del proyecto). Solo local, sin servidor ni cuentas.

## Comandos

```bash
npm install
npm run dev          # desarrollo en http://localhost:5173
npm run typecheck    # TypeScript estricto
npm test             # pruebas (datos + interfaz)
npm run lint         # ESLint
npm run format       # Prettier (escribe) / format:check (solo revisa)
npm run check        # lint + formato + pruebas + build: ejecútalo antes de cada commit
npm run build        # typecheck + build de producción en dist/
npm run preview      # sirve dist/ para probar la PWA
npm run deploy:check # build + simulación de despliegue (no publica nada)
npm run deploy       # build + publica en Cloudflare Workers
```

### Probar en el teléfono Android

El service worker y la instalación de la PWA exigen HTTPS, salvo en `localhost`.

1. Conecta el teléfono por USB con la depuración USB activada.
2. En Chrome del computador abre `chrome://inspect/#devices` y activa "Port forwarding" `5173 → localhost:5173`
   (o `4173` si usas `npm run preview`).
3. En el teléfono abre `http://localhost:5173`.

Para uso real diario se publicará en HTTPS (Cloudflare, fase 4 o antes si prefieres).

## Despliegue en Cloudflare Workers (primera vez)

En la Fase 1 solo se publican archivos estáticos (`wrangler.jsonc` → `assets`), sin código de servidor.
No requiere tarjeta: el plan gratuito sirve los recursos estáticos sin consumir la cuota de solicitudes.

1. Crea una cuenta gratuita en <https://dash.cloudflare.com> (solo correo, sin tarjeta).
2. `npx wrangler login` (abre el navegador para autorizar).
3. `npm run deploy:check` para validar, luego `npm run deploy`.
4. Wrangler imprime la dirección `https://secretaria-estaca.<tu-subdominio>.workers.dev`.

**Alternativa recomendada: despliegue automático desde Git** (documentación oficial de Workers Builds).
En el panel: Workers & Pages → Create application → GitHub (o GitLab) → elige el repositorio →
Save and Deploy. Cada `git push` a `main` se publica solo.

- El nombre del Worker en el panel debe ser **exactamente** `secretaria-estaca` (el `name` de
  `wrangler.jsonc`); si no coincide, el build falla.
- Build command: `npm run build`. Deploy command: `npx wrangler deploy` (es el valor por defecto).
- No pude confirmar en la documentación los límites de builds del plan gratuito: revísalos en el panel.

Cabeceras de seguridad y caché: `public/_headers`. La política de contenido (CSP) está en modo
**solo informe** (`Report-Only`) a propósito: obsérvala unos días en la consola del navegador y,
si no hay avisos, cámbiala a `Content-Security-Policy` para que se aplique.

> La app es privada pero la dirección `workers.dev` es pública: cualquiera que la conozca puede abrir
> la interfaz (vacía). Sus datos viven solo en el dispositivo de cada persona. Antes de la Fase 4
> (cuenta y sincronización) hay que protegerla. Candidato: Cloudflare Access. Su plan gratuito está
> orientado a equipos de menos de 50 usuarios, pero **no se pudo confirmar si exige tarjeta**; se
> verifica al activarlo, y si la pide, la alternativa es la autenticación propia (Better Auth) de la Fase 4.

## Servidor de sincronización (Fase 4A)

API en `worker/` (Cloudflare Workers + Hono), datos en D1 (`worker/db/schema.ts`, migraciones en `migrations/`),
contrato compartido con la app en `shared/contract.ts`.

- `POST /api/sync/push`: hasta 25 operaciones. Cada una indica sobre qué revisión del servidor se hizo (`expectedRev`).
  Si el servidor ya avanzó, **no se sobrescribe**: responde `conflict` con la versión del servidor.
  Repetir una operación es seguro (`duplicate`).
- `GET /api/sync/pull?since=N&limit=M`: cambios posteriores al cursor, en orden.
- `GET /api/health`: público, sin datos.
- Seguridad: cada ruta privada verifica el token de Clerk (firma, caducidad, origen) y exige que `sub` sea `OWNER_USER_ID`.
  Sin configuración, el servidor responde 503 (cierra, no abre).

### Puesta en marcha (una sola vez)

1. Crear la base: `npx wrangler d1 create secretaria-estaca` y copiar el `database_id` en `wrangler.jsonc`.
2. Aplicar migraciones: `npm run db:migrate:remote` (en local: `npm run db:migrate:local`).
3. En Clerk: crear la aplicación, activar solo correo y contraseña o enlace por correo, y copiar la clave pública JWT.
4. Secretos del Worker (Cloudflare, Settings, Variables and Secrets): `CLERK_JWT_KEY` (la clave pública PEM),
   `OWNER_USER_ID` (tu `sub` de Clerk, se ve en Users) y opcionalmente `APP_ORIGIN`.
5. Desarrollo: `npm run dev:api` en una terminal y `npm run dev` en otra (Vite envía `/api` al Worker local).

Si cambias `worker/db/schema.ts`: `npm run db:generate` crea una migración nueva. Nunca se edita una ya aplicada.

### Límites del plan gratuito a vigilar

Workers: 100 000 solicitudes por día y 10 ms de CPU por solicitud. D1: 5 millones de filas leídas y 100 000 escritas por día.
Con una sola persona sobra; el diseño usa lotes pequeños y solo `/api/*` ejecuta el Worker.

## Sincronización en la app (Fase 4B)

Pantalla `/sincronizacion` (también desde el indicador de estado de la barra superior y Configuración).

- Lo local manda: todo se guarda primero en este dispositivo y la app funciona igual sin sesión ni conexión.
- Con sesión de Clerk, los cambios se envían en lotes pequeños y se reciben los de otros dispositivos.
- Nunca se pisa nada en silencio. Si el mismo elemento cambió en dos dispositivos, aparece como **conflicto** con los dos
  lados a la vista y tres opciones: conservar la de este dispositivo, usar la del servidor (tu texto queda en
  «Versiones anteriores») o conservar ambas (solo notas de texto).
- Los archivos adjuntos todavía no se sincronizan; se quedan solo en este dispositivo.
- Tras restaurar un respaldo, todo se vuelve a ofrecer al servidor y cualquier diferencia se muestra como conflicto.

### Activarla (una sola vez)

1. En Clerk copia la **Publishable key** (`pk_...`, pública por diseño).
2. Cloudflare, Worker `schedule`, Settings, **Builds**, Variables and secrets: añade `VITE_CLERK_PUBLISHABLE_KEY`
   (esta va en Builds porque se incorpora al compilar; los secretos `CLERK_JWT_KEY` y `OWNER_USER_ID` van en
   Runtime). En local usa `.env.local` (ver `.env.example`).
3. Sube los cambios; al terminar el build, abre la app y entra a Sincronización, Iniciar sesión.
4. Regístrate con tu correo. Copia tu `user_...` de Clerk, Users, y ponlo en el secreto `OWNER_USER_ID` si aún no lo hiciste.

Sin la clave, la app sigue funcionando y la pantalla lo explica.

## Estructura

```text
src/
  db/          Dexie (IndexedDB): esquema versionado, tipos, repo.ts (guardado seguro)
  components/  ui/ (botón), layout/ (barra lateral, navegación inferior), shared/ (página, tarjetas)
  hooks/       tema, estado del almacenamiento, actualizaciones de la PWA
  lib/         navegación, utilidades, almacenamiento
  pages/       Inicio, Configuración, Más y las áreas de fases siguientes
tests/         Vitest + Testing Library + fake-indexeddb
```

## Decisiones clave (y por qué)

- **La base local es la fuente de verdad.** Escribir una nota nunca depende de internet.
- **`repo.ts` es la única puerta de escritura.** Cada cambio guarda, en una sola transacción: el registro,
  una entrada de historial (sin contenido) y una operación pendiente de sincronización. Si algo falla,
  no queda nada a medias.
- **Idempotencia:** crear dos veces con el mismo `id` no duplica nada.
- **Conflictos:** `updateEntity` acepta `expectedRev` y falla con `RevisionConflictError` en vez de
  sobrescribir en silencio. Para un mismo registro, el orden de aplicación de operaciones lo da `rev`.
- **Papelera:** borrado lógico, recuperable 30 días. La purga definitiva es una acción explícita.
- **Actualizaciones de la PWA con aviso**, nunca automáticas (no cambiar la app en plena reunión).
- **Sin fuentes ni recursos externos:** todo se sirve desde la propia app (privacidad y modo sin conexión).
- **Contraste verificado** (AA) en tema claro y oscuro; respeta "reducir movimiento".

## Dependencias: dos avisos conocidos

- **TypeScript está fijado en 6.0.x** porque `typescript-eslint` (8.72) declara compatibilidad con
  TypeScript `< 6.1`. Con TypeScript 7 la instalación falla. Súbelo solo cuando `typescript-eslint`
  lo soporte (revisa `npm view typescript-eslint peerDependencies`).
- **`npm audit` reporta 3 avisos en `undici`**, dependencia interna de `wrangler`. Es una herramienta de
  desarrollo: no entra en el paquete que se publica ni se ejecuta en el navegador. La corrección que
  propone npm (`--force`) instalaría un Wrangler más antiguo, así que no se aplica. Se resolverá al
  actualizar Wrangler cuando publique una versión con `undici` corregido.

## Estado de la Fase 2 (funcionalidad completa)

Hecho: catálogo de plantillas (datos del Manual marcados "por verificar"), reuniones con agenda
propia copiada de la plantilla, modo reunión con notas autoguardadas, registros (propuesta,
decisión, asignación, asunto pendiente, nota informativa), Seguimientos e Inicio conectado.

Respaldo cifrado (Configuración): PBKDF2-SHA256 (600 000 iteraciones) + AES-256-GCM, el
encabezado va autenticado, se verifica al crear (se vuelve a abrir y se compara) y la restauración
es transaccional con comprobación posterior. Si se pierde la contraseña no hay recuperación.
Los adjuntos (Fase 5) aún no llevan archivos, solo sus metadatos.

Calendario mensual (semana desde el lunes) con las reuniones de cada día y creación de reunión
con la fecha elegida. Sugerencias de agenda: los seguimientos abiertos se ofrecen en la ficha de
la reunión; agregar o "ahora no", nunca automático.

Falta para cerrar la Fase 2: pruebas en navegador real (Playwright) y revisión visual en Android.

## Entrevistas (Fase 3)

Solo coordinación administrativa: no hay campo para el motivo ni el contenido. Regla dura: nunca
dos citas a la vez con el mismo líder (se comprueba dentro de la misma transacción que guarda la
cita). Salir de la disponibilidad configurada avisa y solo se permite con confirmación expresa.
El mensaje de WhatsApp es un borrador editable que se copia; la aplicación no envía nada.

## Fase 5 local: recuperación, búsqueda e informes

- **Papelera** (`/papelera`): 30 días para recuperar; eliminar definitivamente es expreso y borra
  también las versiones de esa nota.
- **Historial y búsqueda**: sin distinguir tildes ni mayúsculas, con filtro por tipo y fechas.
- **Informes**: por reunión; eliges secciones y puntos; lo privado queda fuera por defecto; copiar
  (WhatsApp o texto) o imprimir/guardar como PDF desde el navegador.
- **Versiones de notas** (esquema local v2): texto anterior cada 5 minutos como máximo, y siempre
  que se borra buena parte de la nota; últimas 20 por nota. Solo local: no entran en el respaldo
  cifrado ni en la futura sincronización.
- **Fase 4 (cuenta y sincronización) pospuesta**: Workers Free da 10 ms de CPU por solicitud y el
  hash de contraseñas puede superarlo. Hay que probarlo con un despliegue real antes de decidir
  entre Passkeys, contraseña o plan de pago.

## Límites conocidos

- Sin pruebas en navegador real (Playwright) ni revisión visual en Android todavía; las pruebas
  actuales usan jsdom.
- Historial muestra su propósito y la fase en que llegan; no simulan datos.
- Los datos del Manual General del catálogo deben ser verificados por una persona antes de confiar en ellos.
- Eliminar una reunión no elimina sus seguimientos (se gestionan por separado).
- Almacenamiento persistente: Chrome decide si lo concede. La pantalla de Configuración muestra el estado real.

## Fases

1. Base del proyecto (hecha).
2. Ciclo central local (funcional, falta verificación en navegador real).
3. Entrevistas y disponibilidad (funcional: barrios con consejero asignado, disponibilidad semanal y por fecha, solicitudes, citas sin choques, lista de espera, mensaje para copiar a WhatsApp).
4. Autenticación y sincronización (Workers, Hono, D1, Drizzle, Better Auth).
5. Adjuntos, papelera visible, versiones e informes.
6. Validación final.
