
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Helper to find the first available value among a list of keys
  const getEnvValue = (keys: string[]) => {
    // 1. Check system environment variables (highest priority for Vercel secrets)
    for (const key of keys) {
      if (process.env[key]) return JSON.stringify(process.env[key]);
    }
    // 2. Check variables loaded from .env files
    for (const key of keys) {
      if (env[key]) return JSON.stringify(env[key]);
    }
    return JSON.stringify("");
  };

  return {
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.API_KEY': getEnvValue(['VITE_API_KEY', 'API_KEY']),
      
      // Explicitly define these for import.meta.env to ensure static replacement in the browser.
      // This maps various possible environment variable names to the ones expected by the app.
      'import.meta.env.VITE_FIREBASE_API_KEY': getEnvValue(['VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY', 'API_KEY']),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': getEnvValue(['VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN', 'AUTH_DOMAIN']),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': getEnvValue(['VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID', 'PROJECT_ID', 'VITE_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT']),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': getEnvValue(['VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET', 'STORAGE_BUCKET']),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': getEnvValue(['VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID', 'MESSAGING_SENDER_ID']),
      'import.meta.env.VITE_FIREBASE_APP_ID': getEnvValue(['VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID', 'APP_ID']),
      'import.meta.env.VITE_FIREBASE_MEASUREMENT_ID': getEnvValue(['VITE_FIREBASE_MEASUREMENT_ID', 'FIREBASE_MEASUREMENT_ID', 'MEASUREMENT_ID']),
    },
    build: {
      sourcemap: false,
      minify: 'terser',
      outDir: 'dist'
    },
    server: {
      port: 3000
    }
  };
});
