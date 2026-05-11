import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import firebaseConfigFromJson from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigFromJson.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigFromJson.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigFromJson.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigFromJson.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigFromJson.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigFromJson.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigFromJson.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with long polling to bypass potential network restrictions
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Connectivity Test as per Guidelines
async function testConnection() {
  try {
    // Try to fetch a dummy doc from server to verify connection
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test successful.");
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.error("Firebase connection error: The client appears to be offline or the backend is unreachable. Please check your Firebase configuration and network settings.");
    } else {
      // Ignore other errors like 'permission-denied' during connection test
      console.log("Firestore reachability confirmed (error was not connectivity related).");
    }
  }
}

testConnection();
