
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Fix: Cast process to any to access the cwd() method which is available in the Node.js environment during the Vite build process.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      'process.env': {
        NODE_ENV: JSON.stringify(mode),
        // google-services.json에서 제공된 키 정보 주입
        API_KEY: JSON.stringify('AIzaSyAyXsqhvN3ZqkozeLbNNZvYyInJdGa_i78'),
        VITE_FIREBASE_API_KEY: JSON.stringify('AIzaSyAyXsqhvN3ZqkozeLbNNZvYyInJdGa_i78'),
        VITE_FIREBASE_AUTH_DOMAIN: JSON.stringify('gen-lang-client-0649462111.firebaseapp.com'),
        VITE_FIREBASE_PROJECT_ID: JSON.stringify('gen-lang-client-0649462111'),
        VITE_FIREBASE_STORAGE_BUCKET: JSON.stringify('gen-lang-client-0649462111.firebasestorage.app'),
        VITE_FIREBASE_MESSAGING_SENDER_ID: JSON.stringify('1079144926106'),
        VITE_FIREBASE_APP_ID: JSON.stringify('1:1079144926106:android:f2cce27b0ad8f5a9264823')
      }
    },
    build: {
      sourcemap: false,
      minify: 'terser',
    }
  };
});
