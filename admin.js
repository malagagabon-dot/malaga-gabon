/* ═══════════════════════════════════════════════════════════
   MALAGA – admin.js
   Panneau d'administration — authentification Firebase réelle
   (compte admin unique).
   Annonces, Utilisateurs, Signalements & Messages : branchés EN TEMPS
   RÉEL sur Firestore (collections "annonces", "users", "signalements",
   "messages"). Les deux dernières sont alimentées par le site public
   via contact-signalement.js (formulaires du menu "Nous écrire" et
   "Signaler un problème").
   Réservations : branchées en temps réel via reservations-admin.js.
═══════════════════════════════════════════════════════════ */

'use strict';

const ADMIN_EMAIL = 'malagagabon@gmail.com';

/* ══════════ Lit plusieurs noms de champ possibles pour un même document
   (les pages du site public peuvent nommer les champs différemment) ══════════ */
/* Lit plusieurs noms de champ possibles, en priorisant le schéma réel du site
   public (voir app.js) : commune, quartier, arrondissement, proprietaireNom,
   description, equipements... Les anciens noms restent en repli. */
function champ(obj, ...cles) {
  for (const c of cles) {
    if (obj && obj[c] !== undefined && obj[c] !== null && obj[c] !== '') return obj[c];
  }
  return undefined;
}
function texte(obj, ...cles) { return champ(obj, ...cles) ?? '—'; }
function nombre(obj, ...cles) { const v = champ(obj, ...cles); return typeof v === 'number' ? v : (parseInt(v) || 0); }

let currentUser = null;
let annoncesData = [];       // alimenté en temps réel depuis Firestore "annonces"
let usersData = [];          // alimenté en temps réel depuis Firestore "users"
let signalementsData = [];   // alimenté en temps réel depuis Firestore "signalements"
let messagesData = [];       // alimenté en temps réel depuis Firestore "messages"
let theme = localStorage.getItem('malaga_admin_theme') || 'light';
let ecouteAnnoncesDemarree = false;
let ecouteUsersDemarree = false;
let ecouteSignalementsDemarree = false;
let ecouteMessagesDemarree = false;
let pageActuelle = 'dashboard';

/* ══════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTopbarDate();
  initSidebar();
  initToggleMdp();
  initListesReference();
  checkAuth();
});

/* ══════════════════════════════════════════════════════════
   LISTES DE RÉFÉRENCE (issues de malaga-reference.js via
   window.MALAGA_REF, voir le pont de module dans admin.html)
══════════════════════════════════════════════════════════ */
function initListesReference() {
  const ref = window.MALAGA_REF || {};
  const remplir = (id, liste = [], placeholder) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (placeholder !== undefined ? `<option value="">${placeholder}</option>` : '') +
      (liste || []).map(v => `<option>${v}</option>`).join('');
  };

  // Modal "Modifier l'annonce"
  remplir('modZoneCaractere', ref.ZONES_CARACTERE, 'Non précisé');
  remplir('modCuisineType', ref.CUISINE_TYPES);
  remplir('modDoucheType', ref.DOUCHE_TYPES);
  remplir('modMateriau', ref.MATERIAUX);
  remplir('modCouleurMurale', ref.COULEURS_MURALES);

  // Filtres avancés (page Annonces)
  remplir('faaZone', ref.ZONES_CARACTERE, 'Indifférent');
  remplir('faaType', ref.TYPES_BIEN, 'Tous');
  remplir('faaCuisineType', ref.CUISINE_TYPES, 'Indifférent');
  remplir('faaDoucheType', ref.DOUCHE_TYPES, 'Indifférent');
  remplir('faaMateriau', ref.MATERIAUX, 'Indifférent');
  remplir('faaCouleur', ref.COULEURS_MURALES, 'Indifférente');

  const optionsPaliers = '<option value="">Indifférent</option>' +
    (ref.PALIERS_PIECES || [1, 2, 3, 4, 5]).map(n => `<option value="${n}">${n}+</option>`).join('');
  ['faaChambres', 'faaSalons', 'faaDouches'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = optionsPaliers;
  });
}

function toggleFiltresAvancesAdmin() {
  const panneau = document.getElementById('filtresAvancesAdmin');
  if (!panneau) return;
  panneau.style.display = panneau.style.display === 'none' ? 'block' : 'none';
}

function reinitialiserFiltresAvancesAdmin() {
  ['faaTexteLoc', 'faaPrixMin', 'faaPrixMax'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['faaZone', 'faaType', 'faaChambres', 'faaSalons', 'faaDouches', 'faaCuisineType',
    'faaDoucheType', 'faaMateriau', 'faaCouleur', 'faaTerrasse', 'faaCarreaux'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  filtrerAnnonces();
}

/* ══════════════════════════════════════════════════════════
   AFFICHER / MASQUER LE MOT DE PASSE (icône œil)
══════════════════════════════════════════════════════════ */
function initToggleMdp() {
  document.querySelectorAll('.btn-oeil').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.cible);
      if (!input) return;
      const estVisible = input.type === 'text';
      input.type = estVisible ? 'password' : 'text';
      btn.textContent = estVisible ? '👁️' : '🙈';
      btn.classList.toggle('actif', !estVisible);
      btn.setAttribute('aria-label', estVisible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
    });
  });
}

/* ══════════════════════════════════════════════════════════
   AUTHENTIFICATION (Firebase réelle — compte admin unique)
══════════════════════════════════════════════════════════ */
function checkAuth() {
  authAdmin.onAuthStateChanged((user) => {
    if (user && user.email === ADMIN_EMAIL) {
      onLoginSuccess(user);
    } else {
      if (user) authAdmin.signOut(); // connecté mais pas le bon compte : on rejette
      document.getElementById('loginOverlay').classList.remove('hidden');
    }
  });
}

function adminLogin() {
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const btn = document.getElementById('loginBtnText');
  const errEl = document.getElementById('loginError');

  if (!email || !password) {
    errEl.textContent = '⚠️ Remplissez tous les champs';
    errEl.classList.remove('hidden');
    return;
  }

  btn.textContent = '⏳ Connexion...';
  errEl.classList.add('hidden');

  authAdmin.signInWithEmailAndPassword(email, password)
    .then((cred) => {
      if (cred.user.email !== ADMIN_EMAIL) {
        authAdmin.signOut();
        throw { code: 'auth/unauthorized' };
      }
      // onLoginSuccess est déclenché automatiquement par onAuthStateChanged (checkAuth)
    })
    .catch((err) => {
      const messages = {
        'auth/invalid-email': "Adresse email invalide.",
        'auth/user-not-found': "Aucun compte administrateur avec cet email.",
        'auth/wrong-password': "Mot de passe incorrect.",
        'auth/invalid-credential': "Email ou mot de passe incorrect.",
        'auth/too-many-requests': "Trop de tentatives. Réessayez dans quelques minutes.",
        'auth/unauthorized': "Ce compte n'a pas les droits administrateur."
      };
      errEl.textContent = '❌ ' + (messages[err.code] || "Une erreur est survenue. Réessayez.");
      errEl.classList.remove('hidden');
      btn.textContent = 'Se connecter';
    });
}

function onLoginSuccess(user) {
  currentUser = user;
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('adminName').textContent = 'KOZANGUE Patrick';
  document.getElementById('adminEmailDisplay').textContent = user.email || '';
  demarrerEcouteAnnonces();
  demarrerEcouteUtilisateurs();
  demarrerEcouteSignalements();
  demarrerEcouteMessages();
  loadDashboard();
}

function adminLogout() {
  if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    authAdmin.signOut().then(() => location.reload());
  }
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — ANNONCES (Firestore, collection "annonces")
══════════════════════════════════════════════════════════ */
function demarrerEcouteAnnonces() {
  if (ecouteAnnoncesDemarree) return;
  ecouteAnnoncesDemarree = true;

  if (!window.dbAdmin) {
    toast('❌ Firebase non initialisé (firebase-config-compat.js)');
    return;
  }

  window.dbAdmin.collection('annonces').onSnapshot((snap) => {
    annoncesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('badgeAnnonces').textContent = annoncesData.length;
    if (pageActuelle === 'dashboard') loadDashboard();
    if (pageActuelle === 'annonces') filtrerAnnonces();
  }, (err) => {
    console.error('Erreur de synchronisation des annonces :', err);
    const tbody = document.getElementById('annoncesTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Impossible de charger les annonces. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — UTILISATEURS (Firestore, collection "users")
══════════════════════════════════════════════════════════ */
function demarrerEcouteUtilisateurs() {
  if (ecouteUsersDemarree) return;
  ecouteUsersDemarree = true;

  if (!window.dbAdmin) return;

  window.dbAdmin.collection('users').onSnapshot((snap) => {
    usersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('badgeUsers').textContent = usersData.length;
    if (pageActuelle === 'dashboard') loadDashboard();
    if (pageActuelle === 'utilisateurs') filtrerUsers();
  }, (err) => {
    console.error('Erreur de synchronisation des utilisateurs :', err);
    const tbody = document.getElementById('usersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Impossible de charger les utilisateurs. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — SIGNALEMENTS (Firestore, collection "signalements")
   Écrit par le site public via contact-signalement.js (formulaire
   "🚩 Signaler un problème" dans le menu).
══════════════════════════════════════════════════════════ */
function demarrerEcouteSignalements() {
  if (ecouteSignalementsDemarree) return;
  ecouteSignalementsDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('signalements').orderBy('dateCreation', 'desc').onSnapshot((snap) => {
    signalementsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nbNonTraites = signalementsData.filter(s => !s.traite).length;
    const badge = document.getElementById('badgeSignal');
    if (badge) badge.textContent = nbNonTraites;
    const kpi = document.getElementById('kpiSignal');
    if (kpi) kpi.textContent = nbNonTraites;
    if (pageActuelle === 'dashboard') loadDashboard();
    if (pageActuelle === 'signalements') loadSignalements();
  }, (err) => {
    console.error('Erreur de synchronisation des signalements :', err);
    const tbody = document.getElementById('signalementsBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Impossible de charger les signalements. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — MESSAGES (Firestore, collection "messages")
   Écrit par le site public via contact-signalement.js (formulaire
   "✉️ Nous écrire" dans le menu).
══════════════════════════════════════════════════════════ */
function demarrerEcouteMessages() {
  if (ecouteMessagesDemarree) return;
  ecouteMessagesDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('messages').orderBy('dateCreation', 'desc').onSnapshot((snap) => {
    messagesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (pageActuelle === 'messages') loadMessages();
  }, (err) => {
    console.error('Erreur de synchronisation des messages :', err);
    const tbody = document.getElementById('messagesBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Impossible de charger les messages. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
function showPage(pageId) {
  pageActuelle = pageId;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');

  const titles = {
    'dashboard': 'Tableau de bord',
    'annonces': 'Gestion des annonces',
    'utilisateurs': 'Utilisateurs',
    'signalements': 'Signalements',
    'reservations': 'Demandes de visite',
    'messages': 'Messages',
    'stats': 'Statistiques',
    'publier': 'Publier une annonce'
  };
  document.getElementById('topbarTitle').textContent = titles[pageId] || 'MALAGA Admin';

  if (pageId === 'dashboard') loadDashboard();
  else if (pageId === 'annonces') filtrerAnnonces();
  else if (pageId === 'utilisateurs') filtrerUsers();
  else if (pageId === 'signalements') loadSignalements();
  else if (pageId === 'reservations' && window.chargerReservations) window.chargerReservations();
  else if (pageId === 'messages') loadMessages();
  else if (pageId === 'stats') loadStats();
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function loadDashboard() {
  document.getElementById('kpiAnnonces').textContent = annoncesData.length;
  document.getElementById('kpiUsers').textContent = usersData.length;
  document.getElementById('kpiVues').textContent = annoncesData.reduce((s, a) => s + nombre(a, 'vues'), 0).toLocaleString();
  document.getElementById('kpiSignal').textContent = signalementsData.filter(s => !s.traite).length;

  const tbody = document.getElementById('dashAnnoncesBody');
  if (annoncesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Aucune annonce pour le moment</td></tr>';
  } else {
    tbody.innerHTML = annoncesData.slice(0, 5).map(a => {
      const titre = texte(a, 'titre', 'title');
      return `
        <tr>
          <td style="font-weight:700;">${String(titre).substring(0, 30)}</td>
          <td>${texte(a, 'commune', 'ville')}</td>
          <td>${nombre(a, 'prix', 'prixMensuel', 'loyer').toLocaleString()}</td>
          <td><span style="background:#D1FAE5;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;">${texte(a, 'statut', 'disponibilite')}</span></td>
          <td><button onclick="voirAnnonce('${a.id}')" style="padding:6px 10px;background:#009E60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Voir</button></td>
        </tr>
      `;
    }).join('');
  }

  const sigDiv = document.getElementById('dashSignalements');
  if (signalementsData.length === 0) {
    sigDiv.innerHTML = '<p style="color:#888;padding:20px;text-align:center;">Aucun signalement</p>';
  } else {
    sigDiv.innerHTML = signalementsData.slice(0, 3).map(s => `
      <div style="padding:12px;border-bottom:1px solid #eee;font-size:13px;">
        <strong>${s.type}</strong> - ${s.date}
        <p style="color:#888;margin:4px 0 0 0;font-size:12px;">${s.desc}</p>
      </div>
    `).join('');
  }
}

/* ══════════════════════════════════════════════════════════
   ANNONCES (temps réel Firestore)
══════════════════════════════════════════════════════════ */
function loadAnnonces(liste) {
  const tbody = document.getElementById('annoncesTableBody');
  const data = liste || annoncesData;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Aucune annonce ne correspond</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(a => {
    const titre = texte(a, 'titre', 'title');
    return `
      <tr>
        <td style="font-size:11px;color:#888;">${a.id}</td>
        <td style="font-weight:600;">${String(titre).substring(0, 20)}</td>
        <td>${texte(a, 'proprietaireNom', 'proprio', 'nomProprietaire')}</td>
        <td>${texte(a, 'commune', 'ville')}</td>
        <td>${nombre(a, 'prix', 'prixMensuel', 'loyer').toLocaleString()}</td>
        <td>${nombre(a, 'vues').toLocaleString()}</td>
        <td><span style="background:#D1FAE5;padding:3px 8px;border-radius:6px;font-size:11px;">${texte(a, 'statut', 'disponibilite')}</span></td>
        <td>
          <button onclick="voirAnnonce('${a.id}')" style="padding:4px 8px;background:#3A75C4;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">Voir</button>
          <button onclick="modifierAnnonce('${a.id}')" style="padding:4px 8px;background:#F59E0B;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">✏️ Modifier</button>
          <button onclick="supprimerAnnonce('${a.id}')" style="padding:4px 8px;background:#EF4444;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Supprimer</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filtrerAnnonces() {
  const $ = (id) => document.getElementById(id);
  const texteRecherche = ($('filterAnnonce')?.value || '').toLowerCase().trim();
  const statut = $('filterStatut')?.value || '';
  const ville = $('filterVille')?.value || '';

  // Filtres avancés (facultatifs, tiroir repliable)
  const texteLoc = ($('faaTexteLoc')?.value || '').toLowerCase().trim();
  const zone = $('faaZone')?.value || '';
  const type = $('faaType')?.value || '';
  const chambresMin = $('faaChambres')?.value || '';
  const salonsMin = $('faaSalons')?.value || '';
  const douchesMin = $('faaDouches')?.value || '';
  const cuisineType = $('faaCuisineType')?.value || '';
  const doucheType = $('faaDoucheType')?.value || '';
  const materiau = $('faaMateriau')?.value || '';
  const couleur = $('faaCouleur')?.value || '';
  const terrasse = $('faaTerrasse')?.value || '';
  const carreaux = $('faaCarreaux')?.value || '';
  const prixMin = $('faaPrixMin')?.value || '';
  const prixMax = $('faaPrixMax')?.value || '';

  const filtrees = annoncesData.filter(a => {
    const titre = String(texte(a, 'titre', 'title')).toLowerCase();
    const quartier = String(texte(a, 'quartier', 'adresse')).toLowerCase();
    const rue = String(champ(a, 'pointRepere') || '').toLowerCase();
    const villeAnnonce = texte(a, 'commune', 'ville');
    const statutAnnonce = texte(a, 'statut', 'disponibilite');
    const prix = nombre(a, 'prix', 'prixMensuel', 'loyer');

    const correspondTexte = !texteRecherche || titre.includes(texteRecherche) || quartier.includes(texteRecherche);
    const correspondStatut = !statut || statutAnnonce === statut;
    const correspondVille = !ville || villeAnnonce === ville;

    const correspondLoc = !texteLoc || quartier.includes(texteLoc) || rue.includes(texteLoc);
    const correspondZone = !zone || champ(a, 'zoneCaractere') === zone;
    const correspondType = !type || champ(a, 'type') === type;
    const correspondChambres = !chambresMin || nombre(a, 'chambres') >= parseInt(chambresMin);
    const correspondSalons = !salonsMin || nombre(a, 'salons') >= parseInt(salonsMin);
    const correspondDouches = !douchesMin || nombre(a, 'douches', 'sdb') >= parseInt(douchesMin);
    const correspondCuisine = !cuisineType || champ(a, 'cuisineType') === cuisineType;
    const correspondDouche = !doucheType || champ(a, 'doucheType') === doucheType;
    const correspondMateriau = !materiau || champ(a, 'materiau') === materiau;
    const correspondCouleur = !couleur || champ(a, 'couleurMurale') === couleur;
    const correspondTerrasse = !terrasse || (terrasse === 'oui' ? !!a.terrasse : !a.terrasse);
    const correspondCarreaux = !carreaux || (carreaux === 'oui' ? !!a.carreaux : !a.carreaux);
    const correspondPrixMin = !prixMin || prix >= parseInt(prixMin);
    const correspondPrixMax = !prixMax || prix <= parseInt(prixMax);

    return correspondTexte && correspondStatut && correspondVille &&
      correspondLoc && correspondZone && correspondType && correspondChambres &&
      correspondSalons && correspondDouches && correspondCuisine && correspondDouche &&
      correspondMateriau && correspondCouleur && correspondTerrasse && correspondCarreaux &&
      correspondPrixMin && correspondPrixMax;
  });

  loadAnnonces(filtrees);
}

function voirAnnonce(id) {
  const a = annoncesData.find(x => x.id === id);
  if (!a) return;
  alert(`${texte(a, 'titre', 'title')}\n${texte(a, 'commune', 'ville')} — ${nombre(a, 'prix', 'prixMensuel', 'loyer').toLocaleString()} FCFA/mois\nStatut : ${texte(a, 'statut', 'disponibilite')}`);
}

function supprimerAnnonce(id) {
  const a = annoncesData.find(x => x.id === id);
  if (!a) return;
  document.getElementById('modalTitle').textContent = 'Supprimer cette annonce ?';
  document.getElementById('modalMsg').textContent = `« ${texte(a, 'titre', 'title')} » sera définitivement supprimée du site.`;
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = 'Supprimer';
  btn.onclick = () => {
    window.dbAdmin.collection('annonces').doc(id).delete()
      .then(() => toast('✅ Annonce supprimée'))
      .catch((err) => { console.error(err); toast('❌ Erreur lors de la suppression'); });
    fermerModal();
  };
  document.getElementById('modalConfirm').classList.remove('hidden');
}

let annonceEnEdition = null;

function modifierAnnonce(id) {
  const a = annoncesData.find(x => x.id === id);
  if (!a) return;
  annonceEnEdition = id;

  document.getElementById('modTitre').value = texte(a, 'titre', 'title') === '—' ? '' : texte(a, 'titre', 'title');
  document.getElementById('modType').value = champ(a, 'type') || 'Maison';
  document.getElementById('modCommune').value = champ(a, 'commune', 'ville') || 'Libreville';
  document.getElementById('modArrondissement').value = champ(a, 'arrondissement') || '';
  document.getElementById('modQuartier').value = champ(a, 'quartier', 'adresse') || '';
  document.getElementById('modPointRepere').value = champ(a, 'pointRepere') || '';
  document.getElementById('modZoneCaractere').value = champ(a, 'zoneCaractere') || '';
  document.getElementById('modPrix').value = nombre(a, 'prix', 'prixMensuel', 'loyer') || '';
  document.getElementById('modSurface').value = champ(a, 'surface') || '';
  document.getElementById('modChambres').value = champ(a, 'chambres') || '';
  document.getElementById('modSalons').value = champ(a, 'salons') || '';
  document.getElementById('modSdb').value = champ(a, 'sdb') || '';
  document.getElementById('modCuisineType').value = champ(a, 'cuisineType') || '';
  document.getElementById('modDoucheType').value = champ(a, 'doucheType') || '';
  document.getElementById('modMateriau').value = champ(a, 'materiau') || '';
  document.getElementById('modCouleurMurale').value = champ(a, 'couleurMurale') || '';
  document.getElementById('modTerrasse').value = a.terrasse ? 'oui' : 'non';
  document.getElementById('modCarreaux').value = a.carreaux ? 'oui' : 'non';
  document.getElementById('modStatut').value = (champ(a, 'statut', 'disponibilite') === 'occupe') ? 'occupe' : 'disponible';
  document.getElementById('modDescription').value = champ(a, 'description') || '';
  document.getElementById('modProprioNom').value = champ(a, 'proprietaireNom', 'proprio', 'nomProprietaire') || '';
  document.getElementById('modProprioTel').value = champ(a, 'proprietaireTel', 'whatsapp') || '';

  const equipementsActuels = Array.isArray(a.equipements) ? a.equipements : [];
  document.querySelectorAll('#modTagsPicker input[type="checkbox"]').forEach(cb => {
    cb.checked = equipementsActuels.includes(cb.value);
  });

  document.getElementById('modalModifierAnnonce').classList.remove('hidden');
}

function fermerModalModifier() {
  document.getElementById('modalModifierAnnonce').classList.add('hidden');
  annonceEnEdition = null;
}

function enregistrerModificationAnnonce() {
  if (!annonceEnEdition) return;

  const titre = document.getElementById('modTitre').value.trim();
  const prix = document.getElementById('modPrix').value;
  if (!titre || !prix) {
    alert('⚠️ Le titre et le loyer sont obligatoires.');
    return;
  }

  const equipements = Array.from(document.querySelectorAll('#modTagsPicker input:checked')).map(el => el.value);
  const btn = document.getElementById('modBtnEnregistrer');
  btn.textContent = '⏳ Enregistrement...';

  window.dbAdmin.collection('annonces').doc(annonceEnEdition).update({
    titre,
    type: document.getElementById('modType').value,
    commune: document.getElementById('modCommune').value,
    arrondissement: document.getElementById('modArrondissement').value.trim(),
    quartier: document.getElementById('modQuartier').value.trim(),
    pointRepere: document.getElementById('modPointRepere').value.trim(),
    zoneCaractere: document.getElementById('modZoneCaractere').value,
    prix: parseInt(prix) || 0,
    surface: parseInt(document.getElementById('modSurface').value) || null,
    chambres: parseInt(document.getElementById('modChambres').value) || null,
    salons: parseInt(document.getElementById('modSalons').value) || null,
    sdb: parseInt(document.getElementById('modSdb').value) || null,
    douches: parseInt(document.getElementById('modSdb').value) || null,
    cuisineType: document.getElementById('modCuisineType').value,
    doucheType: document.getElementById('modDoucheType').value,
    materiau: document.getElementById('modMateriau').value,
    couleurMurale: document.getElementById('modCouleurMurale').value,
    terrasse: document.getElementById('modTerrasse').value === 'oui',
    carreaux: document.getElementById('modCarreaux').value === 'oui',
    statut: document.getElementById('modStatut').value,
    description: document.getElementById('modDescription').value.trim(),
    equipements,
    proprietaireNom: document.getElementById('modProprioNom').value.trim(),
    proprietaireTel: document.getElementById('modProprioTel').value.trim(),
    dateModification: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    toast('✅ Annonce mise à jour');
    fermerModalModifier();
  }).catch((err) => {
    console.error(err);
    toast('❌ Erreur lors de la mise à jour');
  }).finally(() => {
    btn.textContent = '💾 Enregistrer';
  });
}

/* ══════════════════════════════════════════════════════════
   ANNONCES DÉMO — génération et nettoyage en un clic
   Chaque annonce démo porte le champ demo:true, ce qui permet
   de toutes les supprimer d'un coup sans toucher aux vraies
   annonces publiées par de vrais propriétaires.
══════════════════════════════════════════════════════════ */
function annoncesDemoData() {
  const photo = (seed) => [1, 2, 3].map(n => `https://picsum.photos/seed/${seed}-${n}/800/600`);

  return [
    {
      titre: "Villa meublée avec piscine à Akournam",
      type: "Villa", commune: "Owendo", arrondissement: "2e arrondissement", quartier: "Akournam 2",
      prix: 450000, surface: 180, chambres: 4, sdb: 3, cloture: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Magnifique villa entièrement meublée avec piscine privée, grand jardin clôturé et parking pour 2 véhicules. Idéale pour une famille ou une résidence de fonction.",
      equipements: ["Meublé", "Climatisé", "Piscine", "Parking", "Groupe électrogène"],
      statut: "disponible", lat: 0.2905, lng: 9.4980, photos: photo("villa-akournam")
    },
    {
      titre: "Appartement moderne aux Cocotiers",
      type: "Appartement", commune: "Libreville", arrondissement: "2e arrondissement", quartier: "Cocotiers",
      prix: 220000, surface: 85, chambres: 2, sdb: 1, cloture: false,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Bel appartement lumineux au 2e étage, proche des commerces et des transports. Cuisine équipée et balcon avec vue dégagée.",
      equipements: ["Climatisé", "Fibre optique", "Interphone"],
      statut: "disponible", lat: 0.3912, lng: 9.4580, photos: photo("appart-cocotiers")
    },
    {
      titre: "Studio meublé à Akébé-Ville",
      type: "Studio", commune: "Libreville", arrondissement: "3e arrondissement", quartier: "Akébé-Ville",
      prix: 95000, surface: 28, chambres: 0, sdb: 1, cloture: false,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Commun",
      description: "Studio compact et fonctionnel, parfait pour un étudiant ou une personne seule. Quartier calme et bien desservi.",
      equipements: ["Meublé", "Interphone"],
      statut: "disponible", lat: 0.3830, lng: 9.4650, photos: photo("studio-akebe")
    },
    {
      titre: "Maison familiale à Angondjé",
      type: "Maison", commune: "Akanda", arrondissement: "2e arrondissement", quartier: "Angondjé",
      prix: 300000, surface: 140, chambres: 3, sdb: 2, cloture: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Maison spacieuse dans un quartier résidentiel calme, cour clôturée avec espace pour jardin potager. Proche des écoles.",
      equipements: ["Clôturé", "Parking", "Forage", "Gardiennage"],
      statut: "disponible", lat: 0.4790, lng: 9.4240, photos: photo("maison-angondje")
    },
    {
      titre: "Chambre meublée à Glass",
      type: "Chambre", commune: "Libreville", arrondissement: "4e arrondissement", quartier: "Glass",
      prix: 60000, surface: 18, chambres: 1, sdb: 1, cloture: false,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Commun",
      description: "Chambre meublée avec salle d'eau partagée, dans une résidence sécurisée en bord de mer. Idéal petit budget.",
      equipements: ["Meublé", "Gardiennage"],
      statut: "disponible", lat: 0.3980, lng: 9.4470, photos: photo("chambre-glass")
    },
    {
      titre: "Villa avec grand jardin à Cap Estérias",
      type: "Villa", commune: "Akanda", arrondissement: "1er arrondissement", quartier: "Cap Estérias",
      prix: 500000, surface: 220, chambres: 4, sdb: 3, cloture: true,
      eau: "Forage", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Villa de standing en bord de mer avec grand jardin arboré, parking et groupe électrogène de secours. Cadre exceptionnel.",
      equipements: ["Meublé", "Jardin", "Parking", "Groupe électrogène", "Gardiennage"],
      statut: "occupe", lat: 0.5320, lng: 9.3650, photos: photo("villa-esterias")
    },
    {
      titre: "Bureau climatisé à Charbonnages",
      type: "Bureau", commune: "Libreville", arrondissement: "1er arrondissement", quartier: "Charbonnages",
      prix: 350000, surface: 100, chambres: null, sdb: 1, cloture: false,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Espace de bureau climatisé, open-space modulable, idéal pour une PME. Parking visiteurs disponible.",
      equipements: ["Climatisé", "Parking", "Fibre optique"],
      statut: "disponible", lat: 0.4210, lng: 9.4390, photos: photo("bureau-charbonnages")
    },
    {
      titre: "Local commercial au port d'Owendo",
      type: "Local commercial", commune: "Owendo", arrondissement: "1er arrondissement", quartier: "Owendo Port",
      prix: 400000, surface: 120, chambres: null, sdb: 1, cloture: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Local commercial bien situé à proximité du port, forte visibilité et passage. Idéal commerce ou entrepôt.",
      equipements: ["Clôturé", "Parking", "Gardiennage"],
      statut: "disponible", lat: 0.2940, lng: 9.5050, photos: photo("local-owendo")
    }
  ];
}

function semerAnnoncesDemo() {
  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }
  if (!confirm('Ajouter 8 annonces de démonstration dans Firestore ? Elles seront visibles sur le site public et modifiables/supprimables ici.')) return;

  const lot = annoncesDemoData();
  const batch = window.dbAdmin.batch();
  const maintenant = firebase.firestore.FieldValue.serverTimestamp();

  lot.forEach((item) => {
    const ref = window.dbAdmin.collection('annonces').doc();
    batch.set(ref, {
      ...item,
      video: null,
      proprietaireNom: item.proprietaireNom || "MALAGA Démo",
      proprietaireTel: "+241 60 14 19 24",
      whatsapp: "+241 60 14 19 24",
      vues: Math.floor(Math.random() * 40),
      demo: true,
      dateCreation: maintenant,
      dateModification: maintenant
    });
  });

  batch.commit()
    .then(() => toast(`✅ ${lot.length} annonces démo ajoutées`))
    .catch((err) => { console.error(err); toast('❌ Erreur lors de l\'ajout des démos'); });
}

function supprimerAnnoncesDemo() {
  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }
  const demos = annoncesData.filter(a => a.demo === true);
  if (demos.length === 0) { toast('ℹ️ Aucune annonce démo à supprimer'); return; }
  if (!confirm(`Supprimer définitivement les ${demos.length} annonce(s) démo ?`)) return;

  const batch = window.dbAdmin.batch();
  demos.forEach(a => batch.delete(window.dbAdmin.collection('annonces').doc(a.id)));

  batch.commit()
    .then(() => toast(`✅ ${demos.length} annonce(s) démo supprimée(s)`))
    .catch((err) => { console.error(err); toast('❌ Erreur lors de la suppression'); });
}

/* ══════════════════════════════════════════════════════════
   UTILISATEURS (temps réel Firestore)
══════════════════════════════════════════════════════════ */
function loadUsers(liste) {
  const tbody = document.getElementById('usersTableBody');
  const data = liste || usersData;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Aucun utilisateur ne correspond</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    const role = u.email === ADMIN_EMAIL ? 'admin' : texte(u, 'role');
    const date = formaterDate(champ(u, 'dateCreation', 'date'));
    return `
      <tr>
        <td style="font-weight:600;">${texte(u, 'nom')}</td>
        <td>${texte(u, 'email')}</td>
        <td>${texte(u, 'tel')}</td>
        <td><span style="background:#DBEAFE;padding:2px 8px;border-radius:6px;font-size:11px;color:#1E40AF;">${role}</span></td>
        <td>${date}</td>
        <td><button onclick="supprimerUtilisateur('${u.id}')" style="padding:4px 8px;background:#EF4444;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Supprimer</button></td>
      </tr>
    `;
  }).join('');
}

function filtrerUsers() {
  const texteRecherche = (document.getElementById('filterUser')?.value || '').toLowerCase().trim();
  const role = document.getElementById('filterRole')?.value || '';

  const filtres = usersData.filter(u => {
    const nom = String(texte(u, 'nom')).toLowerCase();
    const email = String(texte(u, 'email')).toLowerCase();
    const roleUser = u.email === ADMIN_EMAIL ? 'admin' : champ(u, 'role');

    const correspondTexte = !texteRecherche || nom.includes(texteRecherche) || email.includes(texteRecherche);
    const correspondRole = !role || roleUser === role;

    return correspondTexte && correspondRole;
  });

  loadUsers(filtres);
}

function supprimerUtilisateur(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  if (u.email === ADMIN_EMAIL) { toast('⚠️ Impossible de supprimer le compte administrateur'); return; }
  document.getElementById('modalTitle').textContent = 'Supprimer cet utilisateur ?';
  document.getElementById('modalMsg').textContent = `Le profil de « ${texte(u, 'nom')} » sera supprimé de Firestore. Son compte de connexion (Firebase Auth) devra être supprimé séparément.`;
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = 'Supprimer';
  btn.onclick = () => {
    window.dbAdmin.collection('users').doc(id).delete()
      .then(() => toast('✅ Utilisateur supprimé'))
      .catch((err) => { console.error(err); toast('❌ Erreur lors de la suppression'); });
    fermerModal();
  };
  document.getElementById('modalConfirm').classList.remove('hidden');
}

function formaterDate(valeur) {
  if (!valeur) return '—';
  if (valeur.toDate) return valeur.toDate().toLocaleDateString('fr-FR');
  if (typeof valeur === 'string') return valeur;
  return '—';
}

/* ══════════════════════════════════════════════════════════
   SIGNALEMENTS (temps réel Firestore)
══════════════════════════════════════════════════════════ */
function loadSignalements() {
  const tbody = document.getElementById('signalementsBody');
  if (signalementsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Aucun signalement</td></tr>';
    return;
  }
  tbody.innerHTML = signalementsData.map(s => `
    <tr>
      <td style="font-size:12px;">${formaterDate(champ(s, 'dateCreation', 'date'))}</td>
      <td style="font-weight:600;">${texte(s, 'type')}</td>
      <td>${texte(s, 'annonceTitre', 'annonce')}</td>
      <td>${texte(s, 'signalePar')}</td>
      <td style="font-size:12px;">${texte(s, 'desc', 'description')}</td>
      <td>
        <button onclick="marquerTraite('${s.id}')" style="padding:4px 8px;background:${s.traite ? '#9CA3AF' : '#009E60'};color:#fff;border:none;border-radius:5px;cursor:${s.traite ? 'default' : 'pointer'};font-size:11px;" ${s.traite ? 'disabled' : ''}>
          ${s.traite ? '✓ Traité' : 'Traiter'}
        </button>
      </td>
    </tr>
  `).join('');
}

function marquerTraite(id) {
  window.dbAdmin.collection('signalements').doc(id).update({ traite: true })
    .then(() => toast('✅ Signalement marqué comme traité'))
    .catch((err) => { console.error(err); toast('❌ Erreur'); });
}

/* ══════════════════════════════════════════════════════════
   MESSAGES (temps réel Firestore)
══════════════════════════════════════════════════════════ */
function loadMessages() {
  const tbody = document.getElementById('messagesBody');
  if (messagesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Aucun message</td></tr>';
    return;
  }
  tbody.innerHTML = messagesData.map(m => {
    const msg = texte(m, 'msg', 'message');
    return `
      <tr style="${m.lu ? '' : 'font-weight:600;'}">
        <td style="font-size:12px;">${formaterDate(champ(m, 'dateCreation', 'date'))}</td>
        <td>${texte(m, 'nom')}</td>
        <td>${texte(m, 'tel')}</td>
        <td>${texte(m, 'sujet')}</td>
        <td style="font-size:12px;max-width:200px;">${String(msg).substring(0, 50)}${msg.length > 50 ? '...' : ''}</td>
        <td><button onclick="lireMessage('${m.id}')" style="padding:4px 8px;background:#3A75C4;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Lire</button></td>
      </tr>
    `;
  }).join('');
}

function lireMessage(id) {
  const m = messagesData.find(x => x.id === id);
  if (!m) return;
  alert(`De : ${texte(m, 'nom')} (${texte(m, 'tel')})\nSujet : ${texte(m, 'sujet')}\n\n${texte(m, 'msg', 'message')}`);
  if (!m.lu) window.dbAdmin.collection('messages').doc(id).update({ lu: true }).catch(() => {});
}

/* ══════════════════════════════════════════════════════════
   STATISTIQUES
══════════════════════════════════════════════════════════ */
function loadStats() {
  alert('📊 Statistiques:\n- Total annonces: ' + annoncesData.length + '\n- Total utilisateurs: ' + usersData.length + '\n- Signalements non traités: ' + signalementsData.filter(s => !s.traite).length);
}

/* ══════════════════════════════════════════════════════════
   PUBLICATION ANNONCE — écrit réellement dans Firestore
══════════════════════════════════════════════════════════ */
function publierAnnonce() {
  const titre = document.getElementById('pubTitre').value.trim();
  const type = document.getElementById('pubType').value;
  const commune = document.getElementById('pubVille').value;
  const quartier = document.getElementById('pubQuartier').value.trim();
  const arrondissement = document.getElementById('pubArrondissement').value.trim();
  const prix = document.getElementById('pubPrix').value;
  const tel = document.getElementById('pubTel').value.trim();

  if (!titre || !type || !commune || !quartier || !prix || !tel) {
    alert('⚠️ Remplissez tous les champs obligatoires (*)');
    return;
  }

  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }

  const equipements = Array.from(document.querySelectorAll('#tagsPicker input:checked')).map(el => el.value);
  const btn = document.getElementById('pubBtnText');
  btn.textContent = '⏳ Publication...';

  const lat = parseFloat(document.getElementById('pubLat').value);
  const lng = parseFloat(document.getElementById('pubLng').value);

  const nouvelleAnnonce = {
    titre, type, commune, quartier, arrondissement,
    prix: parseInt(prix) || 0,
    surface: parseInt(document.getElementById('pubSurface').value) || 0,
    chambres: parseInt(document.getElementById('pubChambres').value) || 0,
    sdb: parseInt(document.getElementById('pubSdb').value) || 0,
    description: document.getElementById('pubDesc').value.trim(),
    equipements,
    statut: document.getElementById('pubStatut').value || 'disponible',
    proprietaireNom: document.getElementById('pubProprioNom').value.trim() || 'Admin',
    proprietaireTel: tel,
    proprietaireEmail: document.getElementById('pubProprioEmail').value.trim() || null,
    whatsapp: tel,
    vues: 0,
    dateCreation: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!isNaN(lat) && !isNaN(lng)) { nouvelleAnnonce.lat = lat; nouvelleAnnonce.lng = lng; }

  window.dbAdmin.collection('annonces').add(nouvelleAnnonce)
    .then(() => {
      toast('✅ Annonce publiée avec succès !');
      resetForm();
      showPage('annonces');
    })
    .catch((err) => {
      console.error(err);
      toast('❌ Erreur lors de la publication');
    })
    .finally(() => { btn.textContent = '📤 Publier l\'annonce'; });
}

function resetForm() {
  document.getElementById('pubTitre').value = '';
  document.getElementById('pubType').value = '';
  document.getElementById('pubVille').value = '';
  document.getElementById('pubQuartier').value = '';
  document.getElementById('pubArrondissement').value = '';
  document.getElementById('pubPrix').value = '';
  document.getElementById('pubTel').value = '';
  document.getElementById('pubDesc').value = '';
  document.getElementById('pubSurface').value = '';
  document.getElementById('pubChambres').value = '';
  document.getElementById('pubSdb').value = '';
  document.getElementById('pubProprioNom').value = '';
  document.getElementById('pubProprioEmail').value = '';
  document.getElementById('pubLat').value = '';
  document.getElementById('pubLng').value = '';
  document.querySelectorAll('#tagsPicker input:checked').forEach(el => el.checked = false);
}

function genererTitreIA() {
  alert('✨ Génération IA activée\n(Nécessite une API, configurez votre clé dans ia-helper.js)');
}

/* ══════════════════════════════════════════════════════════
   UTILITAIRES UI
══════════════════════════════════════════════════════════ */
function initTheme() {
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('malaga_admin_theme', theme);
  location.reload();
}

function initTopbarDate() {
  const d = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  document.getElementById('topbarDate').textContent = d.toLocaleDateString('fr-FR', options);
}

function initSidebar() {
  const burger = document.getElementById('burgerAdmin');
  const sidebar = document.getElementById('sidebar');
  const close = document.getElementById('sidebarClose');

  if (burger) burger.onclick = () => sidebar.style.transform = 'translateX(0)';
  if (close) close.onclick = () => sidebar.style.transform = 'translateX(-100%)';
}

function fermerModal() {
  document.getElementById('modalConfirm').classList.add('hidden');
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }
}


