/* ═══════════════════════════════════════════
   MALAGA — firebase-config-compat.js
   Initialisation Firebase en syntaxe "compat", utilisée uniquement
   par admin.html (scripts classiques, sans type="module").
   Les mêmes identifiants que firebase-config.js (SDK modulaire,
   utilisé par le reste du site).
═══════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyCC92Nol8vk_6qLMTi1ZLX9waieiSfvhMs",
  authDomain: "malaga-gabon.firebaseapp.com",
  projectId: "malaga-gabon",
  storageBucket: "malaga-gabon.firebasestorage.app",
  messagingSenderId: "370525390297",
  appId: "1:370525390297:web:aec7f96d5a5818a29cc5c8"
};

firebase.initializeApp(firebaseConfig);

// Exposés globalement pour admin.js et reservations-admin.js
window.dbAdmin = firebase.firestore();
window.authAdmin = firebase.auth();
