
// Fix: Removed problematic vite/client reference as it's not found in the environment.
// Definitions for ImportMeta and ProcessEnv are provided manually below to satisfy TypeScript.

interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    readonly VITE_API_KEY: string;
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
  }
}
