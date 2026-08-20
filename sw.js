/* ═══════════════════════════════════════════
   MALAGA — sw.js (Service Worker)
   Mise en cache basique des fichiers statiques pour permettre
   l'installation de la PWA et un fonctionnement minimal hors-ligne.
   Les données (annonces, etc.) restent toujours chargées en direct
   depuis Firestore quand une connexion est disponible : ce cache
   ne concerne QUE les fichiers de l'application elle-même.
═══════════════════════════════════════════ */

// Change ce numéro à chaque mise à jour importante du site pour forcer
// les navigateurs à recharger les fichiers en cache.
const CACHE_NAME = "malaga-cache-v1";

const FICHIERS_A_METTRE_EN_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./nav.js",
  "./auth.js",
  "./malaga-reference.js",
  "./grille-adaptive.js",
  "./contact-signalement.js",
  "./firebase-config.js",
  "./manifest.json",
  "./img/logo.png",
  "./img/icon-192-v2.png",
  "./img/icon-512-v2.png",
  "./img/icon-night-192.png"
];

// Installation : on met en cache les fichiers essentiels
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS_A_METTRE_EN_CACHE))
  );
  self.skipWaiting();
});

// Activation : on supprime les anciens caches (versions précédentes)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms
          .filter((nom) => nom !== CACHE_NAME)
          .map((nom) => caches.delete(nom))
      )
    )
  );
  self.clients.claim();
});

// Stratégie : "réseau d'abord, cache en secours"
// — Pour Firebase (Firestore/Auth) : on ne touche JAMAIS, ces requêtes
//   passent directement, sans passer par le service worker.
// — Pour le reste (fichiers du site) : on essaie le réseau en premier
//   pour avoir toujours la dernière version ; si hors-ligne, on sert
//   la version en cache.
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Ne jamais intercepter les appels vers Firebase / Google APIs
  if (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebaseapp.com") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((reponse) => {
        // Met à jour le cache avec la réponse fraîche
        const copie = reponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie));
        return reponse;
      })
      .catch(() => caches.match(event.request))
  );
});
