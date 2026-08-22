/* ═══════════════════════════════════════════
   MALAGA — app.js (page publique)
   Liste + carte Leaflet synchronisées en temps réel avec Firestore
═══════════════════════════════════════════ */

import {
  auth, db,
  onAuthStateChanged,
  collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc, addDoc, increment, serverTimestamp
} from "./firebase-config.js";
import { getProfil } from "./auth.js";
import {
  COMMUNES, ARRONDISSEMENTS, TYPES_BIEN, LIBREVILLE_CENTER, CENTRES, getIconeType, formatPrix,
  ZONES_CARACTERE, MATERIAUX, CUISINE_TYPES, DOUCHE_TYPES, COULEURS_MURALES,
  EQUIPEMENTS, PALIERS_PIECES, escapeHTML, getBadgeVendeur
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
  commune: "", arrondissement: "", type: "", prixMax: "", texte: "", vendeur: "", disponibles: false, recentes: false, zoneSelectionnee: false,
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
  initCatalogues();
  ecouterAnnoncesTempsReel();
  ouvrirAnnonceDepuisURL();

  // Les 3 boutons statistiques de l'accueil appelaient jusqu'ici filtrerDisponibles()
  // etc. via des attributs onclick="..." en HTML — inopérants, car app.js est chargé
  // en type="module" et ses fonctions ne sont donc pas posées sur window par défaut.
  // On les relie ici, comme le reste des écouteurs de la page.
  document.getElementById("btnStatDisponibles")?.addEventListener("click", filtrerDisponibles);
  document.getElementById("btnStatZones")?.addEventListener("click", afficherZones);
  document.getElementById("btnStatRecentes")?.addEventListener("click", afficherPublicationsRecentes);

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

  // Redimensionner la carte quand la fenêtre est redimensionnée
  window.addEventListener("resize", () => {
    if (map) {
      setTimeout(() => map.invalidateSize(), 100);
    }
  });
});

/* ══════════ CARTE LEAFLET ══════════ */
function initCarte() {
  const carteWrap = document.getElementById("carteWrap");
  if (carteWrap && getComputedStyle(carteWrap).position === "static") {
    carteWrap.style.position = "relative";
  }

  // Initialiser la carte Leaflet (la taille est gérée entièrement par le CSS)
  map = L.map("carteMap").setView([LIBREVILLE_CENTER.lat, LIBREVILLE_CENTER.lng], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; contributeurs OpenStreetMap",
    maxZoom: 19
  }).addTo(map);

  // Forcer Leaflet à recalculer sa taille une fois le layout stabilisé
  setTimeout(() => { map && map.invalidateSize(); }, 150);
  window.addEventListener("load", () => { map && map.invalidateSize(); });
}

/* Recentre/zoome la carte sur la zone choisie dans les filtres (commune → arrondissement),
   même quand aucune annonce géolocalisée n'y correspond, pour que l'utilisateur voie
   toujours la zone qu'il a sélectionnée plutôt qu'une carte figée sur l'ancienne vue. */
function recentrerSurZoneFiltre() {
  let cible = LIBREVILLE_CENTER, zoom = 12;
  if (filtres.commune && CENTRES[filtres.commune]) {
    cible = CENTRES[filtres.commune];
    zoom = filtres.arrondissement ? Math.min(cible.zoom + 2, 16) : cible.zoom;
  }
  map.flyTo([cible.lat, cible.lng], zoom, { duration: 0.6 });
}

/* Message flottant sur la carte quand le filtrage courant ne donne aucun marqueur à afficher. */
function afficherMessageCarteVide(texte) {
  let el = document.getElementById("carteVideMsg");
  if (!el) {
    el = document.createElement("div");
    el.id = "carteVideMsg";
    el.style.cssText = "position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:500;background:rgba(255,255,255,.97);border:1px solid #eee;border-radius:10px;padding:8px 14px;font-size:12.5px;font-weight:600;color:#555;box-shadow:0 2px 10px rgba(0,0,0,.1);pointer-events:none;max-width:85%;text-align:center;";
    document.getElementById("carteWrap")?.appendChild(el);
  }
  if (texte) { el.textContent = "📍 " + texte; el.style.display = "block"; }
  else { el.style.display = "none"; }
}

/* Palier de couleur des bulles de prix sur la carte — cohérent avec la légende
   affichée sous la carte (#legendePrix) et avec les cartes stats de l'accueil. */
function palierPrix(prix) {
  if (prix < 100000) return "prix-t1";       // vert
  if (prix < 300000) return "prix-t2";       // bleu
  if (prix < 500000) return "prix-t3";       // orange
  return "prix-t4";                          // violet (haut de gamme)
}

function iconMarqueur(annonce) {
  const classe = annonce.statut === "disponible"
    ? `marker-prix ${palierPrix(annonce.prix)}`
    : "marker-prix occupe";
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
    construireCatalogues();
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
  const selectVendeur = document.getElementById("filterVendeur");
  const inputPrixExact = document.getElementById("filterPrixExact");

  selectCommune.innerHTML += COMMUNES.map(c => `<option>${c}</option>`).join("");
  selectType.innerHTML += TYPES_BIEN.map(t => `<option>${t}</option>`).join("");

  if (selectVendeur) {
    selectVendeur.onchange = () => { filtres.vendeur = selectVendeur.value; rendreTout(); };
  }

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
  if (inputPrixExact) {
    inputPrixExact.oninput = () => {
      filtres.prixExact = inputPrixExact.value;
      rendreTout();
    };
  }
}

function appliquerFiltres(liste) {
  const resultat = liste.filter(a => {
    const okCommune = !filtres.commune || a.commune === filtres.commune;
    const okArr = !filtres.arrondissement || a.arrondissement === filtres.arrondissement;
    const okType = !filtres.type || a.type === filtres.type;
    const okPrix = !filtres.prixMax || a.prix <= parseInt(filtres.prixMax);
    const okPrixExact = !filtres.prixExact || a.prix === parseInt(filtres.prixExact);
    const okDisponibles = !filtres.disponibles || !a.statut || a.statut.toLowerCase().includes("dispon");
    const okRecentes = !filtres.recentes || (a.dateCreation?.toMillis?.() > (Date.now() - 7 * 24 * 60 * 60 * 1000));
    const okTexte = !filtres.texte ||
      (a.titre || "").toLowerCase().includes(filtres.texte) ||
      (a.quartier || "").toLowerCase().includes(filtres.texte) ||
      (a.arrondissement || "").toLowerCase().includes(filtres.texte) ||
      (a.commune || "").toLowerCase().includes(filtres.texte);
    const okFavoris = !modeFavoris || estFavori(a.id);
    const okVendeur = !filtres.vendeur || (filtres.vendeur === "entreprise"
      ? a.proprietaireCompteType === "entreprise"
      : a.proprietaireCompteType !== "entreprise");

    // ══ Filtres avancés ══
    const okQuartier = !filtres.quartier || (a.quartier || "").toLowerCase().includes(filtres.quartier);
    const okRue = !filtres.rue || (a.pointRepere || "").toLowerCase().includes(filtres.rue);
    const okZone = !filtres.zone || a.zoneCaractere === filtres.zone;
    const okZoneSelectionnee = !filtres.zoneSelectionnee || !!(a.commune || a.arrondissement);
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

    return okCommune && okArr && okType && okPrix && okPrixExact && okDisponibles && okRecentes && okTexte && okFavoris && okVendeur &&
      okQuartier && okRue && okZone && okZoneSelectionnee && okChambres && okSalons && okDouches &&
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

/* Date + heure complètes de publication, affichées en miniature sur chaque
   carte d'annonce (a.dateCreation est un Timestamp Firestore). */
function formaterDateHeure(valeur) {
  const date = valeur?.toDate ? valeur.toDate() : (valeur instanceof Date ? valeur : null);
  if (!date) return "";
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
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
    const badgeVendeur = getBadgeVendeur(a);
    carte.innerHTML = `
      <div class="visuel">
        ${photo ? `<img src="${escapeHTML(photo)}" alt="${escapeHTML(a.titre)}" loading="lazy">` : getIconeType(a.type)}
        <button class="btn-favori ${estFavori(a.id) ? "actif" : ""}" data-id="${a.id}" aria-label="Ajouter aux favoris">${estFavori(a.id) ? "❤️" : "🤍"}</button>
        <span class="badge badge-disponible" style="position:absolute;top:8px;right:8px;">🟢 Disponible</span>
        <span class="badge ${badgeVendeur.classe}" style="position:absolute;bottom:8px;left:8px;">${badgeVendeur.texte}</span>
      </div>
      <div class="carte-info">
        <h3>${escapeHTML(a.titre)}<span class="type-tag">${escapeHTML(a.type || "")}</span></h3>
        <div class="prix">${formatPrix(a.prix)}</div>
        <div class="localisation">📍 ${escapeHTML(a.quartier || "")}${a.quartier ? " — " : ""}${escapeHTML(a.arrondissement || "")}, ${escapeHTML(a.commune || "")}</div>
        ${(a.etage && a.etage !== "Non précisé") || (a.vue && a.vue !== "Non précisé") ? `
        <div class="localisation" style="margin-top:2px;">${a.etage && a.etage !== "Non précisé" ? "🪜 " + escapeHTML(a.etage) : ""}${a.etage && a.etage !== "Non précisé" && a.vue && a.vue !== "Non précisé" ? " · " : ""}${a.vue && a.vue !== "Non précisé" ? "🌅 " + escapeHTML(a.vue) : ""}</div>` : ""}
        ${a.dateCreation ? `<span class="date-publication">🕒 Publiée le ${escapeHTML(formaterDateHeure(a.dateCreation))}</span>` : ""}
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

    // Filet de sécurité : si la photo ne charge pas (lien expiré, réseau lent...),
    // on la remplace par l'icône du type de bien au lieu de laisser une image cassée.
    const imgEl = carte.querySelector(".visuel img");
    if (imgEl) {
      imgEl.addEventListener("error", () => {
        const remplacement = document.createRange().createContextualFragment(getIconeType(a.type));
        imgEl.replaceWith(remplacement);
      }, { once: true });
    }

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
        <h4>${escapeHTML(a.titre)}</h4>
        <div class="prix">${formatPrix(a.prix)}</div>
        <div style="font-size:11px;color:#888;">📍 ${escapeHTML(a.quartier || "")} — ${escapeHTML(a.arrondissement || "")}, ${escapeHTML(a.commune || "")}</div>
      </div>
    `);
    marker.on("click", () => afficherDetail(a));
    markersParId[a.id] = marker;
    bounds.push([a.lat, a.lng]);
  });

  // Message + recentrage adaptés selon ce que le filtre courant produit
  if (liste.length === 0) {
    afficherMessageCarteVide("Aucune annonce ne correspond à ces critères.");
  } else if (bounds.length === 0) {
    afficherMessageCarteVide("Ces annonces n'ont pas encore de position exacte renseignée.");
  } else {
    afficherMessageCarteVide(null);
  }

  if (bounds.length > 0) {
    map.flyToBounds(bounds, { padding: [30, 30], maxZoom: 15, duration: 0.6 });
  } else {
    recentrerSurZoneFiltre();
  }
}

function survolerMarqueur(id, actif) {
  const marker = markersParId[id];
  if (marker) marker.getElement()?.classList.toggle("survolee", actif);
  document.getElementById(`carte-${id}`)?.classList.toggle("survolee", actif);
}

/* ══════════ OUVERTURE DIRECTE D'UNE ANNONCE VIA L'URL (?annonce=ID) ══════════
   Utilisé par le catalogue d'une agence (entreprise.html) et par tout lien
   partagé pointant vers une annonce précise. On va chercher le document
   directement par son id (getDoc), plutôt que de compter sur la liste déjà
   affichée sur la page : celle-ci ne contient que les biens "disponible",
   alors qu'un bien "occupé" reste visible dans le catalogue d'une agence. */
async function ouvrirAnnonceDepuisURL() {
  const id = new URLSearchParams(window.location.search).get("annonce");
  if (!id) return;
  try {
    const snap = await getDoc(doc(db, "annonces", id));
    if (snap.exists()) {
      afficherDetail({ id: snap.id, ...snap.data() });
    } else {
      alert("Cette annonce n'existe plus ou a été retirée.");
    }
  } catch (err) {
    console.error("Impossible d'ouvrir l'annonce depuis le lien :", err);
  }
}

/* ══════════ MODAL DÉTAIL ══════════ */
function afficherDetail(a) {
  const modal = document.getElementById("detailModal");
  const panneau = document.getElementById("detailPanneau");
  const numeroWhatsApp = (a.whatsapp || a.tel || "").replace(/[^\d]/g, "");
  const texteWhatsAppContact = encodeURIComponent(
    `Bonjour${a.proprietaireNom ? " " + a.proprietaireNom : ""}, je suis intéressé(e) par votre annonce "${a.titre}" (${formatPrix(a.prix)}) sur MALAGA. Pouvez-vous me préciser les modalités de paiement du loyer ?`
  );

  const badgeVendeurDetail = getBadgeVendeur(a);
  panneau.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--vert) 0%,var(--vert-fonce) 100%);padding:24px 20px;color:#fff;position:relative;">
      <button id="fermerModal" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,.25);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
      <div style="font-size:44px;margin-bottom:6px;">${getIconeType(a.type)}</div>
      <span class="badge ${badgeVendeurDetail.classe}" style="display:inline-block;margin-bottom:6px;">${badgeVendeurDetail.texte}</span>
      <h2 style="font-size:18px;font-weight:800;padding-right:36px;">${escapeHTML(a.titre)}</h2>
      <div style="font-size:21px;font-weight:900;color:var(--jaune);margin-top:4px;">${formatPrix(a.prix)}</div>
      <div style="opacity:.9;font-size:13px;margin-top:2px;">📍 ${escapeHTML(a.quartier || "")} — ${escapeHTML(a.arrondissement || "")}, ${escapeHTML(a.commune || "")}</div>
      ${a.proprietaireCompteType === "entreprise" ? `<a href="entreprise.html?id=${escapeHTML(a.proprietaireId || "")}" style="display:inline-block;margin-top:8px;font-size:12px;color:#fff;text-decoration:underline;">🏢 Voir tous les biens de ${escapeHTML(a.proprietaireRaisonSociale || a.proprietaireNom || "cette entreprise")}</a>` : ""}
    </div>
    <div style="padding:20px;">
      ${a.photos && a.photos.length ? `
        <div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:16px;">
          ${a.photos.map(p => `<img src="${escapeHTML(p)}" style="height:130px;border-radius:10px;flex-shrink:0;">`).join("")}
        </div>` : ""}
      ${a.video ? `<video src="${escapeHTML(a.video)}" controls style="width:100%;border-radius:10px;margin-bottom:16px;"></video>` : ""}

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
        ${a.chambres ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🛏️ ${a.chambres}</div><div style="font-size:11px;color:#666;">Chambres</div></div>` : ""}
        ${a.salons ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🛋️ ${a.salons}</div><div style="font-size:11px;color:#666;">Salons</div></div>` : ""}
        ${a.sdb ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">🚿 ${a.sdb}</div><div style="font-size:11px;color:#666;">S. bain</div></div>` : ""}
        ${a.surface ? `<div style="background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;"><div style="font-weight:700;">📐 ${a.surface}</div><div style="font-size:11px;color:#666;">m²</div></div>` : ""}
      </div>

      <div style="margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">Description</h3>
        <p style="font-size:13px;color:#666;">${escapeHTML(a.description || "Aucune description.")}</p>
      </div>

      <div style="margin-bottom:16px;font-size:13px;color:#444;line-height:1.9;">
        ${a.cloture ? "✓ Clôturé &nbsp;" : ""}${a.eau ? `✓ Eau : ${escapeHTML(a.eau)} &nbsp;` : ""}${a.electricite ? `✓ Électricité : ${escapeHTML(a.electricite)}` : ""}
        ${a.compteur ? `<br>✓ Compteur ${escapeHTML(a.compteur)}` : ""}
        ${a.etat ? `<br>✓ État du bâtiment : ${escapeHTML(a.etat)}` : ""}
        ${a.materiau ? `<br>✓ Matériau : ${escapeHTML(a.materiau)}` : ""}
        ${a.couleurMurale ? ` &nbsp;✓ Peinture murale : ${escapeHTML(a.couleurMurale)}` : ""}
        ${a.cuisineType ? `<br>✓ Cuisine ${escapeHTML(a.cuisineType.toLowerCase())}` : ""}
        ${a.doucheType ? ` &nbsp;✓ Douche ${escapeHTML(a.doucheType.toLowerCase())}` : ""}
        ${a.terrasse ? "<br>✓ Terrasse" : ""}${a.carreaux ? " &nbsp;✓ Sol carrelé" : ""}
        ${a.zoneCaractere ? `<br>✓ Zone : ${escapeHTML(a.zoneCaractere)}` : ""}
        ${a.pointRepere ? `<br>✓ Repère : ${escapeHTML(a.pointRepere)}` : ""}
        ${a.numeroBien ? `<br>✓ Repérage : ${escapeHTML(a.numeroBien)}` : ""}
        ${a.etage && a.etage !== "Non précisé" ? `<br>✓ Étage : ${escapeHTML(a.etage)}` : ""}
        ${a.vue && a.vue !== "Non précisé" ? `<br>✓ Vue : ${escapeHTML(a.vue)}` : ""}
      </div>

      ${a.equipements && a.equipements.length ? `
        <div style="margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">Équipements</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${a.equipements.map(e => `<span style="background:#E8F5EE;color:var(--vert);padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">✓ ${escapeHTML(e)}</span>`).join("")}
          </div>
        </div>` : ""}

      ${typeof a.lat === "number" && typeof a.lng === "number" ? `
        <div style="margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">📍 Localisation</h3>
          <div id="detailMiniMap" style="width:100%;height:200px;border-radius:12px;overflow:hidden;border:1px solid #eee;margin-bottom:10px;"></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            <a href="https://www.google.com/maps?q=${a.lat},${a.lng}" target="_blank" rel="noopener" style="text-align:center;background:#fff;border:1.5px solid #eee;border-radius:10px;padding:10px 4px;font-size:11.5px;font-weight:700;text-decoration:none;color:#222;">🗺️<br>Google Maps</a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}" target="_blank" rel="noopener" style="text-align:center;background:#fff;border:1.5px solid #eee;border-radius:10px;padding:10px 4px;font-size:11.5px;font-weight:700;text-decoration:none;color:#222;">🧭<br>Itinéraire</a>
            ${numeroWhatsApp ? `<a href="https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(`Bonjour, voici la position exacte de l'annonce "${a.titre}" sur MALAGA : https://www.google.com/maps?q=${a.lat},${a.lng}`)}" target="_blank" rel="noopener" style="text-align:center;background:#fff;border:1.5px solid #eee;border-radius:10px;padding:10px 4px;font-size:11.5px;font-weight:700;text-decoration:none;color:#222;">💬<br>Partager</a>` : `<div></div>`}
          </div>
        </div>` : `
        <div style="margin-bottom:16px;background:#FFF7E6;border:1px solid #FDE7B0;border-radius:10px;padding:10px 12px;font-size:12px;color:#8a6b1f;">
          ⚠️ Position exacte non renseignée par le propriétaire.
        </div>`}

      <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin-bottom:16px;" id="blocReservationVisite"></div>

      <div style="margin-bottom:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button type="button" class="btn-paiement-info" data-cible="blocModalites" style="background:#fff;border:1.5px solid #eee;border-radius:10px;padding:11px 6px;font-size:12.5px;font-weight:700;cursor:pointer;">📋 Modalités de paiement</button>
          <button type="button" class="btn-paiement-info" data-cible="blocMoyens" style="background:#fff;border:1.5px solid #eee;border-radius:10px;padding:11px 6px;font-size:12.5px;font-weight:700;cursor:pointer;">💳 Moyens de paiement</button>
        </div>
        <div id="blocModalites" style="display:none;margin-top:10px;background:#FFF7E6;border:1px solid #FDE7B0;border-radius:10px;padding:12px 14px;font-size:12.5px;color:#6b551a;line-height:1.6;">
          Le loyer, la caution, l'avance éventuelle et la durée d'engagement sont à convenir <strong>directement avec le propriétaire</strong>, lors d'une visite ou d'une rencontre en personne. MALAGA n'impose ni ne garantit aucune de ces conditions.
        </div>
        <div id="blocMoyens" style="display:none;margin-top:10px;background:#FFF7E6;border:1px solid #FDE7B0;border-radius:10px;padding:12px 14px;font-size:12.5px;color:#6b551a;line-height:1.6;">
          ${a.moyensPaiement && a.moyensPaiement.length ? `
            <div style="margin-bottom:10px;">
              <strong>Moyens acceptés par le propriétaire :</strong>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                ${a.moyensPaiement.map(m => `<span style="background:#fff;border:1px solid #FDE7B0;color:#6b551a;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">${escapeHTML(m)}</span>`).join("")}
              </div>
            </div>` : `
            <div style="margin-bottom:10px;">Le propriétaire n'a pas encore précisé ses moyens de paiement acceptés.</div>`}
          Toute transaction se conclut uniquement via le numéro WhatsApp fourni par le propriétaire, après une rencontre en personne. <strong>MALAGA ne collecte, ne gère et ne garantit aucun paiement</strong>, et n'est pas responsable des transactions conclues en dehors de ce cadre.
        </div>
      </div>

      <div style="background:#f5f5f5;padding:16px;border-radius:12px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Contacter le propriétaire</h3>
        <div style="font-size:13px;margin-bottom:10px;"><strong>${escapeHTML(a.proprietaireNom || "")}</strong></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${numeroWhatsApp ? `<a href="https://wa.me/${numeroWhatsApp}?text=${texteWhatsAppContact}" target="_blank" class="btn btn-vert">💬 WhatsApp</a>` : ""}
          ${a.proprietaireTel ? `<a href="tel:${escapeHTML(a.proprietaireTel)}" class="btn btn-bleu">📞 Appeler</a>` : ""}
          ${a.proprietaireEmail ? `<a href="mailto:${escapeHTML(a.proprietaireEmail)}" class="btn btn-outline">✉️ Email</a>` : ""}
        </div>
      </div>
    </div>
  `;
  modal.classList.add("ouverte");
  document.getElementById("fermerModal").onclick = () => modal.classList.remove("ouverte");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("ouverte"); };
  panneau.querySelectorAll(".btn-paiement-info").forEach(b => {
    b.onclick = () => {
      const cible = document.getElementById(b.dataset.cible);
      const ouvert = cible.style.display !== "none";
      cible.style.display = ouvert ? "none" : "block";
      b.style.background = ouvert ? "#fff" : "#0F766E";
      b.style.color = ouvert ? "#222" : "#fff";
      b.style.borderColor = ouvert ? "#eee" : "#0F766E";
    };
  });
  rendreBlocReservation(a);
  initDetailMiniMap(a);

  // Comptage des vues, best-effort (n'empêche pas l'affichage si ça échoue)
  updateDoc(doc(db, "annonces", a.id), { vues: increment(1) }).catch(() => {});
}

/* Mini-carte de géolocalisation dans le détail d'une annonce.
   Le conteneur #detailMiniMap est recréé à chaque ouverture (innerHTML plus haut),
   donc on détruit toujours l'ancienne instance Leaflet avant d'en créer une nouvelle. */
let detailMiniMap = null;
function initDetailMiniMap(a) {
  if (detailMiniMap) { detailMiniMap.remove(); detailMiniMap = null; }
  const conteneur = document.getElementById("detailMiniMap");
  if (!conteneur || typeof a.lat !== "number" || typeof a.lng !== "number") return;
  detailMiniMap = L.map("detailMiniMap", { zoomControl: false, dragging: false, scrollWheelZoom: false })
    .setView([a.lat, a.lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(detailMiniMap);
  L.marker([a.lat, a.lng]).addTo(detailMiniMap).bindPopup(escapeHTML(a.titre || "Position du bien"));
  setTimeout(() => detailMiniMap?.invalidateSize(), 150);
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
      // On repasse par ?annonce=ID (voir ouvrirAnnonceDepuisURL) pour que la personne
      // retrouve directement cette même fiche ouverte une fois connectée, au lieu
      // d'atterrir sur l'accueil et devoir rechercher le bien une seconde fois.
      const retour = encodeURIComponent(`index.html?annonce=${a.id}`);
      window.location.href = `connexion.html?retour=${retour}`;
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

// Actions boutons statistiques
function filtrerDisponibles() {
  filtres.disponibles = !filtres.disponibles;
  filtres.recentes = false;
  rendreTout();
}

function afficherZones() {
  filtres.zoneSelectionnee = !filtres.zoneSelectionnee;
  rendreTout();
}

function afficherPublicationsRecentes() {
  filtres.recentes = !filtres.recentes;
  filtres.disponibles = false;
  rendreTout();
}

/* ══════════ CATALOGUES D'AGENCES / ENTREPRISES ══════════
   Reconstruit à partir de toutesLesAnnonces (déjà chargé en temps réel) : aucune
   requête Firestore supplémentaire. On regroupe les annonces par proprietaireId
   pour les comptes de type "entreprise" (champs dénormalisés proprietaireCompteType/
   proprietaireRaisonSociale/proprietaireLogoUrl, écrits par publier.html et connexion.html). */
function initCatalogues() {
  const btn = document.getElementById("btnCatalogues");
  const panel = document.getElementById("cataloguesPanel");
  const fleche = document.getElementById("catFleche");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    const ouvert = panel.classList.toggle("replie") === false;
    btn.classList.toggle("actif", ouvert);
    if (fleche) fleche.textContent = ouvert ? "▴" : "▾";
  });
}

function construireCatalogues() {
  const conteneur = document.getElementById("cataloguesListe");
  if (!conteneur) return;

  const parEntreprise = {};
  toutesLesAnnonces
    .filter(a => a.proprietaireCompteType === "entreprise" && a.proprietaireId)
    .forEach(a => {
      const id = a.proprietaireId;
      if (!parEntreprise[id]) {
        parEntreprise[id] = {
          id,
          nom: a.proprietaireRaisonSociale || a.proprietaireNom || "Entreprise",
          logoUrl: a.proprietaireLogoUrl || "",
          total: 0
        };
      }
      parEntreprise[id].total++;
    });

  const entreprises = Object.values(parEntreprise).sort((a, b) => b.total - a.total);

  if (entreprises.length === 0) {
    conteneur.innerHTML = `<div class="catalogues-vide">Aucune agence ou entreprise n'a encore publié de catalogue.</div>`;
    return;
  }

  conteneur.innerHTML = entreprises.map(e => `
    <a class="catalogue-carte" href="entreprise.html?id=${encodeURIComponent(e.id)}">
      <div class="logo">${e.logoUrl ? `<img src="${escapeHTML(e.logoUrl)}" alt="">` : "🏢"}</div>
      <div class="infos">
        <div class="nom">${escapeHTML(e.nom)}</div>
        <div class="desc">${e.total} logement${e.total > 1 ? "s" : ""} disponible${e.total > 1 ? "s" : ""}</div>
      </div>
    </a>
  `).join("");
}



