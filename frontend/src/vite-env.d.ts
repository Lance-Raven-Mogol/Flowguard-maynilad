/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin in production, e.g. https://flowguard-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
