
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

/**
 * Safely retrieves environment variables from available namespaces.
 * Handles cases where build tools replace missing vars with the string "undefined".
 */
const getEnvVar = (key: string): string | undefined => {
  let val: any = undefined;

  // Try import.meta.env (Vite)
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      val = (import.meta as any).env[key];
    }
  } catch (e) {}

  // Try process.env (Fallback)
  if (val === undefined) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        val = (process.env as any)[key];
      }
    } catch (e) {}
  }

  // Treat literal "undefined" string, null, or whitespace-only strings as undefined
  if (val === 'undefined' || val === null) {
      return undefined;
  }
  
  if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') return undefined;
      return trimmed;
  }

  return val;
};

// Use placeholders to prevent crash if env vars are missing
// This allows the app to render UI even if backend connection will fail
const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY') || "demo-api-key",
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN') || "demo-project.firebaseapp.com",
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID') || "demo-project",
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET') || "demo-project.appspot.com",
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID') || "00000000000",
  appId: getEnvVar('VITE_FIREBASE_APP_ID') || "1:00000000000:web:00000000000000",
  measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID') || "G-00000000",
};

// Check if critical config is missing (using demo values)
// We also treat empty/missing projectId as demo to prevent "Missing App configuration value" errors
const isDemo = firebaseConfig.projectId === "demo-project" || !firebaseConfig.projectId;

if (isDemo && typeof window !== 'undefined') {
  console.warn("⚠️ Firebase configuration is using demo values. Database operations will fail until valid VITE_FIREBASE_* keys are provided.");
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

export let analytics: any = null;
// Only initialize analytics if we have a valid project ID
if (typeof window !== 'undefined' && !isDemo) {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(e => console.warn("Analytics not supported", e));
}
