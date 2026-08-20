import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCC92Nol8vk_6qLMTi1ZLX9waieiSfvhMs",
  authDomain: "malaga-gabon.firebaseapp.com",
  projectId: "malaga-gabon",
  storageBucket: "malaga-gabon.firebasestorage.app",
  messagingSenderId: "370525390297",
  appId: "1:370525390297:web:aec7f96d5a5818a29cc5c8"
};

const app = initializeApp(firebaseConfig);

// App Check : protège Firestore/Auth contre l'utilisation des clés en
// dehors du site MALAGA. Clé de site reCAPTCHA v3 (publique, sans risque
// à exposer ici — c'est son rôle).
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6LcjNY8tAAAAAEXXVJjX6Pj0IXVkXEfC23n2ZThr"),
  isTokenAutoRefreshEnabled: true
});

export const auth = getAuth(app);
export const db = getFirestore(app);

// Réexport des fonctions Auth et Firestore : toutes les pages du site
// importent tout depuis ce seul fichier pour rester simples et cohérentes.
export {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment
};
