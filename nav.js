/* ═══════════════════════════════════════════
   MALAGA — nav.js
   Logique partagée du header compact, du menu latéral (drawer)
   et de la barre de navigation basse, utilisée par toutes les pages.
═══════════════════════════════════════════ */

import { auth, db, onAuthStateChanged, signOut, doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, increment, collection, query, where, onSnapshot, orderBy, limit, messaging, getToken } from "./firebase-config.js";
import { getProfil } from "./auth.js";
import { enregistrerVisite } from "./tracking.js";
import { escapeHTML, formatPrix } from "./malaga-reference.js";

/* ══════════ MODE SOMBRE / CLAIR ══════════
   Préférence mémorisée dans localStorage ("malaga_theme" : "sombre" | "clair").
   Le mode sombre est le thème PAR DÉFAUT de l'application (identité visuelle
   voulue), et reste actif tant que la personne n'a pas explicitement choisi
   le mode clair (ce choix est alors mémorisé et respecté ensuite). Le thème
   est appliqué au tout premier chargement du module (avant même
   DOMContentLoaded) pour éviter un flash clair→sombre, puis ré-appliqué/
   branché sur les boutons une fois le DOM prêt. */
const CLE_THEME = "malaga_theme";

function themeMemorise() {
  try { return localStorage.getItem(CLE_THEME); } catch { return null; }
}

function themeCourantPreferere() {
  const memorise = themeMemorise();
  if (memorise === "sombre" || memorise === "clair") return memorise;
  return "sombre";
}

/* Met à jour la classe sur <body> ainsi que le libellé/icône de tous les
   boutons de bascule présents sur la page (header + menu latéral). */
function appliquerTheme(theme) {
  document.body.classList.toggle("theme-sombre", theme === "sombre");
  document.querySelectorAll("#btnTheme").forEach(el => {
    el.textContent = theme === "sombre" ? "☀️" : "🌙";
    el.setAttribute("aria-label", theme === "sombre" ? "Mode clair" : "Mode sombre");
  });
  document.querySelectorAll("#drawerTheme").forEach(el => {
    el.textContent = theme === "sombre" ? "☀️ Mode clair" : "🌙 Mode sombre";
  });
}

export function basculerTheme() {
  const nouveau = document.body.classList.contains("theme-sombre") ? "clair" : "sombre";
  try { localStorage.setItem(CLE_THEME, nouveau); } catch { /* ignoré */ }
  appliquerTheme(nouveau);
  return nouveau;
}

function initTheme() {
  appliquerTheme(themeCourantPreferere());
  // Garde-fou : si initTheme() est appelée plus d'une fois (ex. double
  // exécution du module sur une page), on ne rebranche pas une seconde
  // écoute de clic. Sans cela, chaque clic sur 🌙/☀️ basculait le thème deux
  // fois d'affilée (sombre→clair→sombre), ce qui donnait l'impression que le
  // bouton ne faisait plus rien et restait bloqué en mode sombre.
  if (window.__malagaThemeClicBranche) return;
  window.__malagaThemeClicBranche = true;
  // Délégation sur document plutôt qu'un addEventListener direct sur chaque
  // bouton : le clic est capté même si #btnTheme/#drawerTheme sont recréés
  // ou remplacés par un autre script après le chargement initial de la page
  // (ce qui rendrait un binding direct silencieusement inopérant).
  document.addEventListener("click", (e) => {
    const cible = e.target.closest("#btnTheme, #drawerTheme");
    if (!cible) return;
    e.preventDefault();
    basculerTheme();
  });
}

// Appliqué immédiatement au chargement du module, avant DOMContentLoaded,
// pour éviter un flash de thème clair suivi d'un passage en sombre.
appliquerTheme(themeCourantPreferere());

/* ══════════ TRADUCTION FR / EN (Google Translate) ══════════
   Bouton 🌐 dans le header et le drawer. Plutôt qu'une double version de
   chaque texte du site (irréaliste sur un site multi-pages qui évolue vite),
   on s'appuie sur le moteur de traduction de Google, piloté directement via
   son sélecteur interne ("goog-te-combo") plutôt que par le cookie
   "googtrans" + rechargement de page : un reload perdait l'état de la carte
   (zoom/centrage), les filtres ouverts, le scroll, etc. En pilotant le
   sélecteur en direct, la traduction s'applique au DOM en place, sans
   navigation. Préférence mémorisée dans localStorage ("malaga_langue") pour
   rester cohérente d'une page à l'autre (ré-appliquée automatiquement au
   chargement de chaque nouvelle page, toujours sans reload). */
const CLE_LANGUE = "malaga_langue";

function langueMemorisee() {
  try { return localStorage.getItem(CLE_LANGUE) === "en" ? "en" : "fr"; }
  catch { return "fr"; }
}

function majIconeLangue(langue) {
  document.querySelectorAll("#btnLangue").forEach(el => {
    el.setAttribute("aria-label", langue === "en" ? "Revenir en français" : "Switch to English");
    el.classList.toggle("langue-actif", langue === "en");
  });
  document.querySelectorAll("#drawerLangue").forEach(el => {
    el.textContent = langue === "en" ? "🌐 Retour en français" : "🌐 English";
  });
}

/* Le sélecteur `.goog-te-combo` n'existe qu'une fois le script Google chargé
   et le widget initialisé (asynchrone) : on patiente par petites tentatives
   plutôt que d'échouer silencieusement si l'utilisateur clique trop tôt. */
function attendreComboTraduction(callback, tentatives = 0) {
  const combo = document.querySelector(".goog-te-combo");
  if (combo) { callback(combo); return; }
  if (tentatives > 40) return; // ~10s, abandon silencieux (best-effort)
  setTimeout(() => attendreComboTraduction(callback, tentatives + 1), 250);
}

function appliquerTraductionCombo(langue) {
  attendreComboTraduction((combo) => {
    if (combo.value === langue) return; // déjà dans la langue voulue
    combo.value = langue;
    combo.dispatchEvent(new Event("change"));
  });
}

export function basculerLangue() {
  const nouvelle = langueMemorisee() === "en" ? "fr" : "en";
  try { localStorage.setItem(CLE_LANGUE, nouvelle); } catch { /* ignoré */ }
  majIconeLangue(nouvelle);
  appliquerTraductionCombo(nouvelle);
  return nouvelle;
}

/* Injecte le widget Google Translate (invisible) une seule fois par page.
   `autoDisplay:false` empêche l'affichage de la barre Google en haut de page ;
   c'est le sélecteur "goog-te-combo" (ci-dessus) qui pilote la traduction. */
function chargerGoogleTranslate() {
  if (document.getElementById("scriptGoogleTranslate")) return;
  if (!document.getElementById("google_translate_element")) {
    const conteneur = document.createElement("div");
    conteneur.id = "google_translate_element";
    conteneur.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
    document.body.appendChild(conteneur);
  }
  window.googleTranslateElementInit = function () {
    try {
      // eslint-disable-next-line no-undef
      new google.translate.TranslateElement(
        { pageLanguage: "fr", includedLanguages: "fr,en", autoDisplay: false },
        "google_translate_element"
      );
    } catch (err) { console.error("Initialisation Google Translate impossible :", err); }
    // Si la personne avait choisi l'anglais sur une page précédente, on
    // réapplique automatiquement dès que le widget est prêt (sans reload).
    if (langueMemorisee() === "en") appliquerTraductionCombo("en");
  };
  const script = document.createElement("script");
  script.id = "scriptGoogleTranslate";
  script.async = true;
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.body.appendChild(script);
}

/* Bulle mobile "Texte d'origine / Évaluez cette traduction" que Google
   Translate insère parfois au tap sur un mot traduit. Le CSS ciblant
   ".goog-te-balloon-frame" ne suffit plus : Google fait évoluer régulièrement
   le nom des classes/iframes de ce composant, ce qui rend un sélecteur fixe
   fragile et laisse parfois la bulle visible par-dessus l'appli (elle bloque
   alors l'écran tant qu'on ne la ferme pas manuellement). On surveille donc
   en direct tout nouvel élément ajouté au document dont le contenu
   correspond à cette bulle, et on le masque immédiatement, quel que soit son
   nom de classe ou sa structure exacte. */
function initMasquageBulleTraduction() {
  if (window.__malagaObserverBulleTraduction) return;
  window.__malagaObserverBulleTraduction = true;

  const ressembleABulleTraduction = (el) => {
    const texte = (el.innerText || el.textContent || "");
    return /texte d.origine|évaluez cette traduction|original text|rate this translation/i.test(texte);
  };

  const masquerSiBulle = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (ressembleABulleTraduction(node)) {
      node.style.setProperty("display", "none", "important");
      return;
    }
    // La bulle est parfois injectée à l'intérieur d'un conteneur générique
    // (pas forcément la racine du nœud ajouté) : on vérifie aussi un niveau
    // de profondeur raisonnable sans scanner tout le sous-arbre à chaque fois.
    node.querySelectorAll?.("div,span,iframe").forEach((enfant) => {
      if (ressembleABulleTraduction(enfant)) {
        enfant.style.setProperty("display", "none", "important");
      }
    });
  };

  const observateur = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(masquerSiBulle);
    }
  });
  observateur.observe(document.body, { childList: true, subtree: true });
}

function initTraduction() {
  chargerGoogleTranslate();
  majIconeLangue(langueMemorisee());
  initSansBloquer(initMasquageBulleTraduction, "initMasquageBulleTraduction");
  // Même délégation que pour le thème : le clic est capté même si #btnLangue
  // ou #drawerLangue sont recréés/remplacés après le chargement initial.
  document.addEventListener("click", (e) => {
    const cible = e.target.closest("#btnLangue, #drawerLangue");
    if (!cible) return;
    e.preventDefault();
    basculerLangue();
  });
}


/* ══════════ FAVORIS (stockage local) ══════════ */
const CLE_FAVORIS = "malaga_favoris";

export function getFavoris() {
  try { return JSON.parse(localStorage.getItem(CLE_FAVORIS)) || []; }
  catch { return []; }
}

export function estFavori(id) {
  return getFavoris().includes(id);
}

/* Retire du stockage local les favoris dont l'annonce n'existe plus côté Firestore
   (supprimée, ou passée "occupé" donc sortie de la liste publique), pour éviter
   d'accumuler des ids obsolètes. Appelée par app.js à chaque mise à jour temps réel
   des annonces. */
export function purgerFavorisInexistants(idsExistants) {
  try {
    const favoris = getFavoris();
    const ensemble = new Set(idsExistants || []);
    const filtres = favoris.filter(id => ensemble.has(id));
    if (filtres.length !== favoris.length) {
      localStorage.setItem(CLE_FAVORIS, JSON.stringify(filtres));
      majBadgeFavoris();
    }
  } catch (err) {
    console.error("Purge des favoris obsolètes impossible :", err);
  }
}

/* Réinitialise toutes les préférences locales de l'appareil (favoris, identifiant
   visiteur anonyme, notifications déjà vues/activées). Utilisé par parametres.html. */
export function viderDonneesLocales() {
  localStorage.removeItem(CLE_FAVORIS);
  localStorage.removeItem("malaga_likes_notifies");
  localStorage.removeItem("malaga_derniere_notif_globale_vue");
  localStorage.removeItem("malaga_notifs_actives");
  majBadgeFavoris();
}

/* ══════════ IDENTIFIANT VISITEUR ANONYME ══════════
   Persistant dans localStorage : permet à un visiteur non connecté de
   liker/déliker sans dupliquer les documents Firestore, et sert de clé
   stable pour le document de like tant qu'il ne se connecte pas. */
const CLE_VISITEUR = "malaga_visiteur_id";
function idVisiteur() {
  let id = localStorage.getItem(CLE_VISITEUR);
  if (!id) {
    id = "v_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(CLE_VISITEUR, id);
  }
  return id;
}

/* Identifiant stable de la personne courante : uid Firebase si connectée,
   sinon identifiant anonyme persistant. Sert de clé pour retrouver "ses"
   likes (collection "likes") depuis n'importe quelle page, y compris pour
   un visiteur non connecté. */
function identifiantActuel() {
  return auth.currentUser ? auth.currentUser.uid : idVisiteur();
}

/* ══════════ MIGRATION DES LIKES ANONYMES VERS LE COMPTE CONNECTÉ ══════════
   Anomalie corrigée : un même "like" pouvait se retrouver sous deux
   identifiants Firestore différents (l'id anonyme puis l'uid, ou l'inverse),
   selon que la personne était connectée ou non au moment du clic. Résultat :
   deux documents "likes" distincts pour la même annonce → deux liens/messages
   WhatsApp envoyés au propriétaire pour un seul geste.
   Dès qu'un utilisateur se connecte, on reprend chaque annonce présente dans
   ses favoris locaux et, si un like anonyme existe encore pour cette annonce
   sous l'ancien identifiant, on le transfère (copie + suppression) vers
   l'identifiant définitif (uid). Best-effort : ne bloque jamais l'affichage. */
async function migrerLikesAnonymesVersUid(uid) {
  if (!db) return;
  const idAnonyme = idVisiteur();
  if (!idAnonyme || idAnonyme === uid) return;

  const favoris = getFavoris();
  for (const annonceId of favoris) {
    try {
      const ancienRef = doc(db, "likes", `${annonceId}_${idAnonyme}`);
      const ancienSnap = await getDoc(ancienRef);
      if (!ancienSnap.exists()) continue;

      const nouveauRef = doc(db, "likes", `${annonceId}_${uid}`);
      const nouveauSnap = await getDoc(nouveauRef);
      if (!nouveauSnap.exists()) {
        const donnees = ancienSnap.data();
        await setDoc(nouveauRef, { ...donnees, utilisateurId: uid, identifiant: uid });
      }
      await deleteDoc(ancienRef);
    } catch (err) {
      console.error(`Migration du like anonyme pour l'annonce ${annonceId} impossible :`, err);
    }
  }
}

/* ══════════ TOGGLE FAVORI ══════════
   `annonce` : soit un id (rétrocompatibilité), soit l'objet annonce complet
   { id, proprietaireId, proprietaireNom, proprietaireEmail, titre }.
   Le like reste immédiat côté UI (localStorage) ; l'écriture Firestore et
   la notification email sont faites en best-effort, sans jamais bloquer
   l'interface si elles échouent (utilisateur hors-ligne, règles, etc.). */
export function toggleFavori(annonce) {
  const a = (typeof annonce === "string" || typeof annonce === "number") ? { id: annonce } : (annonce || {});
  const id = a.id;

  const favoris = getFavoris();
  const idx = favoris.indexOf(id);
  const ajout = idx === -1;
  if (ajout) favoris.push(id); else favoris.splice(idx, 1);
  localStorage.setItem(CLE_FAVORIS, JSON.stringify(favoris));
  majBadgeFavoris();

  // Identifiant du document "likes" calculé en synchrone (déterministe : annonceId +
  // identifiant courant) afin de pouvoir construire le lien "voir le like" tout de
  // suite, sans attendre l'écriture Firestore ci-dessous.
  const likeId = id ? `${id}_${identifiantActuel()}` : null;

  // Proposition WhatsApp déclenchée en synchrone, dans le même geste utilisateur
  // que le clic (nécessaire pour éviter le blocage de popup des navigateurs).
  // Garde-fou anti-doublon : un même likeId ne propose l'envoi WhatsApp qu'une
  // seule fois par session d'onglet (double-clic, ré-affichage, etc.).
  if (ajout && likeId && !dejaPropose(likeId)) {
    marquerPropose(likeId);
    proposerPartageWhatsApp(a, likeId);
  }

  synchroniserLikeFirestore(a, ajout, likeId).catch((err) => console.error("Synchronisation du like impossible :", err));

  return favoris.includes(id);
}

const CLE_LIKES_PROPOSES = "malaga_likes_proposes_session";
function dejaPropose(likeId) {
  try { return (JSON.parse(sessionStorage.getItem(CLE_LIKES_PROPOSES)) || []).includes(likeId); }
  catch { return false; }
}
function marquerPropose(likeId) {
  try {
    const liste = JSON.parse(sessionStorage.getItem(CLE_LIKES_PROPOSES)) || [];
    if (!liste.includes(likeId)) { liste.push(likeId); sessionStorage.setItem(CLE_LIKES_PROPOSES, JSON.stringify(liste)); }
  } catch { /* ignoré */ }
}

/* ══════════ PROPOSITION D'ENVOI DU LIKE AU PROPRIÉTAIRE PAR WHATSAPP ══════════
   Après un like, propose au visiteur de prévenir le propriétaire via le
   numéro WhatsApp déjà renseigné sur l'annonce (mêmes champs que le bouton
   WhatsApp existant sur la fiche détail : whatsapp, sinon tel). Le visiteur
   garde la main : il envoie lui-même le message (ou annule), aucun envoi
   automatique caché.

   Le message est volontairement descriptif (annonce, prix, quartier) et
   contient un lien vers "profil.html?like=ID" : en l'ouvrant, le propriétaire
   voit le like reçu et peut, en un clic, indiquer qu'il souhaite débuter une
   discussion — ce qui déclenchera à son tour une notification pour l'auteur
   du like (voir initNotificationsLikesVus ci-dessous). */
function proposerPartageWhatsApp(a, likeId) {
  const numero = (a.whatsapp || a.proprietaireTel || a.tel || "").replace(/[^\d]/g, "");
  if (!numero) return;

  const veut = confirm(`❤️ Annonce ajoutée à vos favoris !\n\nVoulez-vous prévenir le propriétaire par WhatsApp que vous aimez « ${a.titre || "cette annonce"} » ?`);
  if (!veut) return;

  const details = [
    a.prix ? formatPrix(a.prix) : "",
    a.quartier || a.commune || ""
  ].filter(Boolean).join(" · ");

  const lien = likeId ? `${location.origin}${location.pathname.replace(/[^/]*$/, "")}profil.html?like=${encodeURIComponent(likeId)}` : "";

  const texte = `Bonjour${a.proprietaireNom ? " " + a.proprietaireNom : ""} 👋, je viens d'ajouter votre annonce « ${a.titre || "votre annonce"} »${details ? ` (${details})` : ""} à mes favoris sur MALAGA ❤️.`
    + (lien ? `\n\n👉 Cliquez ici pour voir mon like et me dire si vous souhaitez qu'on discute : ${lien}` : "");

  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texte)}`, "_blank");
}

/* Appelle le Worker Cloudflare pour envoyer un push au propriétaire visé.
   Best-effort : si le propriétaire n'a pas de token (jamais accepté les
   notifications), ou si le Worker est injoignable, on ignore simplement —
   ça ne doit jamais bloquer un like ou une demande de visite. */
const URL_WORKER_PUSH = "https://malaga-push-relais.TON-COMPTE.workers.dev";

export async function envoyerPush(proprietaireId, titre, message, url) {
  try {
    if (!proprietaireId) return;
    const profilProprio = await getDoc(doc(db, "users", proprietaireId));
    const token = profilProprio.exists() ? profilProprio.data()?.fcmToken : null;
    if (!token) return;

    await fetch(URL_WORKER_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, titre, message, url })
    });
  } catch (e) {
    console.warn("Envoi du push impossible :", e);
  }
}

async function synchroniserLikeFirestore(a, ajout, likeIdCalcule) {
  if (!a.id || !db) return;

  const user = auth.currentUser;
  const identifiant = identifiantActuel();
  const likeId = likeIdCalcule || `${a.id}_${identifiant}`;
  const likeRef = doc(db, "likes", likeId);
  const annonceRef = doc(db, "annonces", a.id);

  if (ajout) {
    let nomAffiche = "Un visiteur";
    let visiteurTel = "";
    if (user) {
      const profil = await getProfil(user.uid).catch(() => null);
      nomAffiche = profil?.nom || user.email || "Un visiteur";
      visiteurTel = profil?.tel || "";
    }

    await setDoc(likeRef, {
      annonceId: a.id,
      annonceTitre: a.titre || "",
      proprietaireId: a.proprietaireId || null,
      proprietaireNom: a.proprietaireNom || "",
      proprietaireWhatsapp: (a.whatsapp || a.proprietaireTel || a.tel || "").replace(/[^\d]/g, ""),
      utilisateurId: user ? user.uid : null,
      identifiant,          // clé stable (uid ou id anonyme) pour retrouver "mes" likes
      nomAffiche,
      visiteurTel,           // permet au propriétaire de répondre directement par WhatsApp
      vu: false,             // passe à true quand le propriétaire ouvre le lien "voir le like"
      dateVu: null,
      dateLike: serverTimestamp()
    });
    await updateDoc(annonceRef, { nbLikes: increment(1) }).catch(() => {});

    // Notification email au propriétaire (best-effort, ne bloque jamais l'UI)
    if (a.proprietaireEmail && window.MALAGA_EMAIL?.envoyerNotificationLike) {
      window.MALAGA_EMAIL.envoyerNotificationLike({
        proprietaireEmail: a.proprietaireEmail,
        proprietaireNom: a.proprietaireNom || "",
        annonceTitre: a.titre || "votre annonce",
        nomVisiteur: nomAffiche
      });
    }

    // Notification push + badge (best-effort, ne bloque jamais l'UI)
    envoyerPush(
      a.proprietaireId,
      "❤️ Nouveau like",
      `${nomAffiche} a aimé « ${a.titre || "votre annonce"} »`,
      `profil.html?like=${encodeURIComponent(likeId)}`
    );
  } else {
    await deleteDoc(likeRef).catch(() => {});
    await updateDoc(annonceRef, { nbLikes: increment(-1) }).catch(() => {});
  }
}

/* ══════════ NOTIFICATION RETOUR À L'AUTEUR DU LIKE ══════════
   Dès que le propriétaire ouvre "profil.html?like=ID" et marque le like
   comme vu (champ vu:true, écrit depuis profil.html), l'auteur du like —
   qu'il soit connecté ou simple visiteur anonyme — reçoit, à sa prochaine
   page vue sur le site, une notification en surcouche lui proposant de
   démarrer une discussion WhatsApp avec le propriétaire. Écoute en temps
   réel best-effort : ne bloque jamais l'affichage du site si Firestore est
   indisponible. */
const CLE_LIKES_NOTIFIES = "malaga_likes_notifies";

function getLikesNotifies() {
  try { return JSON.parse(localStorage.getItem(CLE_LIKES_NOTIFIES)) || []; }
  catch { return []; }
}
function marquerLikeNotifieLocalement(likeId) {
  const liste = getLikesNotifies();
  if (!liste.includes(likeId)) {
    liste.push(likeId);
    localStorage.setItem(CLE_LIKES_NOTIFIES, JSON.stringify(liste));
  }
}

let ecouteNotifsLikesDemarree = false;
function initNotificationsLikesVus() {
  if (ecouteNotifsLikesDemarree || !db) return;
  ecouteNotifsLikesDemarree = true;

  onAuthStateChanged(auth, (user) => {
    const identifiant = user ? user.uid : idVisiteur();
    const q = query(collection(db, "likes"), where("identifiant", "==", identifiant), where("vu", "==", true));
    onSnapshot(q, (snap) => {
      const deja = getLikesNotifies();
      snap.docs
        .filter(d => !deja.includes(d.id))
        .forEach(d => afficherNotificationLikeVu({ id: d.id, ...d.data() }));
    }, (err) => console.error("Écoute des notifications de like impossible :", err));
  });
}

let fileNotificationsLikes = [];
let notificationLikeEnCours = false;

function afficherNotificationLikeVu(like) {
  marquerLikeNotifieLocalement(like.id);
  fileNotificationsLikes.push({ type: "like", ...like });
  if (!notificationLikeEnCours) traiterFileNotificationsLikes();
  notifierNatif("👀 Votre like a été vu !", `Le propriétaire de « ${like.annonceTitre || "cette annonce"} » a vu votre like.`);
}

function injecterStylesNotifLike() {
  if (document.getElementById("styleNotifLike")) return;
  const style = document.createElement("style");
  style.id = "styleNotifLike";
  style.textContent = `
    .notif-like-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;
      justify-content:center;z-index:9999;animation:notifLikeFondu .18s ease;}
    @keyframes notifLikeFondu{from{opacity:0;}to{opacity:1;}}
    .notif-like-carte{background:#fff;border-radius:18px 18px 0 0;padding:22px 20px 26px;max-width:420px;width:100%;
      box-shadow:0 -8px 30px rgba(0,0,0,.18);font-family:inherit;}
    @media (min-width:480px){.notif-like-overlay{align-items:center;}.notif-like-carte{border-radius:18px;}}
    .notif-like-icone{font-size:30px;margin-bottom:8px;}
    .notif-like-titre{font-size:15px;font-weight:800;color:#1A2332;margin-bottom:6px;line-height:1.35;}
    .notif-like-texte{font-size:13px;color:#555;line-height:1.5;margin-bottom:18px;}
    .notif-like-boutons{display:flex;gap:10px;}
    .notif-like-btn{flex:1;padding:12px 10px;border-radius:12px;font-size:13px;font-weight:700;border:none;cursor:pointer;text-align:center;}
    .notif-like-btn-oui{background:#009E60;color:#fff;}
    .notif-like-btn-non{background:#F2F2F2;color:#444;}
  `;
  document.head.appendChild(style);
}

/* Affiche une notification en surcouche, qu'il s'agisse du retour d'un like vu
   (type "like", avec proposition de discussion WhatsApp) ou d'une annonce
   diffusée par l'administrateur (type "globale", simple message informatif). */
function traiterFileNotificationsLikes() {
  const notif = fileNotificationsLikes.shift();
  if (!notif) { notificationLikeEnCours = false; return; }
  notificationLikeEnCours = true;
  injecterStylesNotifLike();

  const estGlobale = notif.type === "globale";
  const overlay = document.createElement("div");
  overlay.className = "notif-like-overlay";
  overlay.innerHTML = estGlobale ? `
    <div class="notif-like-carte">
      <div class="notif-like-icone">📢</div>
      <div class="notif-like-titre">${escapeHTML(notif.titre || "MALAGA")}</div>
      <div class="notif-like-texte">${escapeHTML(notif.message || "")}</div>
      <div class="notif-like-boutons">
        <button type="button" class="notif-like-btn notif-like-btn-oui" style="flex:1;">OK, compris</button>
      </div>
    </div>
  ` : `
    <div class="notif-like-carte">
      <div class="notif-like-icone">👀</div>
      <div class="notif-like-titre">Votre like a été vu !</div>
      <div class="notif-like-texte">Le propriétaire de l'annonce « ${escapeHTML(notif.annonceTitre || "cette annonce")} » a vu votre like. Souhaitez-vous débuter une discussion avec lui ?</div>
      <div class="notif-like-boutons">
        <button type="button" class="notif-like-btn notif-like-btn-non">Plus tard</button>
        <button type="button" class="notif-like-btn notif-like-btn-oui">💬 Oui, discuter</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fermer = () => { overlay.remove(); traiterFileNotificationsLikes(); };

  overlay.querySelector(".notif-like-btn-non")?.addEventListener("click", fermer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fermer(); });

  overlay.querySelector(".notif-like-btn-oui").onclick = () => {
    if (!estGlobale) {
      const numero = (notif.proprietaireWhatsapp || "").replace(/[^\d]/g, "");
      if (numero) {
        const texte = `Bonjour${notif.proprietaireNom ? " " + notif.proprietaireNom : ""}, je viens de voir que vous avez consulté mon like sur votre annonce « ${notif.annonceTitre || ""} » 😊. Discutons-en !`;
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texte)}`, "_blank");
      } else {
        alert("Le numéro WhatsApp du propriétaire n'est pas disponible pour le moment.");
      }
    }
    fermer();
  };
}

/* ══════════ ACTIVATION DES NOTIFICATIONS ══════════
   Deux niveaux, indépendants et complémentaires :
   1. Les notifications en surcouche (like vu, annonces admin) sont TOUJOURS
      affichées à l'ouverture du site, qu'on soit "activé" ou non.
   2. "Activer les notifications" (menu ☰) demande en plus la permission du
      navigateur pour envoyer de vraies notifications système (Notification
      API), utiles quand l'onglet MALAGA n'est pas affiché. La préférence est
      enregistrée dans Firestore ("notifsPrefs") afin que l'admin puisse voir
      combien de personnes l'ont activée et leur diffuser des annonces. */
const CLE_NOTIFS_ACTIVES = "malaga_notifs_actives";

export function estNotifsActives() {
  return localStorage.getItem(CLE_NOTIFS_ACTIVES) === "1";
}

export async function toggleNotifications() {
  const activerMaintenant = !estNotifsActives();

  if (activerMaintenant && typeof Notification !== "undefined" && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* ignoré : best-effort */ }
  }

  localStorage.setItem(CLE_NOTIFS_ACTIVES, activerMaintenant ? "1" : "0");
  majLabelDrawerNotifs();
  enregistrerPrefNotifFirestore(activerMaintenant).catch((err) => console.error("Enregistrement de la préférence de notifications impossible :", err));

  return activerMaintenant;
}

async function enregistrerPrefNotifFirestore(actif) {
  if (!db) return;
  const identifiant = identifiantActuel();
  await setDoc(doc(db, "notifsPrefs", identifiant), {
    identifiant,
    uid: auth.currentUser ? auth.currentUser.uid : null,
    actif,
    dateMaj: serverTimestamp()
  }, { merge: true });
}

/* Notification système native (best-effort) : uniquement si l'utilisateur a
   explicitement activé les notifications ET que le navigateur a donné la
   permission. N'affiche jamais rien qui bloque l'usage du site. */
function notifierNatif(titre, corps) {
  if (!estNotifsActives()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(titre, { body: corps, icon: "img/favicon-180.png" }); } catch { /* ignoré */ }
}

function majLabelDrawerNotifs() {
  document.querySelectorAll("#drawerNotifs").forEach(el => {
    el.textContent = estNotifsActives() ? "🔕 Désactiver les notifications" : "🔔 Activer les notifications";
  });
}

function initDrawerNotifs() {
  majLabelDrawerNotifs();
  document.querySelectorAll("#drawerNotifs").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      const actif = await toggleNotifications();
      alert(actif
        ? "🔔 Notifications activées ! Vous serez prévenu(e) des réponses à vos likes et des actualités MALAGA."
        : "🔕 Notifications désactivées.");
    });
  });
}

/* ══════════ NOTIFICATIONS DIFFUSÉES PAR L'ADMIN ("notificationsGlobales") ══════════
   Écoute best-effort du dernier message envoyé par l'administrateur depuis le
   panneau admin (page "Notifications"). Affichée une seule fois par personne
   (mémorisé en localStorage), à tous les visiteurs — activer les notifications
   ajoute en plus une alerte système native quand l'onglet n'est pas au premier plan. */
const CLE_DERNIERE_NOTIF_GLOBALE = "malaga_derniere_notif_globale_vue";

let ecouteNotifsGlobalesDemarree = false;
function initEcouteNotificationsGlobales() {
  if (ecouteNotifsGlobalesDemarree || !db) return;
  ecouteNotifsGlobalesDemarree = true;

  const q = query(collection(db, "notificationsGlobales"), orderBy("dateEnvoi", "desc"), limit(1));
  onSnapshot(q, (snap) => {
    if (snap.empty) return;
    const dernier = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const dejaVue = localStorage.getItem(CLE_DERNIERE_NOTIF_GLOBALE);
    if (dernier.id === dejaVue) return;

    localStorage.setItem(CLE_DERNIERE_NOTIF_GLOBALE, dernier.id);
    fileNotificationsLikes.push({ type: "globale", titre: dernier.titre, message: dernier.message });
    if (!notificationLikeEnCours) traiterFileNotificationsLikes();
    notifierNatif(dernier.titre || "MALAGA", dernier.message || "");
  }, (err) => console.error("Écoute des notifications globales impossible :", err));
}



function majBadgeFavoris() {
  const n = getFavoris().length;
  document.querySelectorAll(".badge-favoris").forEach(el => {
    el.textContent = n > 0 ? n : "";
    el.style.display = n > 0 ? "flex" : "none";
  });
}

/* ══════════ INITIALES POUR L'AVATAR ══════════ */
function initiales(nom) {
  if (!nom) return "?";
  const parts = nom.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || nom[0].toUpperCase();
}

/* ══════════ MENU LATÉRAL (DRAWER) ══════════ */
function initDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const btnOuvrir = document.getElementById("btnMenu");
  const btnFermer = document.getElementById("fermerDrawer");
  if (!drawer) return;

  const ouvrir = () => { drawer.classList.add("ouvert"); overlay.classList.add("visible"); document.body.style.overflow = "hidden"; };
  const fermer = () => { drawer.classList.remove("ouvert"); overlay.classList.remove("visible"); document.body.style.overflow = ""; };

  btnOuvrir?.addEventListener("click", ouvrir);
  btnFermer?.addEventListener("click", fermer);
  overlay?.addEventListener("click", fermer);
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", fermer));
}

/* Doit rester identique à ADMIN_EMAIL dans admin.js */
const ADMIN_EMAIL = "malagagabon@gmail.com";

/* ══════════ ÉTAT DE CONNEXION → AVATAR, DRAWER, BARRE BASSE ══════════ */
/* Demande la permission de notification et enregistre le token FCM de
   l'utilisateur dans Firestore (users/{uid}.fcmToken), pour permettre au
   Worker Cloudflare de lui envoyer un push plus tard (likes, demandes de
   visite...). Best-effort total : navigateur non compatible, permission
   refusée, hors-ligne... rien de tout ça ne doit jamais bloquer la
   connexion normale au site. */
async function enregistrerTokenFCM(uid) {
  try {
    if (!messaging || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const token = await getToken(messaging, {
      vapidKey: "BMAM8iupaxOmKxreF_ZXKwWo2ExHgOOPC7n7jQIhuEOXDX2pXfoue1i7Cnf-zZJ0aH1edSNlZ_po2q6VsyiUlck"
    });
    if (token) {
      await updateDoc(doc(db, "users", uid), { fcmToken: token });
    }
  } catch (e) {
    console.warn("Enregistrement du token FCM impossible :", e);
  }
}

function initAuthUI() {
  onAuthStateChanged(auth, async (user) => {
    const avatar = document.getElementById("btnCompte");
    const drawerConnexion = document.getElementById("drawerConnexion");
    const drawerProprio = document.getElementById("drawerProprio");
    const drawerAdmin = document.getElementById("drawerAdmin");
    const bnProfilLabel = document.getElementById("bnProfilLabel");
    const bnProfilLien = document.getElementById("bnProfil");

    if (!user) {
      if (avatar) { avatar.textContent = "👤"; avatar.href = "connexion.html"; avatar.classList.remove("avatar-initiales"); }
      if (drawerConnexion) { drawerConnexion.textContent = "👤 Se connecter"; drawerConnexion.href = "connexion.html"; }
      if (drawerProprio) drawerProprio.style.display = "none";
      if (drawerAdmin) drawerAdmin.style.display = "none";
      if (bnProfilLabel) bnProfilLabel.textContent = "Profil";
      if (bnProfilLien) bnProfilLien.href = "connexion.html";
      return;
    }

    migrerLikesAnonymesVersUid(user.uid);
    enregistrerTokenFCM(user.uid);

    const profil = await getProfil(user.uid);
    const nom = profil?.nom || "Mon compte";
    if (avatar) {
      if (profil?.photoURL) {
        avatar.innerHTML = `<img src="${escapeHTML(profil.photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        avatar.classList.remove("avatar-initiales");
      } else {
        avatar.textContent = initiales(nom);
        avatar.classList.add("avatar-initiales");
      }
      avatar.href = "profil.html";
    }
    if (drawerConnexion) { drawerConnexion.textContent = "🚪 Se déconnecter"; drawerConnexion.href = "#"; drawerConnexion.onclick = (e) => { e.preventDefault(); signOut(auth); }; }
    if (drawerProprio) drawerProprio.style.display = profil?.role === "proprietaire" ? "block" : "none";
    if (drawerAdmin) drawerAdmin.style.display = user.email === ADMIN_EMAIL ? "block" : "none";
    if (bnProfilLabel) bnProfilLabel.textContent = nom.split(" ")[0];
    if (bnProfilLien) bnProfilLien.href = "profil.html";
  });
}

/* ══════════ FLÈCHES DE SCROLL (haut / bas) — discrètes, dynamiques, sur toute l'app ══════════ */
function initScrollNav() {
  if (document.getElementById("scrollNav")) return;

  const nav = document.createElement("div");
  nav.className = "scroll-nav";
  nav.id = "scrollNav";
  nav.innerHTML = `
    <button type="button" class="scroll-btn" id="scrollHaut" aria-label="Remonter en haut">▲</button>
    <button type="button" class="scroll-btn" id="scrollBas" aria-label="Aller en bas">▼</button>
  `;
  document.body.appendChild(nav);

  const btnHaut = document.getElementById("scrollHaut");
  const btnBas = document.getElementById("scrollBas");

  const majVisibilite = () => {
    const y = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const prochePied = maxScroll - y < 80;

    // Flèche du haut : visible seulement après un léger scroll vers le bas
    btnHaut.classList.toggle("visible", y > 220);
    // Flèche du bas : visible tant qu'on n'a pas atteint (presque) le bas de page
    btnBas.classList.toggle("visible", maxScroll > 220 && !prochePied);
  };

  btnHaut.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  btnBas.addEventListener("click", () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));

  window.addEventListener("scroll", majVisibilite, { passive: true });
  window.addEventListener("resize", majVisibilite);
  majVisibilite();
}

/* ══════════ OUVERTURE DIRECTE D'UNE FICHE ANNONCE (lien partagé) ══════════
   Corrige l'anomalie : les cartes "like reçu" / "demande de visite reçue" de
   profil.html ne menaient jamais à l'annonce elle-même. Elles pointent
   désormais vers "index.html?annonce=ID" ; au chargement de index.html, si ce
   paramètre est présent, on récupère l'annonce dans Firestore et on l'affiche
   directement dans la modale de détail existante (#detailModal/#detailPanneau),
   sans attendre que l'utilisateur la retrouve lui-même dans la liste/carte.
   Best-effort : ne bloque jamais l'affichage du reste du site en cas d'échec. */
function injecterStylesFicheAnnoncePartagee() {
  if (document.getElementById("styleFichePartagee")) return;
  const style = document.createElement("style");
  style.id = "styleFichePartagee";
  style.textContent = `
    .fiche-partagee{padding:20px;max-width:520px;}
    .fiche-partagee .fp-fermer{position:absolute;top:14px;right:14px;background:rgba(0,0,0,.08);border:none;
      width:32px;height:32px;border-radius:50%;font-size:15px;cursor:pointer;}
    .fiche-partagee .fp-photo{width:100%;height:200px;object-fit:cover;border-radius:12px;margin-bottom:14px;background:var(--gris-fond,#f2f2f2);}
    .fiche-partagee h2{font-size:17px;font-weight:800;margin-bottom:6px;}
    .fiche-partagee .fp-prix{font-size:16px;font-weight:800;color:var(--vert,#009E60);margin-bottom:4px;}
    .fiche-partagee .fp-meta{font-size:12.5px;color:var(--gris-clair,#777);margin-bottom:12px;}
    .fiche-partagee .fp-desc{font-size:13.5px;line-height:1.5;color:#333;margin-bottom:16px;white-space:pre-line;}
  `;
  document.head.appendChild(style);
}

async function afficherFicheAnnoncePartagee(id) {
  const modal = document.getElementById("detailModal");
  const panneau = document.getElementById("detailPanneau");
  if (!modal || !panneau || !db) return;

  injecterStylesFicheAnnoncePartagee();
  panneau.innerHTML = `<div class="fiche-partagee"><div class="spinner">Chargement de l'annonce…</div></div>`;
  modal.classList.add("ouverte");

  try {
    const snap = await getDoc(doc(db, "annonces", id));
    if (!snap.exists()) {
      panneau.innerHTML = `<div class="fiche-partagee"><button type="button" class="fp-fermer" id="fpFermer">✕</button><p>Cette annonce n'est plus disponible.</p></div>`;
    } else {
      const a = snap.data();
      const meta = [a.quartier, a.commune, a.statut === "occupe" ? "🔴 Occupé" : "🟢 Disponible"].filter(Boolean).join(" · ");
      panneau.innerHTML = `
        <div class="fiche-partagee">
          <button type="button" class="fp-fermer" id="fpFermer">✕</button>
          ${a.photos?.[0] ? `<img src="${escapeHTML(a.photos[0])}" alt="" class="fp-photo">` : ""}
          <h2>${escapeHTML(a.titre || "Annonce")}</h2>
          <div class="fp-prix">${formatPrix ? formatPrix(a.prix) : a.prix}</div>
          <div class="fp-meta">📍 ${escapeHTML(meta)}</div>
          ${a.description ? `<div class="fp-desc">${escapeHTML(a.description)}</div>` : ""}
        </div>`;
    }
  } catch (err) {
    console.error("Impossible de charger l'annonce partagée :", err);
    panneau.innerHTML = `<div class="fiche-partagee"><button type="button" class="fp-fermer" id="fpFermer">✕</button><p>Impossible de charger cette annonce pour le moment.</p></div>`;
  }

  const fermer = () => modal.classList.remove("ouverte");
  panneau.querySelector("#fpFermer")?.addEventListener("click", fermer);
  modal.addEventListener("click", (e) => { if (e.target === modal) fermer(); }, { once: true });
}

function initOuvertureAnnoncePartagee() {
  const id = new URLSearchParams(location.search).get("annonce");
  if (id) afficherFicheAnnoncePartagee(id);
}

/* ══════════ INITIALISATION GÉNÉRALE ══════════
   Chaque fonction d'init est isolée dans son propre try/catch : une erreur
   dans l'une (ex. initAuthUI si Firebase répond mal) ne doit plus jamais
   empêcher silencieusement les suivantes (ex. initTheme) de s'exécuter. */
function initSansBloquer(fn, nom) {
  try { fn(); }
  catch (err) { console.error(`Initialisation "${nom}" impossible :`, err); }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop() || "index.html";

  initSansBloquer(initTheme, "initTheme");
  initSansBloquer(initTraduction, "initTraduction");
  initSansBloquer(initDrawer, "initDrawer");
  initSansBloquer(initAuthUI, "initAuthUI");
  initSansBloquer(majBadgeFavoris, "majBadgeFavoris");
  initSansBloquer(initScrollNav, "initScrollNav");
  initSansBloquer(initNotificationsLikesVus, "initNotificationsLikesVus");
  initSansBloquer(initDrawerNotifs, "initDrawerNotifs");
  initSansBloquer(initEcouteNotificationsGlobales, "initEcouteNotificationsGlobales");
  initSansBloquer(initOuvertureAnnoncePartagee, "initOuvertureAnnoncePartagee");
  initSansBloquer(() => enregistrerVisite("page", page), "enregistrerVisite");

  // Marque l'onglet actif de la barre basse selon la page courante
  document.querySelectorAll(".bn-item[data-page]").forEach(el => {
    el.classList.toggle("actif", el.dataset.page === page);
  });
});
