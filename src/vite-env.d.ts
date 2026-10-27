/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clave pública de Clerk (empieza con pk_). Es pública por diseño; la secreta nunca va aquí. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
