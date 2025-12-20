
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all variables regardless of prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Helper to find the first available value among a list of keys and return it as a JSON string
  const getEnvValue = (keys: string[]) => {
    for (const key of keys) {
      if (process.env[key]) return JSON.stringify(process.env[key]);
      if (env[key]) return JSON.stringify(env[key]);
    }
    return 'undefined'; // Returns the actual 'undefined' token to the code
  };

  const firebaseKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MEASUREMENT_ID'
  ];

  const define: Record<string, string> = {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.API_KEY': getEnvValue(['VITE_API_KEY', 'API_KEY']),
    'import.meta.env.VITE_API_KEY': getEnvValue(['VITE_API_KEY', 'API_KEY']),
  };

  // Map Firebase keys to both namespaces
  firebaseKeys.forEach(key => {
    const val = getEnvValue([key, key.replace('VITE_FIREBASE_', ''), key.replace('VITE_FIREBASE_', 'FIREBASE_')]);
    define[`import.meta.env.${key}`] = val;
    define[`process.env.${key}`] = val;
  });

  return {
    plugins: [react()],
    define,
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
