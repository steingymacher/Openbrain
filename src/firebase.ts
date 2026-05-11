import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

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
