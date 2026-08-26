/* ═══════════════════════════════════════════════════════════════
   MALAGA — malaga-id.js
   Système d'identification MALAGA : numéro unique pour chaque membre
   et chaque annonce, + utilitaires QR code.

   ─────────────────────────────────────────────────────────────
   PRINCIPE (volontairement original / propre à MALAGA) :
   Plutôt qu'un compteur global (qui nécessiterait une transaction
   Firestore partagée entre tous les utilisateurs — source classique
   de conflits d'écriture et de failles de sécurité), chaque numéro
   est calculé DE FAÇON DÉTERMINISTE à partir de l'identifiant Firestore
   déjà existant (uid du membre, ou id du document annonce).

   Avantages :
   - Aucune écriture supplémentaire dans Firestore, aucune règle de
     sécurité à modifier, aucun risque de doublon/conflit.
   - Le numéro est calculable pour TOUS les comptes et annonces déjà
     existants, sans script de migration — dès le déploiement de ce
     fichier, chaque membre et chaque annonce a immédiatement son
     numéro, y compris les comptes créés avant cette fonctionnalité.
   - Le numéro reste strictement stable dans le temps pour un même
     compte/annonce (même uid/id → toujours le même numéro).

   FORMAT :  MLG-<PRÉFIXE>-<6 caractères>
   Préfixe membre :
     AG = Agence immobilière          EN = Entreprise / société privée
     PA = Particulier annonceur       CH = Chercheur de logement
   Préfixe annonce :
     AN = Annonce (tous types confondus)

   Exemples : MLG-AG-7K3F9X   ·   MLG-PA-4Q8B2M   ·   MLG-AN-C1D9E4
   ═══════════════════════════════════════════════════════════════ */

/**
 * Hache une chaîne en un code court, stable et lisible (6 caractères,
 * alphabet base36 = chiffres + lettres majuscules). Basé sur FNV-1a,
 * un algorithme de hachage simple, rapide, et à très faible collision
 * pour ce volume de données (quelques milliers de membres/annonces).
 */
function hacherCourt(chaine) {
  let h = 2166136261; // offset FNV-1a 32 bits
  for (let i = 0; i < chaine.length; i++) {
    h ^= chaine.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0; // force un entier non-signé 32 bits
  // Un entier 32 bits peut nécessiter jusqu'à 7 caractères en base36
  // (36^6 = 2 176 782 336 < 2^32 = 4 294 967 296). L'ancienne version
  // gardait seulement les 6 derniers caractères (slice(-6)), ce qui
  // supprimait silencieusement le chiffre de poids fort pour près de la
  // moitié des valeurs possibles : deux identifiants différents pouvaient
  // alors produire exactement le même code MALAGA. Le modulo ci-dessous
  // ramène TOUJOURS le hash dans l'espace exact des 6 caractères base36,
  // de façon uniforme, sans jamais perdre d'information par troncature.
  const ESPACE_BASE36_6 = 36 ** 6; // 2 176 782 336
  return (h % ESPACE_BASE36_6).toString(36).toUpperCase().padStart(6, "0");
}

/** Numéro MALAGA générique : MLG-<préfixe>-<hash>. */
export function numeroMalaga(id, prefixe) {
  if (!id) return `MLG-${prefixe}-------`;
  return `MLG-${prefixe}-${hacherCourt(String(id))}`;
}

/**
 * Détermine le préfixe d'un membre à partir de son profil Firestore
 * (users/{uid}). Couvre tous les types de comptes de la plateforme.
 */
export function prefixeMembre(profil = {}) {
  if (profil.role !== "proprietaire") return "CH"; // Chercheur de logement
  if (profil.compteType === "entreprise") {
    const type = (profil.typeEntreprise || "").toLowerCase();
    return type.includes("agence") ? "AG" : "EN"; // Agence vs. société privée / autre entreprise
  }
  return "PA"; // Particulier annonceur (propriétaire individuel)
}

/** Numéro d'identification d'un membre. */
export function numeroMembre(uid, profil = {}) {
  return numeroMalaga(uid, prefixeMembre(profil));
}

/** Numéro d'identification d'une annonce. */
export function numeroAnnonce(annonceId) {
  return numeroMalaga(annonceId, "AN");
}

/** Libellé humain du préfixe, pour l'affichage (badges, fiches...). */
export const LIBELLE_PREFIXE_MEMBRE = {
  AG: "Agence immobilière",
  EN: "Entreprise / société privée",
  PA: "Particulier annonceur",
  CH: "Chercheur de logement"
};

/* ═══════════════════════════════════════════════════════════════
   QR CODE — génération + suivi des clics/scans
   Utilise la librairie légère "qrcode" (CDN, aucune clé requise).
   ═══════════════════════════════════════════════════════════════ */

let libQRChargee = null;
const SOURCES_LIB_QR = [
  "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
  "https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js"
];

function chargerScript(src, delaiMs = 6000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    const minuteur = setTimeout(() => reject(new Error(`Délai dépassé pour ${src}`)), delaiMs);
    script.onload = () => { clearTimeout(minuteur); resolve(); };
    script.onerror = () => { clearTimeout(minuteur); reject(new Error(`Échec du chargement de ${src}`)); };
    document.head.appendChild(script);
  });
}

/* Essaie chaque CDN de la liste l'un après l'autre (avec un délai maximum
   par tentative) au lieu de dépendre d'un seul hébergeur : si jsDelivr est
   bloqué ou injoignable sur le réseau de la personne, on bascule sur unpkg
   avant d'abandonner. Auparavant, un seul échec laissait le canvas vide
   en silence, sans aucune indication du problème. */
function chargerLibQR() {
  if (libQRChargee) return libQRChargee;
  libQRChargee = (async () => {
    if (window.QRCode) return;
    let derniereErreur = null;
    for (const src of SOURCES_LIB_QR) {
      try {
        await chargerScript(src);
        if (window.QRCode) return;
      } catch (err) {
        derniereErreur = err;
      }
    }
    libQRChargee = null; // permet de réessayer plus tard (ex. reconnexion réseau)
    throw derniereErreur || new Error("Librairie QR indisponible");
  })();
  return libQRChargee;
}

/**
 * Dessine un QR code dans un <canvas> existant.
 * @param {HTMLCanvasElement} canvas
 * @param {string} texte - contenu encodé (généralement l'URL du site)
 */
export async function dessinerQRCode(canvas, texte, taille = 220) {
  await chargerLibQR();
  return new Promise((resolve, reject) => {
    window.QRCode.toCanvas(canvas, texte, { width: taille, margin: 1,
      color: { dark: "#0B3B2E", light: "#FFFFFF" } }, (err) => err ? reject(err) : resolve());
  });
}

/** Génère un QR code en data URL (utile pour l'impression / <img>). */
export async function qrCodeVersDataURL(texte, taille = 220) {
  await chargerLibQR();
  return window.QRCode.toDataURL(texte, { width: taille, margin: 1,
    color: { dark: "#0B3B2E", light: "#FFFFFF" } });
}
