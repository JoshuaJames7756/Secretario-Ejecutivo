/** Enlaces y secretos del Worker. Los secretos se configuran en Cloudflare, nunca en el código. */
export interface Env {
  DB: D1Database;
  /** Clave pública PEM de Clerk (Dashboard > API keys > Show JWT public key). Permite verificar sin red. */
  CLERK_JWT_KEY: string;
  /** Identificador (`sub`) de la única persona autorizada. */
  OWNER_USER_ID: string;
  /** Origen permitido de la app, p. ej. https://secretaria-estaca.<cuenta>.workers.dev (opcional). */
  APP_ORIGIN?: string;
}
