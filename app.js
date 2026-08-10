/* ═══════════════════════════════════════════
   MALAGA — app.js (page publique)
   Liste + carte Leaflet synchronisées en temps réel avec Firestore
═══════════════════════════════════════════ */

import {
  auth, db, onAuthStateChanged, signOut,
  collection, query, where, orderBy, onSnapshot, doc, updateDoc, increment
} from "./firebase-config.js";
import { getProfil } from "./auth.js";
import {
  COMMUNES, ARRONDISSEMENTS, TYPES_BIEN, LIBREVILLE_CENTER, getIconeType, formatPrix
} from "./malaga-reference.js";

let toutesLesAnnonces = [];
let filtres = { commune: "", arrondissement: "", type: "", prixMax: "", texte: "" };
let map, markersParId = {};

/* ══════════ NAVIGATION SELON L'ÉTAT DE CONNEXION ══════════ */
onAuthStateChanged(auth, async (user) => {
  const nav = document.getElementById("navActions");
  if (!user) {
    nav.innerHTML = `
      <a href="connexion.html" class="btn btn-blanc">Se connecter</a>
      <a href="connexion.html?inscription=1&role=proprietaire" class="btn btn-jaune">➕ Publier une annonce</a>
    `;
    return;
  }
  const profil = await getProfil(user.uid);
  if (profil?.role === "proprietaire") {
    nav.innerHTML = `
      <a href="mes-annonces.html" class="btn btn-blanc">🏠 Mes annonces</a>
      <a href="publier.html" class="btn btn-jaune">➕ Publier</a>
      <button class="btn btn-blanc" id="btnDeconnexion">Déconnexion</button>
    `;
  } else {
    nav.innerHTML = `
      <span class="btn btn-blanc" style="cursor:default;">👋 ${profil?.nom || "Bonjour"}</span>
      <button class="btn btn-blanc" id="btnDeconnexion">Déconnexion</button>
    `;
  }
  document.getElementById("btnDeconnexion")?.addEventListener("click", () => signOut(auth));
});

/* ══════════ INITIALISATION ══════════ */
document.addEventListener("DOMContentLoaded", () => {
  initCarte();
  initFiltres();
  ecouterAnnoncesTempsReel();

  document.getElementById("btnRechercher").onclick = () => {
    filtres.texte = document.getElementById("search-input").value.trim().toLowerCase();
    rendreTout();
  };
  document.getElementById("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btnRechercher").click();
  });
});

/* ══════════ CARTE LEAFLET ══════════ */
function initCarte() {
  map = L.map("carteMap").setView([LIBREVILLE_CENTER.lat, LIBREVILLE_CENTER.lng], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; contributeurs OpenStreetMap",
    maxZoom: 19
  }).addTo(map);
}

function iconMarqueur(annonce) {
  const classe = annonce.statut === "disponible" ? "marker-prix" : "marker-prix occupe";
  return L.divIcon({
    className: "",
    html: `<div class="${classe}">${Math.round(annonce.prix / 1000)}k</div>`,
    iconSize: null
  });
}

/* ══════════ ÉCOUTE TEMPS RÉEL FIRESTORE ══════════
   Les annonces marquées "occupé" disparaissent automatiquement de la liste publique. */
function ecouterAnnoncesTempsReel() {
  const q = query(
    collection(db, "annonces"),
    where("statut", "==", "disponible"),
    orderBy("dateCreation", "desc")
  );
  onSnapshot(q, (snap) => {
    toutesLesAnnonces = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rendreTout();
    mettreAJourStats();
  }, (err) => {
    console.error("Erreur de synchronisation :", err);
    document.getElementById("liste-annonces").innerHTML =
      `<p class="spinner">Impossible de charger les annonces pour le moment.</p>`;
  });
}

/* ══════════ FILTRES ══════════ */
function initFiltres() {
  const selectCommune = document.getElementById("filterCommune");
  const selectArrondissement = document.getElementById("filterArrondissement");
  const selectType = document.getElementById("filterType");
  const selectPrix = document.getElementById("filterPrix");

  selectCommune.innerHTML += COMMUNES.map(c => `<option>${c}</option>`).join("");
  selectType.innerHTML += TYPES_BIEN.map(t => `<option>${t}</option>`).join("");

  selectCommune.onchange = () => {
    filtres.commune = selectCommune.value;
    filtres.arrondissement = "";
    const liste = ARRONDISSEMENTS[filtres.commune] || [];
    selectArrondissement.innerHTML = '<option value="">Tous les arrondissements</option>' +
      liste.map(a => `<option>${a}</option>`).join("");
    rendreTout();
  };
  selectArrondissement.onchange = () => { filtres.arrondissement = selectArrondissement.value; rendreTout(); };
  selectType.onchange = () => { filtres.type = selectType.value; rendreTout(); };
  selectPrix.onchange = () => { filtres.prixMax = selectPrix.value; rendreTout(); };
}

function appliquerFiltres(liste) {
  return liste.filter(a => {
    const okCommune = !filtres.commune || a.commune === filtres.commune;
    const okArr = !filtres.arrondissement || a.arrondissement === filtres.arrondissement;
    const okType = !filtres.type || a.type === filtres.type;
    const okPrix = !filtres.prixMax || a.prix <= parseInt(filtres.prixMax);
    const okTexte = !filtres.texte ||
      (a.titre || "").toLowerCase().includes(filtres.texte) ||
      (a.quartier || "").toLowerCase().includes(filtres.texte) ||
      (a.arrondissement || "").toLowerCase().includes(filtres.texte) ||
      (a.commune || "").toLowerCase().includes(filtres.texte);
    return okCommune && okArr && okType && okPrix && okTexte;
  });
}

/* ══════════ RENDU LISTE + CARTE ══════════ */
function rendreTout() {
  const filtrees = appliquerFiltres(toutesLesAnnonces);
  rendreListe(filtrees);
  rendreMarqueurs(filtrees);
  document.getElementById("count-annonces").textContent = `${filtrees.length} annonce(s)`;
}

function rendreListe(liste) {
  const container = document.getElementById("liste-annonces");
  container.innerHTML = "";

  if (liste.length === 0) {
    container.innerHTML = `<p class="spinner">Aucune annonce trouvée. Modifiez vos critères.</p>`;
    return;
  }

  liste.forEach(a => {
    const carte = document.createElement("div");
    carte.className = "carte-annonce";
    carte.id = `carte-${a.id}`;
    const photo = a.photos && a.photos[0];
    carte.innerHTML = `
      <div class="visuel">
        ${photo ? `<img src="${photo}" alt="${a.titre}">` : getIconeType(a.type)}
        <span class="badge badge-disponible" style="position:absolute;top:8px;right:8px;">🟢 Disponible</span>
      </div>
      <div class="carte-info">
        <h3>${a.titre}</h3>
        <div class="prix">${formatPrix(a.prix)}</div>
        <div class="localisation">📍 ${a.quartier || ""}${a.quartier ? " — " : ""}${a.arrondissement || ""}, ${a.commune || ""}</div>
      </div>
    `;
    carte.onclick = () => afficherDetail(a);
    carte.addEventListener("mouseenter", () => survolerMarqueur(a.id, true));
    carte.addEventListener("mouseleave", () => survolerMarqueur(a.id, false));
    container.appendChild(carte);
  });
}

function rendreMarqueurs(liste) {
  Object.values(markersParId).forEach(m => map.removeLayer(m));
  markersParId = {};

  const bounds = [];
  liste.forEach(a => {
    if (typeof a.lat !== "number" || typeof a.lng !== "number") return;
    const marker = L.marker([a.lat, a.lng], { icon: iconMarqueur(a) }).addTo(map);
    marker.bindPopup(`
      <div class="popup-annonce">
        <h4>${a.titre}</h4>
        <div class="prix">${formatPrix(a.prix)}</div>
        <div style="font-size:11px;color:#888;">📍 ${a.quartier || ""} — ${a.arrondissement || ""}, ${a.commune || ""}</div>
      </div>
    `);
    marker.on("click", () => afficherDetail(a));
    markersParId[a.id] = marker;
    bounds.push([a.lat, a.lng]);
  });

  if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
}

function survolerMarqueur(id, actif) {
  const marker = markersParId[id];
  if (marker) marker.getElement()?.classList.toggle("survolee", actif);
  document.getElementById(`carte-${id}`)?.classList.toggle("survolee", actif);
}

/* ══════════ MODAL DÉTAIL ══════════ */
function afficherDetail(a) {
  const modal = document.getElementById("detailModal");
  const panneau = document.getElementById("detailPanneau");
  const numeroWhatsApp = (a.whatsapp || a.tel || "").replace(/[^\d]/g, "");

  panneau.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--vert) 0%,var(--vert-fonce) 100%);padding:24px 20px;color:#fff;position:relative;">
      <button id="fermerModal" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,.25);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
      <div style="font-size:44px;margin-bottom:6px;">${getIconeType(a.type)}</div>
      <h2 style="font-size:18px;font-weight:800;padding-right:36px;">${a.titre}</h2>
      <div style="font-size:21px;font-weight:900;color:var(--jaune);margin-top:4px;">${formatPrix(a.prix)}</div>
      <div style="opacity:.9;font-size:13px;margin-top:2px;">📍 ${a.quartier || ""} — ${a.arrondissement || ""}, ${a.commune || ""}</div>
    </div>
    <div style="padding:20px;">
      ${a.photos && a.photos.length ? `
        <div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:16px;">
          ${a.photos.map(p => `<img src="${p}" style="height:130px;border-radius:10px;flex-shrink:0;">`).join("")}
        </div>` : ""}
      ${a.video ? `<video src="${a.video}" controls style="width:100%;border-radius:10px;margin-bottom:16px;"></video>` : ""}

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
        ${a.chambres ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🛏️ ${a.chambres}</div><div style="font-size:11px;color:#666;">Chambres</div></div>` : ""}
        ${a.sdb ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🚿 ${a.sdb}</div><div style="font-size:11px;color:#666;">S. bain</div></div>` : ""}
        ${a.surface ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">📐 ${a.surface}</div><div style="font-size:11px;color:#666;">m²</div></div>` : ""}
      </div>

      <div style="margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">Description</h3>
        <p style="font-size:13px;color:#666;">${a.description || "Aucune description."}</p>
      </div>

      <div style="margin-bottom:16px;font-size:13px;color:#444;">
        ${a.cloture ? "✓ Clôturé &nbsp;" : ""}${a.eau ? `✓ Eau : ${a.eau} &nbsp;` : ""}${a.electricite ? `✓ Électricité : ${a.electricite}` : ""}
        ${a.compteur ? `<br>✓ Compteur ${a.compteur}` : ""}
        ${a.etat ? `<br>✓ État du bâtiment : ${a.etat}` : ""}
      </div>

      ${a.equipements && a.equipements.length ? `
        <div style="margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">Équipements</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${a.equipements.map(e => `<span style="background:#E8F5EE;color:var(--vert);padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">✓ ${e}</span>`).join("")}
          </div>
        </div>` : ""}

      <div style="background:#f5f5f5;padding:16px;border-radius:12px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Contacter le propriétaire</h3>
        <div style="font-size:13px;margin-bottom:10px;"><strong>${a.proprietaireNom || ""}</strong></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${numeroWhatsApp ? `<a href="https://wa.me/${numeroWhatsApp}" target="_blank" class="btn btn-vert">💬 WhatsApp</a>` : ""}
          ${a.proprietaireTel ? `<a href="tel:${a.proprietaireTel}" class="btn btn-bleu">📞 Appeler</a>` : ""}
          ${a.proprietaireEmail ? `<a href="mailto:${a.proprietaireEmail}" class="btn btn-outline">✉️ Email</a>` : ""}
        </div>
      </div>
    </div>
  `;
  modal.classList.add("ouverte");
  document.getElementById("fermerModal").onclick = () => modal.classList.remove("ouverte");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("ouverte"); };

  // Comptage des vues, best-effort (n'empêche pas l'affichage si ça échoue)
  updateDoc(doc(db, "annonces", a.id), { vues: increment(1) }).catch(() => {});
}

/* ══════════ STATISTIQUES ══════════ */
function mettreAJourStats() {
  const zones = new Set(toutesLesAnnonces.map(a => `${a.commune}|${a.arrondissement}`).filter(Boolean)).size;
  const uneSemaine = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentes = toutesLesAnnonces.filter(a => a.dateCreation?.toMillis?.() > uneSemaine).length;

  document.getElementById("statDisponibles").textContent = toutesLesAnnonces.length;
  document.getElementById("statZones").textContent = zones;
  document.getElementById("statAujourdhui").textContent = recentes;
}
