
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Helper to safely access env vars in Vite/Vercel environment
// Cast import.meta to any to avoid "Property 'env' does not exist on type 'ImportMeta'" TS error
const getEnv = (key: string) => {
  const metaEnv = (import.meta as any).env;
  return metaEnv?.[key] || (process.env as any)?.[key];
};

// Firebase configuration using safe env access
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID'),
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (optional, requires browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { analytics };
export const db = getFirestore(app);
