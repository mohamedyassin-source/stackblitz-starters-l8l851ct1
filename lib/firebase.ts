// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 🛑 استبدل البلوك ده بالمفاتيح بتاعتك من موقع فايربيز 🛑
const firebaseConfig = {
  apiKey: "AIzaSyBIX0LyYvcZtHaRexEGzaIu2lMmx3pplVQ",
  authDomain: "almarasem-hr-cr2026.firebaseapp.com",
  projectId: "almarasem-hr-cr2026",
  storageBucket: "almarasem-hr-cr2026.firebasestorage.app",
  messagingSenderId: "978926000712",
  appId: "1:978926000712:web:b97cc914f72262e164d67d"
};

// تشغيل فايربيز
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// تشغيل قاعدة البيانات (Firestore)
export const db = getFirestore(app);
