import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEXpWfvk49ZbiAzu6WHLrcYQHRTNMrvA8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0606607898.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0606607898",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0606607898.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "995346735536",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:995346735536:web:619b69c3b8f86883e7f675",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-jvsintegracaocon-8a9396ed-d888-44a9-9726-a84cdac26cd3");
export const auth = getAuth(app);

// Use local emulators in development if needed, but here we just use the real cloud project
