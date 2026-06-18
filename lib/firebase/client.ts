import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyAdyaVA95hYEbPDfCRwNI0mretcowocGfM',
  authDomain: 'llikebread.firebaseapp.com',
  databaseURL: 'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'llikebread',
  storageBucket: 'llikebread.firebasestorage.app',
  messagingSenderId: '227317366345',
  appId: '1:227317366345:web:472530c2616612899e0998',
};

export const firebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getDatabase(firebaseApp);
