/* ═══════════════════════════════════════════
   MALAGA — app.js (page publique)
   Liste + carte Leaflet synchronisées en temps réel avec Firestore
═══════════════════════════════════════════ */

import {
  auth, db,
  onAuthStateChanged,
  collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, increment, serverTimestamp
} from "./firebase-config.js";
import { getProfil } from "./auth.js";
import {
  COMMUNES, ARRONDISSEMENTS, TYPES_BIEN, LIBREVILLE_CENTER, getIconeType, formatPrix,
  ZONES_CARACTERE, MATERIAUX, CUISINE_TYPES, DOUCHE_TYPES, COULEURS_MURALES,
  EQUIPEMENTS, PALIERS_PIECES
} from "./malaga-reference.js";
import { estFavori, toggleFavori } from "./nav.js";

let utilisateurCourant = null;
let profilCourant = null;
let mesDemandesVisite = []; // demandesVisite de l'utilisateur connecté, par annonceId

onAuthStateChanged(auth, async (user) => {
  utilisateurCourant = user;
  profilCourant = user ? await getProfil(user.uid) : null;
  if (user) {
    onSnapshot(query(collection(db, "demandesVisite"), where("chercheurId", "==", user.uid)), (snap) => {
      mesDemandesVisite = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    });
  } else {
    mesDemandesVisite = [];
  }
});

let toutesLesAnnonces = [];
let filtres = {
  commune: "", arrondissement: "", type: "", prixMax: "", texte: "",
  // Filtres avancés
  quartier: "", rue: "", zone: "", presLocalisation: false,
  chambresMin: "", salonsMin: "", douchesMin: "", doucheType: "", cuisineType: "",
  materiau: "", couleur: "", terrasse: "", carreaux: "",
  prixMin: "", prixMaxAvance: "", equipements: []
};
let modeFavoris = false;
let map, markersParId = {};
let positionUtilisateur = null; // { lat, lng } — utilisée pour le tri "près de moi"

/* ══════════ INITIALISATION ══════════ */
document.addEventListener("DOMContentLoaded", () => {
  initCarte();
  initFiltres();
  initFiltresAvances();
  initVueModes();
  initReservationVisite();
  ecouterAnnoncesTempsReel();

  document.getElementById("btnRechercher").onclick = () => {
    filtres.texte = document.getElementById("search-input").value.trim().toLowerCase();
    rendreTout();
  };
  document.getElementById("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btnRechercher").click();
  });

  // Bascule vers l'affichage "Mes favoris uniquement" depuis le header ou la barre basse
  const basculerFavoris = (e) => {
    e.preventDefault();
    modeFavoris = !modeFavoris;
    document.querySelectorAll("#bnFavoris, #btnFavorisHeader").forEach(el => el.classList.toggle("actif", modeFavoris));
    rendreTout();
  };
  document.getElementById("btnFavorisHeader")?.addEventListener("click", basculerFavoris);
  document.getElementById("bnFavoris")?.addEventListener("click", basculerFavoris);
  document.getElementById("drawerFavorisLink")?.addEventListener("click", basculerFavoris);
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
    document.getElementById("liste-annonces-grille").innerHTML =
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
  const resultat = liste.filter(a => {
    const okCommune = !filtres.commune || a.commune === filtres.commune;
    const okArr = !filtres.arrondissement || a.arrondissement === filtres.arrondissement;
    const okType = !filtres.type || a.type === filtres.type;
    const okPrix = !filtres.prixMax || a.prix <= parseInt(filtres.prixMax);
    const okTexte = !filtres.texte ||
      (a.titre || "").toLowerCase().includes(filtres.texte) ||
      (a.quartier || "").toLowerCase().includes(filtres.texte) ||
      (a.arrondissement || "").toLowerCase().includes(filtres.texte) ||
      (a.commune || "").toLowerCase().includes(filtres.texte);
    const okFavoris = !modeFavoris || estFavori(a.id);

    // ══ Filtres avancés ══
    const okQuartier = !filtres.quartier || (a.quartier || "").toLowerCase().includes(filtres.quartier);
    const okRue = !filtres.rue || (a.pointRepere || "").toLowerCase().includes(filtres.rue);
    const okZone = !filtres.zone || a.zoneCaractere === filtres.zone;
    const okChambres = !filtres.chambresMin || (a.chambres || 0) >= parseInt(filtres.chambresMin);
    const okSalons = !filtres.salonsMin || (a.salons || 0) >= parseInt(filtres.salonsMin);
    const okDouches = !filtres.douchesMin || (a.douches || a.sdb || 0) >= parseInt(filtres.douchesMin);
    const okDoucheType = !filtres.doucheType || a.doucheType === filtres.doucheType;
    const okCuisineType = !filtres.cuisineType || a.cuisineType === filtres.cuisineType;
    const okMateriau = !filtres.materiau || a.materiau === filtres.materiau;
    const okCouleur = !filtres.couleur || a.couleurMurale === filtres.couleur;
    const okTerrasse = !filtres.terrasse || (filtres.terrasse === "oui" ? !!a.terrasse : !a.terrasse);
    const okCarreaux = !filtres.carreaux || (filtres.carreaux === "oui" ? !!a.carreaux : !a.carreaux);
    const okPrixMin = !filtres.prixMin || a.prix >= parseInt(filtres.prixMin);
    const okPrixMaxAv = !filtres.prixMaxAvance || a.prix <= parseInt(filtres.prixMaxAvance);
    const okEquipements = !filtres.equipements.length ||
      filtres.equipements.every(e => (a.equipements || []).includes(e));

    return okCommune && okArr && okType && okPrix && okTexte && okFavoris &&
      okQuartier && okRue && okZone && okChambres && okSalons && okDouches &&
      okDoucheType && okCuisineType && okMateriau && okCouleur && okTerrasse &&
      okCarreaux && okPrixMin && okPrixMaxAv && okEquipements;
  });

  // Tri "près de moi" si activé et position disponible
  if (filtres.presLocalisation && positionUtilisateur) {
    resultat.sort((a, b) => {
      if (typeof a.lat !== "number" || typeof a.lng !== "number") return 1;
      if (typeof b.lat !== "number" || typeof b.lng !== "number") return -1;
      return distanceKm(positionUtilisateur, a) - distanceKm(positionUtilisateur, b);
    });
  }

  return resultat;
}

function distanceKm(pos, annonce) {
  const R = 6371;
  const dLat = (annonce.lat - pos.lat) * Math.PI / 180;
  const dLng = (annonce.lng - pos.lng) * Math.PI / 180;
  const lat1 = pos.lat * Math.PI / 180, lat2 = annonce.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ══════════ FILTRE AVANCÉ (tiroir) ══════════ */
function initFiltresAvances() {
  const $ = (id) => document.getElementById(id);
  const remplir = (id, liste, placeholder) => {
    $(id).innerHTML = `<option value="">${placeholder}</option>` + liste.map(v => `<option>${v}</option>`).join("");
  };

  remplir("faZone", ZONES_CARACTERE, "Indifférent");
  remplir("faDoucheType", DOUCHE_TYPES, "Indifférent");
  remplir("faCuisineType", CUISINE_TYPES, "Indifférent");
  remplir("faMateriau", MATERIAUX, "Indifférent");
  remplir("faCouleur", COULEURS_MURALES, "Indifférente");

  const optionsPaliers = '<option value="">Indifférent</option>' +
    PALIERS_PIECES.map(n => `<option value="${n}">${n}+</option>`).join("");
  $("faChambres").innerHTML = optionsPaliers;
  $("faSalons").innerHTML = optionsPaliers;
  $("faDouches").innerHTML = optionsPaliers;

  $("faEquipements").innerHTML = EQUIPEMENTS.map(e => `<div class="chip" data-val="${e}">${e}</div>`).join("");
  $("faEquipements").querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => chip.classList.toggle("actif"));
  });

  // Panneau en ligne, replié par défaut — un clic sur l'en-tête le déplie/replie
  const panneau = $("filtresAvancesPanel");
  const fleche = $("faFleche");
  const basculer = () => {
    const replie = panneau.classList.toggle("replie");
    $("btnFiltresAvances").setAttribute("aria-expanded", String(!replie));
    fleche.setAttribute("aria-label", replie ? "Déplier" : "Réduire");
  };
  $("btnFiltresAvances").onclick = basculer;

  $("faPresLocalisation").onchange = (e) => {
    if (e.target.checked && !positionUtilisateur && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { positionUtilisateur = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => { alert("Impossible de récupérer votre position."); e.target.checked = false; }
      );
    }
  };

  $("btnAppliquerFiltres").onclick = () => {
    filtres.quartier = $("faQuartier").value.trim().toLowerCase();
    filtres.rue = $("faRue").value.trim().toLowerCase();
    filtres.zone = $("faZone").value;
    filtres.presLocalisation = $("faPresLocalisation").checked;
    filtres.chambresMin = $("faChambres").value;
    filtres.salonsMin = $("faSalons").value;
    filtres.douchesMin = $("faDouches").value;
    filtres.doucheType = $("faDoucheType").value;
    filtres.cuisineType = $("faCuisineType").value;
    filtres.materiau = $("faMateriau").value;
    filtres.couleur = $("faCouleur").value;
    filtres.terrasse = $("faTerrasse").value;
    filtres.carreaux = $("faCarreaux").value;
    filtres.prixMin = $("faPrixMin").value;
    filtres.prixMaxAvance = $("faPrixMax").value;
    filtres.equipements = Array.from($("faEquipements").querySelectorAll(".chip.actif")).map(c => c.dataset.val);

    mettreAJourBadgeFiltres();
    rendreTout();
  };

  $("btnReinitialiserFiltres").onclick = () => {
    ["faQuartier", "faRue", "faPrixMin", "faPrixMax"].forEach(id => $(id).value = "");
    ["faZone", "faChambres", "faSalons", "faDouches", "faDoucheType", "faCuisineType",
      "faMateriau", "faCouleur", "faTerrasse", "faCarreaux"].forEach(id => $(id).value = "");
    $("faPresLocalisation").checked = false;
    $("faEquipements").querySelectorAll(".chip.actif").forEach(c => c.classList.remove("actif"));

    Object.assign(filtres, {
      quartier: "", rue: "", zone: "", presLocalisation: false,
      chambresMin: "", salonsMin: "", douchesMin: "", doucheType: "", cuisineType: "",
      materiau: "", couleur: "", terrasse: "", carreaux: "",
      prixMin: "", prixMaxAvance: "", equipements: []
    });
    mettreAJourBadgeFiltres();
    rendreTout();
  };
}

/* ══════════ MODE D'AFFICHAGE (grande / moyenne / compacte / liste) ══════════ */
function initVueModes() {
  const grille = document.getElementById("liste-annonces-grille");
  const boutons = document.querySelectorAll("#vueModes button");
  const modeSauvegarde = localStorage.getItem("malaga_vue_mode") || "moyenne";

  const appliquerVue = (mode) => {
    grille.classList.remove("vue-grande", "vue-moyenne", "vue-compacte", "vue-liste");
    grille.classList.add(`vue-${mode}`);
    grille.dataset.vueManuelle = "1";
    grille.style.removeProperty("--tile-min");
    grille.style.removeProperty("--tile-img-h");
    boutons.forEach(b => b.classList.toggle("actif", b.dataset.vue === mode));
    localStorage.setItem("malaga_vue_mode", mode);
  };

  boutons.forEach(b => b.addEventListener("click", () => appliquerVue(b.dataset.vue)));
  appliquerVue(modeSauvegarde);
}

function mettreAJourBadgeFiltres() {
  const cles = ["quartier", "rue", "zone", "chambresMin", "salonsMin", "douchesMin",
    "doucheType", "cuisineType", "materiau", "couleur", "terrasse", "carreaux", "prixMin", "prixMaxAvance"];
  let n = cles.filter(c => filtres[c]).length + (filtres.presLocalisation ? 1 : 0) + filtres.equipements.length;
  const badge = document.getElementById("badgeFiltresActifs");
  badge.hidden = n === 0;
  badge.textContent = n;
}

/* ══════════ RENDU LISTE + CARTE ══════════ */
function rendreTout() {
  const filtrees = appliquerFiltres(toutesLesAnnonces);
  rendreListe(filtrees);
  rendreMarqueurs(filtrees);
  document.getElementById("count-annonces").textContent = `${filtrees.length} annonce(s)`;
}

function rendreListe(liste) {
  const container = document.getElementById("liste-annonces-grille");
  container.innerHTML = "";

  if (liste.length === 0) {
    container.innerHTML = modeFavoris
      ? `<div class="etat-vide"><div class="icone">💔</div><p>Aucun favori pour le moment.<br>Touchez le cœur d'une annonce pour l'ajouter ici.</p></div>`
      : `<p class="spinner">Aucune annonce trouvée. Modifiez vos critères.</p>`;
    return;
  }

  liste.forEach(a => {
    const carte = document.createElement("div");
    carte.className = "carte-annonce";
    carte.id = `carte-${a.id}`;
    const photo = a.photos && a.photos[0];
    carte.innerHTML = `
      <div class="visuel">
        ${photo ? `<img src="${photo}" alt="${a.titre}" loading="lazy">` : getIconeType(a.type)}
        <button class="btn-favori ${estFavori(a.id) ? "actif" : ""}" data-id="${a.id}" aria-label="Ajouter aux favoris">${estFavori(a.id) ? "❤️" : "🤍"}</button>
        <span class="badge badge-disponible" style="position:absolute;top:8px;right:8px;">🟢 Disponible</span>
      </div>
      <div class="carte-info">
        <h3>${a.titre}<span class="type-tag">${a.type || ""}</span></h3>
        <div class="prix">${formatPrix(a.prix)}</div>
        <div class="localisation">📍 ${a.quartier || ""}${a.quartier ? " — " : ""}${a.arrondissement || ""}, ${a.commune || ""}</div>
      </div>
    `;
    carte.querySelector(".btn-favori").onclick = (e) => {
      e.stopPropagation();
      const actif = toggleFavori(a.id);
      e.currentTarget.classList.toggle("actif", actif);
      e.currentTarget.textContent = actif ? "❤️" : "🤍";
      if (modeFavoris && !actif) rendreTout();
    };
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
  const texteWhatsAppContact = encodeURIComponent(
    `Bonjour${a.proprietaireNom ? " " + a.proprietaireNom : ""}, je suis intéressé(e) par votre annonce "${a.titre}" (${formatPrix(a.prix)}) sur MALAGA. Pouvez-vous me préciser les modalités de paiement du loyer ?`
  );

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
        ${a.salons ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🛋️ ${a.salons}</div><div style="font-size:11px;color:#666;">Salons</div></div>` : ""}
        ${a.sdb ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🚿 ${a.sdb}</div><div style="font-size:11px;color:#666;">S. bain</div></div>` : ""}
        ${a.surface ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">📐 ${a.surface}</div><div style="font-size:11px;color:#666;">m²</div></div>` : ""}
      </div>

      <div style="margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">Description</h3>
        <p style="font-size:13px;color:#666;">${a.description || "Aucune description."}</p>
      </div>

      <div style="margin-bottom:16px;font-size:13px;color:#444;line-height:1.9;">
        ${a.cloture ? "✓ Clôturé &nbsp;" : ""}${a.eau ? `✓ Eau : ${a.eau} &nbsp;` : ""}${a.electricite ? `✓ Électricité : ${a.electricite}` : ""}
        ${a.compteur ? `<br>✓ Compteur ${a.compteur}` : ""}
        ${a.etat ? `<br>✓ État du bâtiment : ${a.etat}` : ""}
        ${a.materiau ? `<br>✓ Matériau : ${a.materiau}` : ""}
        ${a.couleurMurale ? ` &nbsp;✓ Peinture murale : ${a.couleurMurale}` : ""}
        ${a.cuisineType ? `<br>✓ Cuisine ${a.cuisineType.toLowerCase()}` : ""}
        ${a.doucheType ? ` &nbsp;✓ Douche ${a.doucheType.toLowerCase()}` : ""}
        ${a.terrasse ? "<br>✓ Terrasse" : ""}${a.carreaux ? " &nbsp;✓ Sol carrelé" : ""}
        ${a.zoneCaractere ? `<br>✓ Zone : ${a.zoneCaractere}` : ""}
        ${a.pointRepere ? `<br>✓ Repère : ${a.pointRepere}` : ""}
      </div>

      ${a.equipements && a.equipements.length ? `
        <div style="margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">Équipements</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${a.equipements.map(e => `<span style="background:#E8F5EE;color:var(--vert);padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">✓ ${e}</span>`).join("")}
          </div>
        </div>` : ""}

      <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin-bottom:16px;" id="blocReservationVisite"></div>

      <div style="background:#f5f5f5;padding:16px;border-radius:12px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Contacter le propriétaire</h3>
        <div style="font-size:13px;margin-bottom:10px;"><strong>${a.proprietaireNom || ""}</strong></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${numeroWhatsApp ? `<a href="https://wa.me/${numeroWhatsApp}?text=${texteWhatsAppContact}" target="_blank" class="btn btn-vert">💬 WhatsApp</a>` : ""}
          ${a.proprietaireTel ? `<a href="tel:${a.proprietaireTel}" class="btn btn-bleu">📞 Appeler</a>` : ""}
          ${a.proprietaireEmail ? `<a href="mailto:${a.proprietaireEmail}" class="btn btn-outline">✉️ Email</a>` : ""}
        </div>
      </div>
    </div>
  `;
  modal.classList.add("ouverte");
  document.getElementById("fermerModal").onclick = () => modal.classList.remove("ouverte");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("ouverte"); };
  rendreBlocReservation(a);

  // Comptage des vues, best-effort (n'empêche pas l'affichage si ça échoue)
  updateDoc(doc(db, "annonces", a.id), { vues: increment(1) }).catch(() => {});
}

/* ══════════ RÉSERVATION DE VISITE (gratuite, via WhatsApp) ══════════
   Le chercheur propose une date/heure ; la demande est écrite dans Firestore
   (demandesVisite) ET envoyée par WhatsApp au propriétaire avec un lien vers
   son panneau accepter/refuser sur profil.html. */
function rendreBlocReservation(a) {
  const bloc = document.getElementById("blocReservationVisite");
  if (!bloc) return;

  if (a.statutReservation === "reserve") {
    bloc.innerHTML = `
      <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">📅 Visite</h3>
      <p style="font-size:13px;color:#666;">Ce bien fait déjà l'objet d'une visite programmée. Réessayez plus tard s'il redevient disponible.</p>`;
    return;
  }

  const demandeExistante = mesDemandesVisite.find(d => d.annonceId === a.id && ["en_attente", "confirmee"].includes(d.statut));
  if (demandeExistante) {
    const labels = { en_attente: "🟡 En attente de réponse du propriétaire", confirmee: "🔵 Visite programmée" };
    bloc.innerHTML = `
      <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">📅 Votre demande de visite</h3>
      <p style="font-size:13px;color:#444;">${labels[demandeExistante.statut]}</p>
      <p style="font-size:12px;color:#666;margin-top:4px;">Suivez son statut dans votre <a href="profil.html" style="color:var(--vert);font-weight:700;">profil</a>.</p>`;
    return;
  }

  bloc.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">📅 Réserver une visite</h3>
    <p style="font-size:12.5px;color:#666;margin-bottom:10px;">C'est gratuit. Proposez une date et une heure : votre demande part directement au propriétaire par WhatsApp.</p>
    <button type="button" class="btn btn-jaune" id="btnOuvrirReservation" style="width:100%;">📅 Réserver une visite</button>
  `;
  document.getElementById("btnOuvrirReservation").onclick = () => ouvrirModalReservation(a);
}

function ouvrirModalReservation(a) {
  if (!utilisateurCourant) {
    if (confirm("Vous devez être connecté pour réserver une visite. Aller à la page de connexion ?")) {
      window.location.href = "connexion.html";
    }
    return;
  }

  document.getElementById("resaAnnonceTitre").textContent = a.titre;
  document.getElementById("formReservation").reset();
  document.getElementById("resaErreur").classList.remove("visible");
  document.getElementById("resaSucces").classList.remove("visible");
  document.getElementById("formReservation").style.display = "block";
  const champDate = document.getElementById("resaDate");
  if (champDate) champDate.min = new Date().toISOString().split("T")[0];

  const modal = document.getElementById("reservationModal");
  modal.classList.add("ouverte");
  modal.dataset.annonceId = a.id;
  modal.dataset.annonceTitre = a.titre;
  modal.dataset.annoncePrix = a.prix ?? "";
  modal.dataset.proprietaireId = a.proprietaireId || "";
  modal.dataset.proprietaireNom = a.proprietaireNom || "";
  modal.dataset.proprietaireWhatsapp = (a.whatsapp || a.tel || "").replace(/[^\d]/g, "");
}

function initReservationVisite() {
  document.getElementById("fermerReservation")?.addEventListener("click", () => {
    document.getElementById("reservationModal").classList.remove("ouverte");
  });
  document.getElementById("reservationModal")?.addEventListener("click", (e) => {
    if (e.target.id === "reservationModal") document.getElementById("reservationModal").classList.remove("ouverte");
  });

  document.getElementById("formReservation")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erreurEl = document.getElementById("resaErreur");
    const succesEl = document.getElementById("resaSucces");
    erreurEl.classList.remove("visible");
    succesEl.classList.remove("visible");

    const dateSouhaitee = document.getElementById("resaDate").value;
    const heureSouhaitee = document.getElementById("resaHeure").value;
    const message = document.getElementById("resaMessage").value.trim();

    if (!dateSouhaitee || !heureSouhaitee) {
      erreurEl.textContent = "❌ Merci d'indiquer une date et une heure.";
      erreurEl.classList.add("visible");
      return;
    }

    const modal = document.getElementById("reservationModal");
    const { annonceId, annonceTitre, annoncePrix, proprietaireId, proprietaireNom, proprietaireWhatsapp } = modal.dataset;
    const btn = document.getElementById("resaBtn");
    btn.disabled = true; btn.textContent = "⏳ Envoi...";

    try {
      const ref = await addDoc(collection(db, "demandesVisite"), {
        chercheurId: utilisateurCourant.uid,
        chercheurNom: profilCourant?.nom || "",
        chercheurTel: profilCourant?.tel || "",
        proprietaireId: proprietaireId || "",
        annonceId,
        annonceTitre,
        dateSouhaitee,
        heureSouhaitee,
        message,
        statut: "en_attente",
        dateCreation: serverTimestamp()
      });

      succesEl.textContent = proprietaireWhatsapp
        ? "✅ Demande envoyée ! Ouverture de WhatsApp pour prévenir le propriétaire…"
        : "✅ Demande envoyée ! Suivez sa réponse dans votre profil.";
      succesEl.classList.add("visible");
      document.getElementById("formReservation").style.display = "none";

      if (proprietaireWhatsapp) {
        const lienReponse = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}profil.html?demande=${ref.id}`;
        const dateLisible = new Date(`${dateSouhaitee}T${heureSouhaitee}`).toLocaleString("fr-FR", {
          weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
        });
        const texte = `Bonjour${proprietaireNom ? " " + proprietaireNom : ""}, je suis intéressé(e) par votre annonce "${annonceTitre}"${annoncePrix ? " (" + formatPrix(Number(annoncePrix)) + ")" : ""} sur MALAGA.\n📅 Je souhaite une visite le ${dateLisible}.${message ? "\n📝 " + message : ""}\n\n👉 Merci de confirmer ou refuser ce rendez-vous ici : ${lienReponse}`;
        window.open(`https://wa.me/${proprietaireWhatsapp}?text=${encodeURIComponent(texte)}`, "_blank");
      }

      setTimeout(() => modal.classList.remove("ouverte"), 2200);
    } catch (err) {
      console.error("Erreur envoi demande de visite :", err);
      erreurEl.textContent = "❌ Une erreur est survenue. Réessayez.";
      erreurEl.classList.add("visible");
    } finally {
      btn.disabled = false; btn.textContent = "📲 Envoyer via WhatsApp";
    }
  });
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
