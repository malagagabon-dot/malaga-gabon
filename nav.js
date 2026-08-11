/* ═══════════════════════════════════════════
   MALAGA — nav.js
   Logique partagée du header compact, du menu latéral (drawer)
   et de la barre de navigation basse, utilisée par toutes les pages.
═══════════════════════════════════════════ */

import { auth, onAuthStateChanged, signOut } from "./firebase-config.js";
import { getProfil } from "./auth.js";

/* ══════════ FAVORIS (stockage local) ══════════ */
const CLE_FAVORIS = "malaga_favoris";

export function getFavoris() {
  try { return JSON.parse(localStorage.getItem(CLE_FAVORIS)) || []; }
  catch { return []; }
}

export function estFavori(id) {
  return getFavoris().includes(id);
}

export function toggleFavori(id) {
  const favoris = getFavoris();
  const idx = favoris.indexOf(id);
  if (idx === -1) favoris.push(id); else favoris.splice(idx, 1);
  localStorage.setItem(CLE_FAVORIS, JSON.stringify(favoris));
  majBadgeFavoris();
  return favoris.includes(id);
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

/* ══════════ ÉTAT DE CONNEXION → AVATAR, DRAWER, BARRE BASSE ══════════ */
function initAuthUI() {
  onAuthStateChanged(auth, async (user) => {
    const avatar = document.getElementById("btnCompte");
    const drawerConnexion = document.getElementById("drawerConnexion");
    const drawerProprio = document.getElementById("drawerProprio");
    const bnProfilLabel = document.getElementById("bnProfilLabel");
    const bnProfilLien = document.getElementById("bnProfil");

    if (!user) {
      if (avatar) { avatar.textContent = "👤"; avatar.href = "connexion.html"; avatar.classList.remove("avatar-initiales"); }
      if (drawerConnexion) { drawerConnexion.textContent = "👤 Se connecter"; drawerConnexion.href = "connexion.html"; }
      if (drawerProprio) drawerProprio.style.display = "none";
      if (bnProfilLabel) bnProfilLabel.textContent = "Profil";
      if (bnProfilLien) bnProfilLien.href = "connexion.html";
      return;
    }

    const profil = await getProfil(user.uid);
    const nom = profil?.nom || "Mon compte";
    if (avatar) {
      avatar.textContent = initiales(nom);
      avatar.classList.add("avatar-initiales");
      avatar.href = profil?.role === "proprietaire" ? "mes-annonces.html" : "index.html";
    }
    if (drawerConnexion) { drawerConnexion.textContent = "🚪 Se déconnecter"; drawerConnexion.href = "#"; drawerConnexion.onclick = (e) => { e.preventDefault(); signOut(auth); }; }
    if (drawerProprio) drawerProprio.style.display = profil?.role === "proprietaire" ? "block" : "none";
    if (bnProfilLabel) bnProfilLabel.textContent = nom.split(" ")[0];
    if (bnProfilLien) bnProfilLien.href = profil?.role === "proprietaire" ? "mes-annonces.html" : "connexion.html";
  });
}

/* ══════════ INITIALISATION GÉNÉRALE ══════════ */
document.addEventListener("DOMContentLoaded", () => {
  initDrawer();
  initAuthUI();
  majBadgeFavoris();

  // Marque l'onglet actif de la barre basse selon la page courante
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".bn-item[data-page]").forEach(el => {
    el.classList.toggle("actif", el.dataset.page === page);
  });
});
