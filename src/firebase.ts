
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDCOZlgZfN4XxOmGmDdTkOO5oRzziJpxv4",
  authDomain: "gen-lang-client-0649462111.firebaseapp.com",
  projectId: "gen-lang-client-0649462111",
  storageBucket: "gen-lang-client-0649462111.firebasestorage.app",
  messagingSenderId: "1079144926106",
  appId: "1:1079144926106:web:c4eb20f50cc705b3264823",
  measurementId: "G-ZYHV8PLPP0"
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
