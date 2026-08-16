import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";

const env = import.meta.env as Record<string, string | undefined>;

/**
 * Firebase web config (publishable — safe in client code).
 * Every value can be overridden with a Netlify environment variable,
 * so you can point the same build at another Firebase project.
 */
export const firebaseConfig = {
  apiKey: env["VITE_FIREBASE_API_KEY"] ?? "AIzaSyB0AOQwMAblWOcw-xYeMvTXwrdm3aoFlC4",
  authDomain: env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "nmct-4d2a9.firebaseapp.com",
  databaseURL: env["VITE_FIREBASE_DATABASE_URL"] ?? "https://nmct-4d2a9-default-rtdb.firebaseio.com",
  projectId: env["VITE_FIREBASE_PROJECT_ID"] ?? "nmct-4d2a9",
  storageBucket: env["VITE_FIREBASE_STORAGE_BUCKET"] ?? "nmct-4d2a9.firebasestorage.app",
  messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "478244762156",
  appId: env["VITE_FIREBASE_APP_ID"] ?? "1:478244762156:web:b9a7f325a363ceac609789",
  measurementId: env["VITE_FIREBASE_MEASUREMENT_ID"] ?? "G-Q1CH7PRMWE",
};

export const DB_URL = firebaseConfig.databaseURL;

let _app: FirebaseApp | null = null;
export function getFbApp(): FirebaseApp {
  if (!_app) _app = getApps()[0] ?? initializeApp(firebaseConfig);
  return _app;
}
export function getDb(): Database {
  return getDatabase(getFbApp());
}
export function getFbAuth(): Auth {
  return getAuth(getFbApp());
}
