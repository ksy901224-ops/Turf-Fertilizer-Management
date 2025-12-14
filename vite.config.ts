import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 현재 작업 디렉토리에서 환경 변수를 로드합니다.
  // 세 번째 인자를 ''로 설정하면 'VITE_' 접두사가 없는 변수(예: API_KEY)도 모두 로드합니다.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // process.env 객체를 브라우저 환경에서도 사용할 수 있도록 폴리필(polyfill) 합니다.
      // 코드 내에서 process.env.API_KEY를 호출하면, 실제로는 env.VITE_API_KEY 또는 env.API_KEY 값을 반환합니다.
      'process.env': {
        ...env,
        API_KEY: env.VITE_API_KEY || env.API_KEY,
        // Firebase 설정 등 다른 변수들도 안전하게 매핑
        VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY,
        VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN,
        VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID,
        VITE_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET,
        VITE_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        VITE_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID
      }
    }
  };
});