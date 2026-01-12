
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

/**
 * Safely retrieves environment variables from available namespaces.
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

  // Handle literal "undefined" string from build replacements, null, or undefined
  if (val === undefined || val === null || val === 'undefined') {
    return undefined;
  }
  
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return undefined;
    return trimmed;
  }
  
  return String(val);
};

// Fallback values for demo mode (prevents crash on empty config)
const FALLBACK_CONFIG = {
  apiKey: "demo-api-key",
  authDomain: "demo-project.firebaseapp.com",
  projectId: "demo-project",
  storageBucket: "demo-project.appspot.com",
  messagingSenderId: "00000000000",
  appId: "1:00000000000:web:00000000000000",
  measurementId: "G-00000000"
};

const rawConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID'),
  measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID'),
};

// If critical keys are missing, we consider it a demo/invalid setup
const isDemo = !rawConfig.apiKey || !rawConfig.projectId || !rawConfig.appId;

const firebaseConfig = {
  apiKey: rawConfig.apiKey || FALLBACK_CONFIG.apiKey,
  authDomain: rawConfig.authDomain || FALLBACK_CONFIG.authDomain,
  projectId: rawConfig.projectId || FALLBACK_CONFIG.projectId,
  storageBucket: rawConfig.storageBucket || FALLBACK_CONFIG.storageBucket,
  messagingSenderId: rawConfig.messagingSenderId || FALLBACK_CONFIG.messagingSenderId,
  appId: rawConfig.appId || FALLBACK_CONFIG.appId,
  measurementId: rawConfig.measurementId || FALLBACK_CONFIG.measurementId,
};

if (isDemo && typeof window !== 'undefined') {
  console.warn("⚠️ Firebase configuration is using demo values. Database operations will fail until valid VITE_FIREBASE_* keys are provided.");
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

export let analytics: any = null;

// Only initialize Analytics if not in demo mode. 
// Initializing Analytics with a dummy projectId causes "Installations: Missing App configuration value" error.
if (typeof window !== 'undefined' && !isDemo) {
  isSupported().then(supported => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (e) {
        console.warn("Analytics initialization failed:", e);
      }
    }
  }).catch(e => console.warn("Analytics not supported:", e));
}
