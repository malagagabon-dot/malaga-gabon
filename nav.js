/* ═══════════════════════════════════════════
   MALAGA — nav.js
   Logique partagée du header compact, du menu latéral (drawer)
   et de la barre de navigation basse, utilisée par toutes les pages.
═══════════════════════════════════════════ */

import { auth, db, onAuthStateChanged, signOut, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, increment } from "./firebase-config.js";
import { getProfil } from "./auth.js";
import { escapeHTML } from "./malaga-reference.js";

/* ══════════ FAVORIS (stockage local) ══════════ */
const CLE_FAVORIS = "malaga_favoris";

export function getFavoris() {
  try { return JSON.parse(localStorage.getItem(CLE_FAVORIS)) || []; }
  catch { return []; }
}

export function estFavori(id) {
  return getFavoris().includes(id);
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

  // Proposition WhatsApp déclenchée en synchrone, dans le même geste utilisateur
  // que le clic (nécessaire pour éviter le blocage de popup des navigateurs).
  if (ajout) proposerPartageWhatsApp(a);

  synchroniserLikeFirestore(a, ajout).catch((err) => console.error("Synchronisation du like impossible :", err));

  return favoris.includes(id);
}

/* ══════════ PROPOSITION D'ENVOI DU LIKE AU PROPRIÉTAIRE PAR WHATSAPP ══════════
   Après un like, propose au visiteur de prévenir le propriétaire via le
   numéro WhatsApp déjà renseigné sur l'annonce (mêmes champs que le bouton
   WhatsApp existant sur la fiche détail : whatsapp, sinon tel). Le visiteur
   garde la main : il envoie lui-même le message (ou annule), aucun envoi
   automatique caché. */
function proposerPartageWhatsApp(a) {
  const numero = (a.whatsapp || a.proprietaireTel || a.tel || "").replace(/[^\d]/g, "");
  if (!numero) return;

  const veut = confirm(`❤️ Annonce ajoutée à vos favoris !\n\nVoulez-vous prévenir le propriétaire par WhatsApp que vous aimez « ${a.titre || "cette annonce"} » ?`);
  if (!veut) return;

  const texte = `Bonjour${a.proprietaireNom ? " " + a.proprietaireNom : ""}, j'aime beaucoup votre annonce "${a.titre || ""}" sur MALAGA ❤️`;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texte)}`, "_blank");
}

async function synchroniserLikeFirestore(a, ajout) {
  if (!a.id || !db) return;

  const user = auth.currentUser;
  const identifiant = user ? user.uid : idVisiteur();
  const likeId = `${a.id}_${identifiant}`;
  const likeRef = doc(db, "likes", likeId);
  const annonceRef = doc(db, "annonces", a.id);

  if (ajout) {
    let nomAffiche = "Un visiteur";
    if (user) {
      const profil = await getProfil(user.uid).catch(() => null);
      nomAffiche = profil?.nom || user.email || "Un visiteur";
    }

    await setDoc(likeRef, {
      annonceId: a.id,
      proprietaireId: a.proprietaireId || null,
      utilisateurId: user ? user.uid : null,
      nomAffiche,
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
  } else {
    await deleteDoc(likeRef).catch(() => {});
    await updateDoc(annonceRef, { nbLikes: increment(-1) }).catch(() => {});
  }
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

/* ══════════ INITIALISATION GÉNÉRALE ══════════ */
document.addEventListener("DOMContentLoaded", () => {
  initDrawer();
  initAuthUI();
  majBadgeFavoris();
  initScrollNav();

  // Marque l'onglet actif de la barre basse selon la page courante
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".bn-item[data-page]").forEach(el => {
    el.classList.toggle("actif", el.dataset.page === page);
  });
});
