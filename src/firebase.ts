
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

/**
 * Safely retrieves environment variables from available namespaces.
 * Prioritizes import.meta.env (Vite standard) and falls back to process.env.
 */
const getEnvVar = (key: string): string | undefined => {
  try {
    // Check import.meta.env first
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[key];
    }
  } catch (e) {}

  try {
    // Fallback to process.env
    if (typeof process !== 'undefined' && process.env) {
      return (process.env as any)[key];
    }
  } catch (e) {}

  return undefined;
};

const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID'),
  measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID'),
};

// ✅ 앱 초기화 (HMR 오류 방지를 위해 기존 인스턴스 확인)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ✅ Firestore 인스턴스 내보내기
export const db = getFirestore(app);

// ✅ Analytics 인스턴스 내보내기 (SSR 및 미지원 브라우저 대응)
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
