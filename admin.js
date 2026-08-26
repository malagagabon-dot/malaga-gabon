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

/* ══════════ SÉCURITÉ : échappement HTML ══════════
   Empêche l'injection de code (XSS) via des données saisies par les
   utilisateurs (titres d'annonces, noms, messages...) puis affichées
   avec innerHTML. Utiliser sur TOUTE valeur d'origine utilisateur avant
   de l'insérer dans un template HTML. Exposée sur window pour être
   utilisable aussi par reservations-admin.js (script classique, même
   portée globale). */
function escapeHTML(valeur) {
  const div = document.createElement('div');
  div.textContent = valeur === undefined || valeur === null ? '' : String(valeur);
  return div.innerHTML;
}
window.escapeHTML = escapeHTML;

let currentUser = null;
let annoncesData = [];       // alimenté en temps réel depuis Firestore "annonces"
let usersData = [];          // alimenté en temps réel depuis Firestore "users"
let signalementsData = [];   // alimenté en temps réel depuis Firestore "signalements"
let messagesData = [];       // alimenté en temps réel depuis Firestore "messages"
let likesData = [];          // alimenté en temps réel depuis Firestore "likes"
let theme = localStorage.getItem('malaga_admin_theme') || 'light';
let ecouteAnnoncesDemarree = false;
let ecouteUsersDemarree = false;
let ecouteSignalementsDemarree = false;
let ecouteMessagesDemarree = false;
let ecouteLikesDemarree = false;
let ecouteNotifsPrefsDemarree = false;
let ecouteNotifsGlobalesDemarree = false;
let notifsPrefsData = [];        // alimenté en temps réel depuis Firestore "notifsPrefs"
let notificationsGlobalesData = []; // alimenté en temps réel depuis Firestore "notificationsGlobales"
let verificationsData = [];      // alimenté en temps réel depuis Firestore "verificationsIdentite"
let alertesFraudeData = [];      // alimenté en temps réel depuis Firestore "alertesFraude"
let ecouteVerifDemarree = false;
let ecouteAlertesFraudeDemarree = false;
let demandesQRData = [];         // alimenté en temps réel depuis Firestore "demandesQR"
let ecouteQRDemarree = false;
const selectionVerif = new Set(); // uids sélectionnés pour l'impression groupée
let pageActuelle = 'dashboard';
let periodeClassement = 'tout';

/* ══════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTopbarDate();
  initSidebar();
  initToggleMdp();
  initMdpOublieAdmin();
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
  remplir('modEtage', ref.ETAGES);
  remplir('modVue', ref.VUES);
  remplir('pubEtage', ref.ETAGES);
  remplir('pubVue', ref.VUES);

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
  const successEl = document.getElementById('loginResetSuccess');

  successEl.classList.add('hidden');

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

/* ══════════ MOT DE PASSE OUBLIÉ (admin) ══════════ */
function initMdpOublieAdmin() {
  const lien = document.getElementById('lienMdpOublieAdmin');
  if (!lien) return;
  lien.addEventListener('click', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    const successEl = document.getElementById('loginResetSuccess');
    const email = document.getElementById('adminEmail').value.trim() || ADMIN_EMAIL;

    errEl.classList.add('hidden');
    successEl.classList.add('hidden');
    lien.textContent = 'Envoi...';

    authAdmin.sendPasswordResetEmail(email, {
      url: "https://malagagabon-dot.github.io/malaga-gabon/reinitialiser.html"
    })
      .then(() => {
        successEl.classList.remove('hidden');
        lien.textContent = 'Mot de passe oublié ?';
      })
      .catch((err) => {
        const messages = {
          'auth/invalid-email': "Adresse email invalide.",
          'auth/user-not-found': "Aucun compte administrateur avec cet email.",
          'auth/too-many-requests': "Trop de tentatives. Réessayez dans quelques minutes."
        };
        errEl.textContent = '❌ ' + (messages[err.code] || "Une erreur est survenue. Réessayez.");
        errEl.classList.remove('hidden');
        lien.textContent = 'Mot de passe oublié ?';
      });
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
  demarrerEcouteVerification();
  demarrerEcouteAlertesFraude();
  demarrerEcouteQR();
  loadDashboard();

  // Lien profond depuis le message WhatsApp envoyé par un propriétaire qui
  // demande l'activation de son code QR premium (?qrDemande=idDuDocument) :
  // on ouvre
  // directement la page dédiée pour que l'admin puisse valider en un clic
  // après discussion et réception du paiement.
  const paramsAdmin = new URLSearchParams(location.search);
  const qrDemandeUid = paramsAdmin.get('qrDemande');
  if (qrDemandeUid) {
    showPage('codesqr');
    setTimeout(() => {
      document.getElementById('filterQR').value = '';
      filtrerQR();
      const ligne = document.getElementById('ligneQR-' + qrDemandeUid);
      if (ligne) {
        ligne.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ligne.classList.add('ligne-mise-en-avant');
      }
    }, 400);
  }

  initClicAlertesAdmin();
}

/* ══════════════════════════════════════════════════════════
   CENTRE D'ALERTES ADMIN (🔔 topbar) — remplace l'icône de traduction
   (celle-ci restait de toute façon sans effet dans la topbar ; elle reste
   disponible pour les visiteurs via le menu ☰ du site public).
   Agrège, par catégorie, ce qui nécessite l'attention de l'admin : signale-
   ments non traités, vérifications d'identité en attente, alertes anti-
   fraude, demandes de code QR premium en attente. Chaque ligne cliquable
   ouvre directement l'outil de gestion concerné (showPage). Pas de liste
   item par item comme côté utilisateur : ici les tableaux dédiés existent
   déjà pour le détail, l'admin a juste besoin d'un aperçu qui pointe dessus.
══════════════════════════════════════════════════════════ */
let clicAlertesAdminInit = false;
function initClicAlertesAdmin() {
  if (clicAlertesAdminInit) return;
  clicAlertesAdminInit = true;

  const btn = document.getElementById('btnAlertesAdmin');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('alertesPanelAdmin')?.classList.toggle('ouvert');
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('alertesPanelAdmin');
    if (!panel || !panel.classList.contains('ouvert')) return;
    if (panel.contains(e.target) || e.target.closest('#btnAlertesAdmin')) return;
    panel.classList.remove('ouvert');
  });
}

function construirePanneauAlertesAdmin() {
  let panel = document.getElementById('alertesPanelAdmin');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'alertesPanelAdmin';
    panel.className = 'alertes-panel-admin';
    document.body.appendChild(panel);
  }
  return panel;
}

function rendreAlertesAdmin() {
  const nbSignal = signalementsData.filter(s => !s.traite).length;
  const nbVerif = verificationsData.filter(v => v.statut === 'attente').length;
  const nbFraude = alertesFraudeData.filter(a => !a.traite).length;
  const nbQR = demandesQRData.filter(q => q.statut === 'en_attente').length;
  const total = nbSignal + nbVerif + nbFraude + nbQR;

  const badge = document.getElementById('badgeAlertesAdmin');
  if (badge) {
    badge.textContent = total || '';
    badge.style.display = total ? 'flex' : 'none';
  }

  const categories = [
    { n: nbSignal, icone: '🚨', texte: 'signalement(s) non traité(s)', page: 'signalements' },
    { n: nbVerif, icone: '📁', texte: "vérification(s) d'identité en attente", page: 'verification' },
    { n: nbFraude, icone: '⚠️', texte: 'alerte(s) anti-fraude', page: 'verification' },
    { n: nbQR, icone: '🔲', texte: 'demande(s) de code QR premium en attente', page: 'codesqr' }
  ].filter(c => c.n > 0);

  const panel = construirePanneauAlertesAdmin();
  panel.innerHTML = `
    <div class="alertes-titre-admin">🔔 Alertes</div>
    <div class="alertes-liste-admin">
      ${categories.length ? categories.map(c => `
        <button type="button" class="alertes-item-admin" data-page="${c.page}">
          <span class="alertes-icone-admin">${c.icone}</span>
          <span>${c.n} ${c.texte}</span>
        </button>`).join('') : `<div class="alertes-vide-admin">Aucune alerte en attente 👍</div>`}
    </div>`;

  panel.querySelectorAll('.alertes-item-admin').forEach(el => {
    el.addEventListener('click', () => {
      showPage(el.dataset.page);
      panel.classList.remove('ouvert');
    });
  });
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

    const enAttente = usersData.filter(u => u.compteType === 'entreprise' && u.statutEntreprise === 'attente').length;
    const badgeEnt = document.getElementById('badgeEntreprisesAttente');
    if (badgeEnt) badgeEnt.textContent = enAttente;

    if (pageActuelle === 'dashboard') loadDashboard();
    if (pageActuelle === 'utilisateurs') filtrerUsers();
    if (pageActuelle === 'entreprises') filtrerEntreprises();
  }, (err) => {
    console.error('Erreur de synchronisation des utilisateurs :', err);
    const tbody = document.getElementById('usersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Impossible de charger les utilisateurs. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — VÉRIFICATIONS D'IDENTITÉ
   (Firestore, collection "verificationsIdentite")
   Alimentée par connexion.html/auth.js à l'inscription (voir
   enregistrerVerificationIdentite). Jointe à usersData (même uid) pour
   afficher nom/email/tel dans le tableau.
══════════════════════════════════════════════════════════ */
function demarrerEcouteVerification() {
  if (ecouteVerifDemarree) return;
  ecouteVerifDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('verificationsIdentite').onSnapshot((snap) => {
    verificationsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    calculerKpiVerif();
    if (pageActuelle === 'verification') filtrerVerif();
    rendreAlertesAdmin();
  }, (err) => {
    console.error('Erreur de synchronisation des vérifications d\'identité :', err);
    const tbody = document.getElementById('verifTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Impossible de charger les dossiers. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — ALERTES ANTI-FRAUDE (Firestore, collection "alertesFraude")
   Alimentée automatiquement à l'inscription (voir auth.js).
══════════════════════════════════════════════════════════ */
function demarrerEcouteAlertesFraude() {
  if (ecouteAlertesFraudeDemarree) return;
  ecouteAlertesFraudeDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('alertesFraude').orderBy('dateCreation', 'desc').onSnapshot((snap) => {
    alertesFraudeData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nbNonTraitees = alertesFraudeData.filter(a => !a.traite).length;
    const badge = document.getElementById('badgeFraude');
    if (badge) badge.textContent = nbNonTraitees;
    if (pageActuelle === 'verification') { loadAlertesFraude(); filtrerVerif(); }
    rendreAlertesAdmin();
  }, (err) => {
    console.error('Erreur de synchronisation des alertes anti-fraude :', err);
    const tbody = document.getElementById('alertesFraudeBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Impossible de charger les alertes. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — DEMANDES D'ACTIVATION QR PREMIUM
   (Firestore, collection "demandesQR", doc id = uid du propriétaire)
   Écrite par profil.html quand un propriétaire clique "Demander l'activation".
   Monétisation : la vue plein écran / impression / téléchargement du code QR
   d'un propriétaire ne s'active QUE via validerDemandeQR() ci-dessous, après
   discussion et réception du paiement à distance par l'admin.
══════════════════════════════════════════════════════════ */
function demarrerEcouteQR() {
  if (ecouteQRDemarree) return;
  ecouteQRDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('demandesQR').onSnapshot((snap) => {
    demandesQRData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const nbAttente = demandesQRData.filter(q => q.statut === 'en_attente').length;
    const badge = document.getElementById('badgeQR');
    if (badge) badge.textContent = nbAttente;
    if (pageActuelle === 'codesqr') filtrerQR();
    rendreAlertesAdmin();
  }, (err) => {
    console.error('Erreur de synchronisation des demandes QR :', err);
    const tbody = document.getElementById('qrTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Impossible de charger les demandes. Vérifiez les règles Firestore.</td></tr>';
  });
}

let filtreStatutQRActuel = '';
function filtrerQRParStatut(statut) {
  filtreStatutQRActuel = statut;
  const select = document.getElementById('filterStatutQR');
  if (select) select.value = statut;
  filtrerQR();
}

function calculerKpiQR() {
  const total = demandesQRData.length;
  const attente = demandesQRData.filter(q => q.statut === 'en_attente').length;
  const actifs = demandesQRData.filter(q => q.statut === 'validee').length;
  const refusees = demandesQRData.filter(q => q.statut === 'refusee').length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpiQRTotal', total);
  set('kpiQRAttente', attente);
  set('kpiQRActifs', actifs);
  set('kpiQRRefusees', refusees);
}

function filtrerQR() {
  calculerKpiQR();
  const recherche = (document.getElementById('filterQR')?.value || '').toLowerCase();
  const statutFiltre = document.getElementById('filterStatutQR')?.value || filtreStatutQRActuel;
  const tbody = document.getElementById('qrTableBody');
  if (!tbody) return;

  let liste = demandesQRData.slice().sort((a, b) => (b.dateDemande?.seconds || 0) - (a.dateDemande?.seconds || 0));
  if (statutFiltre) liste = liste.filter(q => q.statut === statutFiltre);
  if (recherche) {
    liste = liste.filter(q =>
      (q.proprietaireNom || '').toLowerCase().includes(recherche) ||
      (q.numeroMalaga || '').toLowerCase().includes(recherche) ||
      (q.proprietaireTel || '').toLowerCase().includes(recherche));
  }

  if (!liste.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Aucune demande.</td></tr>';
    return;
  }

  const badgesStatut = {
    en_attente: '<span class="badge badge-yellow">⏳ En attente</span>',
    validee: '<span class="badge badge-green">✅ Activé</span>',
    refusee: '<span class="badge badge-red">🚫 Refusée</span>'
  };

  tbody.innerHTML = liste.map(q => {
    const dateStr = q.dateDemande?.toDate ? q.dateDemande.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const telPropre = (q.proprietaireTel || '').replace(/[^\d]/g, '');
    let actions = '';
    if (q.statut === 'en_attente') {
      actions = `<button class="btn-outline-sm" style="color:#059669;border-color:#059669;" onclick="validerDemandeQR('${q.id}')">✅ Activer</button>
        <button class="btn-outline-sm" style="color:#B91C1C;border-color:#B91C1C;" onclick="refuserDemandeQR('${q.id}')">🚫 Refuser</button>`;
    } else if (q.statut === 'validee') {
      actions = `<button class="btn-outline-sm" style="color:#B91C1C;border-color:#B91C1C;" onclick="revoquerAccesQR('${q.id}')">⛔ Révoquer</button>`;
    } else {
      actions = `<button class="btn-outline-sm" style="color:#059669;border-color:#059669;" onclick="validerDemandeQR('${q.id}')">✅ Activer quand même</button>`;
    }
    if (telPropre) {
      actions += ` <a class="btn-outline-sm" href="https://wa.me/${telPropre}" target="_blank" rel="noopener">💬</a>`;
    }
    return `<tr id="ligneQR-${q.id}">
      <td>${escapeHTML(q.proprietaireNom || '—')}</td>
      <td style="font-family:'Courier New',monospace;font-weight:700;">${escapeHTML(q.numeroMalaga || '—')}</td>
      <td>${escapeHTML(q.typeCompte || '—')}</td>
      <td>${escapeHTML(q.proprietaireTel || '—')}</td>
      <td>${badgesStatut[q.statut] || q.statut || '—'}</td>
      <td>${dateStr}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</td>
    </tr>`;
  }).join('');
}

/* Active la vue plein écran / impression / téléchargement du QR pour ce
   propriétaire (users/{uid}.qrPremiumActif = true), après discussion et
   réception du paiement à distance — c'est le geste final de monétisation.
   Envoie ensuite une confirmation WhatsApp au propriétaire concerné.
   NOTE : `idDemande` est l'id du document demandesQR (généré par addDoc côté
   profil.html), PAS l'uid du propriétaire — les deux sont différents depuis
   qu'une demande peut être renvoyée plusieurs fois. L'uid réel se lit dans
   demande.proprietaireId. */
function validerDemandeQR(idDemande) {
  const demande = demandesQRData.find(q => q.id === idDemande);
  if (!demande) { alert('Demande introuvable. Rafraîchissez la page et réessayez.'); return; }
  if (!confirm(`Confirmer l'activation de la vue plein écran / impression du code QR pour ${demande.proprietaireNom || 'ce membre'} ?\n\nÀ n'utiliser qu'après réception effective du paiement.`)) return;

  Promise.all([
    window.dbAdmin.collection('users').doc(demande.proprietaireId).update({
      qrPremiumActif: true,
      qrPremiumActiveLe: firebase.firestore.FieldValue.serverTimestamp()
    }),
    window.dbAdmin.collection('demandesQR').doc(idDemande).update({
      statut: 'validee',
      dateTraitement: firebase.firestore.FieldValue.serverTimestamp()
    })
  ]).then(() => {
    const telPropre = (demande.proprietaireTel || '').replace(/[^\d]/g, '');
    if (telPropre) {
      const texte = `Bonjour ${demande.proprietaireNom || ''}, votre code QR MALAGA est activé ✅. Vous pouvez maintenant l'afficher en plein écran, l'imprimer et le télécharger depuis votre profil.`;
      window.open(`https://wa.me/${telPropre}?text=${encodeURIComponent(texte)}`, '_blank');
    }
  }).catch((err) => {
    console.error('Erreur activation QR premium :', err);
    alert('Impossible d\'activer l\'accès (' + (err.code || err.message || 'erreur inconnue') + '). Réessayez.');
  });
}

function refuserDemandeQR(idDemande) {
  const demande = demandesQRData.find(q => q.id === idDemande);
  if (!demande) { alert('Demande introuvable. Rafraîchissez la page et réessayez.'); return; }
  if (!confirm(`Refuser la demande d'activation QR de ${demande.proprietaireNom || 'ce membre'} ?`)) return;

  window.dbAdmin.collection('demandesQR').doc(idDemande).update({
    statut: 'refusee',
    dateTraitement: firebase.firestore.FieldValue.serverTimestamp()
  }).catch((err) => {
    console.error('Erreur refus demande QR :', err);
    alert('Impossible de refuser la demande (' + (err.code || err.message || 'erreur inconnue') + '). Réessayez.');
  });
}

function revoquerAccesQR(idDemande) {
  const demande = demandesQRData.find(q => q.id === idDemande);
  if (!demande) { alert('Demande introuvable. Rafraîchissez la page et réessayez.'); return; }
  if (!confirm(`Révoquer l'accès premium QR de ${demande.proprietaireNom || 'ce membre'} ?`)) return;

  Promise.all([
    window.dbAdmin.collection('users').doc(demande.proprietaireId).update({ qrPremiumActif: false }),
    window.dbAdmin.collection('demandesQR').doc(idDemande).update({
      statut: 'refusee',
      dateTraitement: firebase.firestore.FieldValue.serverTimestamp()
    })
  ]).catch((err) => {
    console.error('Erreur révocation accès QR :', err);
    alert('Impossible de révoquer l\'accès (' + (err.code || err.message || 'erreur inconnue') + '). Réessayez.');
  });
}
window.filtrerQRParStatut = filtrerQRParStatut;
window.filtrerQR = filtrerQR;
window.validerDemandeQR = validerDemandeQR;
window.refuserDemandeQR = refuserDemandeQR;
window.revoquerAccesQR = revoquerAccesQR;

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
    rendreAlertesAdmin();
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
   ÉCOUTE TEMPS RÉEL — LIKES (Firestore, collection "likes")
   Écrite par le site public via nav.js (clic sur ❤️). Le compteur
   all-time (nbLikes) est directement sur le document "annonces" ;
   cette écoute sert seulement au classement par période (semaine/mois).
══════════════════════════════════════════════════════════ */
function demarrerEcouteLikes() {
  if (ecouteLikesDemarree) return;
  ecouteLikesDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('likes').onSnapshot((snap) => {
    likesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (pageActuelle === 'classement') rendreClassement();
  }, (err) => {
    console.error('Erreur de synchronisation des likes :', err);
    const tbody = document.getElementById('classementTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Impossible de charger les likes. Vérifiez les règles Firestore.</td></tr>';
  });
}

/* ══════════════════════════════════════════════════════════
   CLASSEMENT DES LIKES
══════════════════════════════════════════════════════════ */
function changerPeriodeClassement() {
  periodeClassement = document.getElementById('filterPeriodeClassement')?.value || 'tout';
  rendreClassement();
}

function trierClassement() {
  // Un seul critère de tri pour l'instant (nombre de likes, décroissant) ;
  // le clic sur l'en-tête ré-affiche simplement le classement à jour.
  rendreClassement();
}

function rendreClassement() {
  const tbody = document.getElementById('classementTableBody');
  if (!tbody) return;

  const recherche = (document.getElementById('filterClassement')?.value || '').toLowerCase().trim();

  let compteurs; // Map annonceId -> nombre de likes sur la période choisie
  if (periodeClassement === 'tout') {
    compteurs = new Map(annoncesData.map(a => [a.id, nombre(a, 'nbLikes')]));
  } else {
    const maintenant = Date.now();
    const seuilMs = periodeClassement === 'semaine' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    compteurs = new Map();
    likesData.forEach(l => {
      const t = l.dateLike?.toMillis?.() || 0;
      if (!t || maintenant - t > seuilMs) return;
      compteurs.set(l.annonceId, (compteurs.get(l.annonceId) || 0) + 1);
    });
  }

  let lignes = annoncesData
    .map(a => ({ annonce: a, likes: compteurs.get(a.id) || 0 }))
    .filter(({ likes }) => periodeClassement === 'tout' || likes > 0)
    .filter(({ annonce }) => {
      if (!recherche) return true;
      const titre = String(texte(annonce, 'titre', 'title')).toLowerCase();
      const proprio = String(texte(annonce, 'proprietaireNom', 'proprio')).toLowerCase();
      return titre.includes(recherche) || proprio.includes(recherche);
    })
    .sort((a, b) => b.likes - a.likes);

  if (lignes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Aucun like pour le moment.</td></tr>';
    return;
  }

  tbody.innerHTML = lignes.map(({ annonce: a, likes }, i) => {
    const rang = i + 1;
    const tendance = rang <= 3 && likes > 0 ? ' <span class="badge" style="background:#FEF3C7;color:#92400E;">🔥 Tendance</span>' : '';
    return `
      <tr>
        <td style="font-weight:700;">${rang === 1 ? '🥇' : rang === 2 ? '🥈' : rang === 3 ? '🥉' : rang}</td>
        <td style="font-weight:600;">${escapeHTML(String(texte(a, 'titre', 'title')).substring(0, 30))}${tendance}</td>
        <td>${escapeHTML(texte(a, 'proprietaireNom', 'proprio'))}</td>
        <td>${escapeHTML(texte(a, 'commune', 'ville'))}</td>
        <td style="font-weight:700;">❤️ ${likes}</td>
        <td><button onclick="voirAnnonce('${a.id}')" style="padding:4px 8px;background:#3A75C4;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Voir</button></td>
      </tr>
    `;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — VISITES DU SITE (Firestore, "visites")
   Écrit par tracking.js sur chaque page publique (type "page") et à
   chaque ouverture de fiche annonce (type "annonce"). Lecture réservée
   à l'admin (règle globale) — jamais exposé aux visiteurs.
══════════════════════════════════════════════════════════ */
let visitesData = [];
let ecouteVisitesDemarree = false;
let filtreVisites = { mode: 'tout', cible: null, titre: null };

function filtrerVisites(mode, cible = null, titre = null) {
  filtreVisites = { mode, cible, titre };
  rendreStatsVisites();
  document.getElementById('visitesTableBody')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.filtrerVisites = filtrerVisites;

function demarrerEcouteVisites() {
  if (ecouteVisitesDemarree) return;
  ecouteVisitesDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('visites').orderBy('dateCreation', 'desc').limit(300).onSnapshot((snap) => {
    visitesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rendreStatsVisites();
  }, (err) => {
    console.error('Erreur de synchronisation des visites :', err);
  });
}

function rendreStatsVisites() {
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const versMillis = (v) => v?.dateCreation?.toMillis ? v.dateCreation.toMillis() : 0;

  const visitesAujourdhui = visitesData.filter(v => versMillis(v) >= debutJour.getTime());
  const sessionsUniquesAujourdhui = new Set(visitesAujourdhui.map(v => v.session)).size;
  const sessionsUniquesTotal = new Set(visitesData.map(v => v.session)).size;
  const scansQRTotal = visitesData.filter(v => v.type === 'qr').length;

  const elJour = document.getElementById('kpiVisitesJour');
  if (elJour) elJour.textContent = visitesAujourdhui.length;
  const elVisiteursJour = document.getElementById('kpiVisiteursJour');
  if (elVisiteursJour) elVisiteursJour.textContent = sessionsUniquesAujourdhui;
  const elVisiteursTotal = document.getElementById('kpiVisiteursTotal');
  if (elVisiteursTotal) elVisiteursTotal.textContent = sessionsUniquesTotal;
  const elQRTotal = document.getElementById('kpiQRTotal');
  if (elQRTotal) elQRTotal.textContent = scansQRTotal;

  const compteurAnnonces = {};
  visitesData.filter(v => v.type === 'annonce').forEach(v => {
    compteurAnnonces[v.cible] = compteurAnnonces[v.cible] || { cible: v.cible, titre: v.titre || v.cible, total: 0 };
    compteurAnnonces[v.cible].total++;
  });
  const topAnnonces = Object.values(compteurAnnonces).sort((a, b) => b.total - a.total).slice(0, 5);
  const elTop = document.getElementById('chartTopVisites');
  if (elTop) {
    elTop.innerHTML = topAnnonces.length
      ? topAnnonces.map((a, i) => `<div class="bar-row-clic" data-idx="${i}" style="cursor:pointer;display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;"><span>${escapeHTML(a.titre)}</span><strong>${a.total}</strong></div>`).join('')
      : '<div class="table-empty">Aucune consultation enregistrée.</div>';
    elTop.querySelectorAll('.bar-row-clic').forEach(el => {
      el.addEventListener('click', () => {
        const a = topAnnonces[Number(el.dataset.idx)];
        filtrerVisites('annonce', a.cible, a.titre);
      });
    });
  }

  // Applique le filtre actif (déclenché par le clic sur une tuile ou une annonce du Top 5)
  let visitesAffichees = visitesData;
  let texteFiltre = '';
  if (filtreVisites.mode === 'jour') {
    visitesAffichees = visitesAujourdhui;
    texteFiltre = "Filtre : aujourd'hui";
  } else if (filtreVisites.mode === 'annonce') {
    visitesAffichees = visitesData.filter(v => v.type === 'annonce' && v.cible === filtreVisites.cible);
    texteFiltre = `Filtre : annonce « ${filtreVisites.titre || filtreVisites.cible} »`;
  } else if (filtreVisites.mode === 'qr') {
    visitesAffichees = visitesData.filter(v => v.type === 'qr');
    texteFiltre = '🔲 Filtre : scans du code QR';
  }

  const elLabel = document.getElementById('filtreVisitesLabel');
  const elLabelTexte = document.getElementById('filtreVisitesTexte');
  if (elLabel && elLabelTexte) {
    elLabel.style.display = filtreVisites.mode === 'tout' ? 'none' : 'flex';
    elLabelTexte.textContent = texteFiltre;
  }

  const corps = document.getElementById('visitesTableBody');
  if (!corps) return;
  if (visitesAffichees.length === 0) {
    corps.innerHTML = '<tr><td colspan="4" class="table-empty">Aucune visite pour ce filtre.</td></tr>';
    return;
  }
  corps.innerHTML = visitesAffichees.slice(0, 100).map(v => {
    const u = v.uid ? usersData.find(x => x.id === v.uid) : null;
    const qui = u ? (u.nom || u.email || 'Compte inconnu') : (v.uid ? 'Compte inconnu' : 'Visiteur anonyme');
    const quoi = v.type === 'annonce' ? `Annonce : ${v.titre || v.cible}`
      : v.type === 'qr' ? `🔲 Code QR : ${v.titre || v.cible}`
      : `Page : ${v.cible}`;
    const ou = [v.ville, v.pays].filter(Boolean).join(', ') || '—';
    const quand = v.dateCreation?.toDate ? v.dateCreation.toDate().toLocaleString('fr-FR') : '—';
    return `<tr><td>${quand}</td><td>${escapeHTML(qui)}</td><td>${escapeHTML(quoi)}</td><td>${escapeHTML(ou)}</td></tr>`;
  }).join('');
}

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
    'entreprises': '🏢 Comptes professionnels',
    'verification': '📁 Vérification & Archives',
    'codesqr': '🔲 Codes QR — accès premium',
    'signalements': 'Signalements',
    'reservations': 'Demandes de visite',
    'messages': 'Messages',
    'stats': 'Statistiques',
    'publier': 'Publier une annonce',
    'classement': '🔥 Classement des likes',
    'notifications': '🔔 Notifications'
  };
  document.getElementById('topbarTitle').textContent = titles[pageId] || 'MALAGA Admin';

  if (pageId === 'dashboard') loadDashboard();
  else if (pageId === 'annonces') filtrerAnnonces();
  else if (pageId === 'utilisateurs') filtrerUsers();
  else if (pageId === 'entreprises') filtrerEntreprises();
  else if (pageId === 'verification') { filtrerVerif(); loadAlertesFraude(); }
  else if (pageId === 'codesqr') { demarrerEcouteQR(); filtrerQR(); }
  else if (pageId === 'signalements') loadSignalements();
  else if (pageId === 'reservations' && window.chargerReservations) window.chargerReservations();
  else if (pageId === 'messages') loadMessages();
  else if (pageId === 'stats') demarrerEcouteVisites();
  else if (pageId === 'publier') { initPubMiniMap(); adapterPubFormulaireAuType(); }
  else if (pageId === 'classement') { demarrerEcouteLikes(); rendreClassement(); }
  else if (pageId === 'notifications') { demarrerEcouteNotifsPrefs(); demarrerEcouteNotificationsGlobales(); }
}

/* ══════════════════════════════════════════════════════════
   ÉCOUTE TEMPS RÉEL — PRÉFÉRENCES DE NOTIFICATIONS (Firestore, "notifsPrefs")
   Un document par visiteur/utilisateur (écrit par nav.js, menu "🔔 Activer
   les notifications"). Permet de savoir combien de personnes ont activé les
   notifications, sans jamais accéder à leurs données personnelles.
══════════════════════════════════════════════════════════ */
function demarrerEcouteNotifsPrefs() {
  if (ecouteNotifsPrefsDemarree) return;
  ecouteNotifsPrefsDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('notifsPrefs').onSnapshot((snap) => {
    notifsPrefsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rendreStatNotifsPrefs();
  }, (err) => {
    console.error('Erreur de synchronisation des préférences de notifications :', err);
  });
}

function rendreStatNotifsPrefs() {
  const el = document.getElementById('kpiNotifsActives');
  if (el) el.textContent = notifsPrefsData.filter(p => p.actif).length;
  const elTotal = document.getElementById('kpiNotifsTotal');
  if (elTotal) elTotal.textContent = notifsPrefsData.length;
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS GLOBALES (Firestore, "notificationsGlobales")
   Diffusées par l'admin à tous les visiteurs ayant activé les notifications
   (bandeau in-app + notification native si le navigateur le permet). Lues en
   temps réel côté public par nav.js (initEcouteNotificationsGlobales).
══════════════════════════════════════════════════════════ */
function demarrerEcouteNotificationsGlobales() {
  if (ecouteNotifsGlobalesDemarree) return;
  ecouteNotifsGlobalesDemarree = true;
  if (!window.dbAdmin) return;

  window.dbAdmin.collection('notificationsGlobales').orderBy('dateEnvoi', 'desc').onSnapshot((snap) => {
    notificationsGlobalesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rendreHistoriqueNotifsGlobales();
  }, (err) => {
    console.error('Erreur de synchronisation des notifications globales :', err);
    const tbody = document.getElementById('notifsGlobalesBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Impossible de charger l\'historique.</td></tr>';
  });
}

function rendreHistoriqueNotifsGlobales() {
  const tbody = document.getElementById('notifsGlobalesBody');
  if (!tbody) return;

  if (notificationsGlobalesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Aucune notification envoyée pour le moment.</td></tr>';
    return;
  }

  tbody.innerHTML = notificationsGlobalesData.map(n => {
    const date = n.dateEnvoi?.toDate ? n.dateEnvoi.toDate().toLocaleString('fr-FR') : '—';
    return `
      <tr>
        <td>${date}</td>
        <td style="font-weight:700;">${escapeHTML(n.titre || '—')}</td>
        <td>${escapeHTML(n.message || '—')}</td>
        <td>${escapeHTML(n.envoyePar || '—')}</td>
      </tr>`;
  }).join('');
}

function envoyerNotificationGlobale() {
  const titreEl = document.getElementById('notifGlobaleTitre');
  const messageEl = document.getElementById('notifGlobaleMessage');
  const titre = titreEl.value.trim();
  const message = messageEl.value.trim();

  if (!titre || !message) {
    alert('Merci de renseigner un titre et un message.');
    return;
  }
  if (!confirm(`Envoyer cette notification à tous les utilisateurs ayant activé les notifications (${notifsPrefsData.filter(p => p.actif).length} personne(s)) ?`)) return;

  const btn = document.getElementById('btnEnvoyerNotifGlobale');
  btn.disabled = true; btn.textContent = 'Envoi…';

  window.dbAdmin.collection('notificationsGlobales').add({
    titre,
    message,
    envoyePar: (window.currentAdminEmail || currentUser?.email || 'Administrateur'),
    dateEnvoi: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    titreEl.value = '';
    messageEl.value = '';
    alert('✅ Notification envoyée à tous les utilisateurs concernés.');
  }).catch((err) => {
    console.error('Erreur envoi notification globale :', err);
    alert('❌ Impossible d\'envoyer la notification. Réessayez.');
  }).finally(() => {
    btn.disabled = false; btn.textContent = '📢 Envoyer à tous';
  });
}
window.envoyerNotificationGlobale = envoyerNotificationGlobale;

/* ══════════════════════════════════════════════════════════
   TUILES KPI CLIQUABLES — redirection vers les données du décompte
══════════════════════════════════════════════════════════ */
function allerVersKpi(pageId) {
  showPage(pageId);
  // Petit scroll en haut de la page ciblée, utile sur mobile
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filtrerEntreprisesParStatut(statut) {
  showPage('entreprises');
  const select = document.getElementById('filterStatutEntreprise');
  if (select) {
    select.value = statut;
    filtrerEntreprises();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filtrerReservationsParStatut(statut) {
  showPage('reservations');
  const select = document.getElementById('filterResStatut');
  if (select) {
    // "__aujourdhui__" : pas de statut Firestore dédié, on affiche simplement
    // la liste complète (déjà utilisée pour calculer le compteur du jour).
    if (statut !== '__aujourdhui__') {
      select.value = statut;
    }
    select.dispatchEvent(new Event('change'));
  }
  if (typeof filtrerReservations === 'function') filtrerReservations();
  else if (window.chargerReservations) window.chargerReservations();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════
   PUBLIER — mini-carte de géolocalisation (obligatoire)
   Initialisée à la demande (au premier affichage de la page)
   pour que Leaflet mesure correctement un conteneur visible.
══════════════════════════════════════════════════════════ */
let pubMiniMap = null;
let pubMarqueur = null;
function initPubMiniMap() {
  if (!pubMiniMap && window.L) {
    pubMiniMap = L.map('pubMiniMap').setView([0.3924, 9.4536], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(pubMiniMap);
    pubMiniMap.on('click', (e) => placerPubMarqueur(e.latlng.lat, e.latlng.lng));
    document.getElementById('pubBtnMaPosition')?.addEventListener('click', () => {
      if (!navigator.geolocation) { alert("La géolocalisation n'est pas disponible sur cet appareil."); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => placerPubMarqueur(pos.coords.latitude, pos.coords.longitude),
        () => alert('Impossible de récupérer la position. Placez le repère manuellement sur la carte.')
      );
    });
  }
  setTimeout(() => pubMiniMap?.invalidateSize(), 150);
}
function placerPubMarqueur(lat, lng) {
  if (pubMarqueur) pubMiniMap.removeLayer(pubMarqueur);
  pubMarqueur = L.marker([lat, lng], { draggable: true }).addTo(pubMiniMap);
  pubMarqueur.on('dragend', () => {
    const p = pubMarqueur.getLatLng();
    document.getElementById('pubLat').value = p.lat;
    document.getElementById('pubLng').value = p.lng;
  });
  pubMiniMap.setView([lat, lng], 15);
  document.getElementById('pubLat').value = lat;
  document.getElementById('pubLng').value = lng;
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
          <td style="font-weight:700;">${escapeHTML(String(titre).substring(0, 30))}</td>
          <td>${escapeHTML(texte(a, 'commune', 'ville'))}</td>
          <td>${nombre(a, 'prix', 'prixMensuel', 'loyer').toLocaleString()}</td>
          <td><span style="background:#D1FAE5;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;">${escapeHTML(texte(a, 'statut', 'disponibilite'))}</span></td>
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
        <strong>${escapeHTML(s.type)}</strong> - ${escapeHTML(s.date)}
        <p style="color:#888;margin:4px 0 0 0;font-size:12px;">${escapeHTML(s.desc)}</p>
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
        <td style="font-size:11px;color:#0A7A45;font-family:'Courier New',monospace;font-weight:700;" title="${a.id}">${(window.MALAGA_ID?.numeroAnnonce(a.id)) || a.id}</td>
        <td style="font-weight:600;">${escapeHTML(String(titre).substring(0, 20))}</td>
        <td>${escapeHTML(texte(a, 'proprietaireNom', 'proprio', 'nomProprietaire'))}${champ(a, 'proprietaireCompteType') === 'entreprise' ? ' 🏢' : ' 🏠'}</td>
        <td>${escapeHTML(texte(a, 'commune', 'ville'))}</td>
        <td>${nombre(a, 'prix', 'prixMensuel', 'loyer').toLocaleString()}</td>
        <td>${nombre(a, 'vues').toLocaleString()}</td>
        <td><span style="background:#D1FAE5;padding:3px 8px;border-radius:6px;font-size:11px;">${escapeHTML(texte(a, 'statut', 'disponibilite'))}</span></td>
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
let modPhotosActuelles = [];

/* ══════════ GALERIE PHOTO PLEIN ÉCRAN (lightbox) ══════════
   Même comportement que sur index.html / profil.html / mes-annonces.html.
   Exposée sur window : renderPhotosModif() insère l'appel via onclick inline
   (script classique, sans modules). */
let lightboxPhotos = [], lightboxIndex = 0;

function ouvrirLightbox(photos, indexDepart) {
  lightboxPhotos = (photos || []).filter(Boolean);
  if (!lightboxPhotos.length) return;
  lightboxIndex = Math.min(indexDepart || 0, lightboxPhotos.length - 1);

  let overlay = document.getElementById('lightboxOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightboxOverlay';
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button type="button" class="lightbox-fermer" aria-label="Fermer">✕</button>
      <button type="button" class="lightbox-prec" aria-label="Photo précédente">‹</button>
      <img class="lightbox-img" alt="Photo en plein écran">
      <button type="button" class="lightbox-suiv" aria-label="Photo suivante">›</button>
      <div class="lightbox-compteur"></div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.lightbox-fermer').onclick = fermerLightbox;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fermerLightbox(); });
    overlay.querySelector('.lightbox-prec').onclick = (e) => { e.stopPropagation(); naviguerLightbox(-1); };
    overlay.querySelector('.lightbox-suiv').onclick = (e) => { e.stopPropagation(); naviguerLightbox(1); };
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('ouverte')) return;
      if (e.key === 'Escape') fermerLightbox();
      if (e.key === 'ArrowLeft') naviguerLightbox(-1);
      if (e.key === 'ArrowRight') naviguerLightbox(1);
    });
  }

  mettreAJourLightbox();
  overlay.classList.add('ouverte');
  document.body.style.overflow = 'hidden';
}

function mettreAJourLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (!overlay) return;
  overlay.querySelector('.lightbox-img').src = lightboxPhotos[lightboxIndex];
  overlay.querySelector('.lightbox-compteur').textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
  const multi = lightboxPhotos.length > 1;
  overlay.querySelector('.lightbox-prec').style.display = multi ? 'flex' : 'none';
  overlay.querySelector('.lightbox-suiv').style.display = multi ? 'flex' : 'none';
}

function naviguerLightbox(delta) {
  lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
  mettreAJourLightbox();
}

function fermerLightbox() {
  document.getElementById('lightboxOverlay')?.classList.remove('ouverte');
  document.body.style.overflow = '';
}

(function injecterStylesLightbox() {
  if (document.getElementById('malagaLightboxStyles')) return;
  const style = document.createElement('style');
  style.id = 'malagaLightboxStyles';
  style.textContent = `
    .lightbox-overlay{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:3000;}
    .lightbox-overlay.ouverte{display:flex;}
    .lightbox-img{max-width:92vw;max-height:88vh;object-fit:contain;border-radius:6px;}
    .lightbox-fermer{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:18px;cursor:pointer;}
    .lightbox-prec,.lightbox-suiv{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;width:44px;height:44px;border-radius:50%;font-size:26px;cursor:pointer;align-items:center;justify-content:center;display:flex;}
    .lightbox-prec{left:12px;}
    .lightbox-suiv{right:12px;}
    .lightbox-compteur{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);color:#fff;font-size:12.5px;background:rgba(255,255,255,.15);padding:4px 12px;border-radius:20px;}
    .photo-row img{cursor:zoom-in;}
  `;
  document.head.appendChild(style);
})();

function renderPhotosModif() {
  const wrap = document.getElementById('modPhotosManager');
  if (!wrap) return;
  wrap.innerHTML = modPhotosActuelles.length
    ? modPhotosActuelles.map((url, i) => `
      <div class="photo-row" data-i="${i}">
        <img src="${(url || '').replace(/"/g, '&quot;')}" alt="Photo ${i + 1}" onerror="this.style.visibility='hidden'" onclick="ouvrirLightbox(modPhotosActuelles, ${i})" />
        <input type="text" value="${(url || '').replace(/"/g, '&quot;')}"
               placeholder="https://exemple.com/photo.jpg"
               oninput="modPhotosActuelles[${i}] = this.value; document.querySelectorAll('.photo-row')[${i}].querySelector('img').src = this.value;" />
        <button type="button" class="photo-remove" onclick="supprimerPhotoModif(${i})" title="Supprimer cette photo">✕</button>
      </div>
    `).join('')
    : '<p class="photos-empty">Aucune photo pour l\'instant. Clique sur « Ajouter une photo » ci-dessous.</p>';
}

function ajouterPhotoModif() {
  modPhotosActuelles.push('');
  renderPhotosModif();
}

function supprimerPhotoModif(i) {
  modPhotosActuelles.splice(i, 1);
  renderPhotosModif();
}

/* Même logique que côté publication : masque chambres/salons/sdb/cuisine/douche
   dans la modale de modification quand le type de bien n'est pas résidentiel. */
function adapterModFormulaireAuType() {
  const residentiel = TYPES_RESIDENTIELS_ADMIN.includes(document.getElementById('modType').value);
  ['modGroupeChambres', 'modGroupeSalons', 'modGroupeSdb', 'modGroupeCuisine', 'modGroupeDouche'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = residentiel ? '' : 'none';
  });
}
window.adapterModFormulaireAuType = adapterModFormulaireAuType;

function modifierAnnonce(id) {
  const a = annoncesData.find(x => x.id === id);
  if (!a) return;
  annonceEnEdition = id;

  document.getElementById('modTitre').value = texte(a, 'titre', 'title') === '—' ? '' : texte(a, 'titre', 'title');
  document.getElementById('modType').value = champ(a, 'type') || 'Maison';
  adapterModFormulaireAuType();
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
  document.getElementById('modNumeroBien').value = champ(a, 'numeroBien') || '';
  document.getElementById('modEtage').value = champ(a, 'etage') || 'Non précisé';
  document.getElementById('modVue').value = champ(a, 'vue') || 'Non précisé';
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

  modPhotosActuelles = Array.isArray(a.photos) ? [...a.photos] : [];
  renderPhotosModif();

  document.getElementById('modalModifierAnnonce').classList.remove('hidden');
}

function fermerModalModifier() {
  document.getElementById('modalModifierAnnonce').classList.add('hidden');
  annonceEnEdition = null;
  modPhotosActuelles = [];
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
  const photos = modPhotosActuelles.map(u => (u || '').trim()).filter(Boolean);
  const btn = document.getElementById('modBtnEnregistrer');
  btn.textContent = '⏳ Enregistrement...';

  const typeChoisi = document.getElementById('modType').value;
  const residentiel = TYPES_RESIDENTIELS_ADMIN.includes(typeChoisi);

  window.dbAdmin.collection('annonces').doc(annonceEnEdition).update({
    titre,
    type: typeChoisi,
    commune: document.getElementById('modCommune').value,
    arrondissement: document.getElementById('modArrondissement').value.trim(),
    quartier: document.getElementById('modQuartier').value.trim(),
    pointRepere: document.getElementById('modPointRepere').value.trim(),
    zoneCaractere: document.getElementById('modZoneCaractere').value,
    prix: parseInt(prix) || 0,
    surface: parseInt(document.getElementById('modSurface').value) || null,
    chambres: residentiel ? (parseInt(document.getElementById('modChambres').value) || null) : null,
    salons: residentiel ? (parseInt(document.getElementById('modSalons').value) || null) : null,
    sdb: residentiel ? (parseInt(document.getElementById('modSdb').value) || null) : null,
    douches: residentiel ? (parseInt(document.getElementById('modSdb').value) || null) : null,
    numeroBien: document.getElementById('modNumeroBien').value.trim(),
    etage: document.getElementById('modEtage').value,
    vue: document.getElementById('modVue').value,
    cuisineType: residentiel ? document.getElementById('modCuisineType').value : '',
    doucheType: residentiel ? document.getElementById('modDoucheType').value : '',
    materiau: document.getElementById('modMateriau').value,
    couleurMurale: document.getElementById('modCouleurMurale').value,
    terrasse: document.getElementById('modTerrasse').value === 'oui',
    carreaux: document.getElementById('modCarreaux').value === 'oui',
    statut: document.getElementById('modStatut').value,
    description: document.getElementById('modDescription').value.trim(),
    equipements,
    photos,
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
  // Images thématiques (habitat/architecture) via LoremFlickr — plus adaptées
  // au contexte "logement" que des photos aléatoires de nature.
  // `lock` fige la même image à chaque rechargement pour une annonce donnée.
  const photo = (mots, lock) => [0, 1, 2].map(n =>
    `https://loremflickr.com/800/600/${encodeURIComponent(mots)}?lock=${lock + n}`
  );

  // Vendeurs fictifs réutilisés sur plusieurs annonces (comme dans la réalité,
  // une agence ou une société publie plusieurs biens sous le même compte).
  const VENDEUR_AGENCE = {
    proprietaireCompteType: "entreprise", proprietaireTypeEntreprise: "Agence immobilière",
    proprietaireStatutEntreprise: "verifie", proprietaireRaisonSociale: "Gabon Immo Services",
    proprietaireNom: "Sylvie Ondo", proprietaireTel: "+241 74 12 34 56", whatsapp: "+241 74 12 34 56"
  };
  const VENDEUR_SOCIETE_1 = {
    proprietaireCompteType: "entreprise", proprietaireTypeEntreprise: "Société privée",
    proprietaireStatutEntreprise: "attente", proprietaireRaisonSociale: "SOGACI Patrimoine",
    proprietaireNom: "Jean-Marc Nzue", proprietaireTel: "+241 66 98 12 45", whatsapp: "+241 66 98 12 45"
  };
  const VENDEUR_SOCIETE_2 = {
    proprietaireCompteType: "entreprise", proprietaireTypeEntreprise: "Société privée",
    proprietaireStatutEntreprise: "verifie", proprietaireRaisonSociale: "AtlanticBiz Gabon",
    proprietaireNom: "Carine Mba", proprietaireTel: "+241 62 45 67 89", whatsapp: "+241 62 45 67 89"
  };
  const VENDEUR_PARTICULIER_1 = {
    proprietaireCompteType: "particulier",
    proprietaireNom: "Pauline Ntoutoume", proprietaireTel: "+241 65 11 22 33", whatsapp: "+241 65 11 22 33"
  };
  const VENDEUR_PARTICULIER_2 = {
    proprietaireCompteType: "particulier",
    proprietaireNom: "Rodrigue Ekomy", proprietaireTel: "+241 77 88 99 00", whatsapp: "+241 77 88 99 00"
  };

  return [
    // ── VILLA — Agence immobilière (vérifiée) ──────────────
    {
      ...VENDEUR_AGENCE,
      titre: "Villa de standing avec piscine à Cap Estérias",
      type: "Villa", commune: "Akanda", arrondissement: "1er arrondissement", quartier: "Cap Estérias",
      pointRepere: "À 200 m de la plage, après le carrefour Cap Estérias",
      zoneCaractere: "Bord de mer / lagune",
      prix: 550000, surface: 220, chambres: 4, salons: 2, sdb: 3, douches: 3,
      cloture: true, materiau: "Dur (parpaing / béton)", couleurMurale: "Bleu ciel",
      cuisineType: "Interne", doucheType: "Interne", terrasse: true, carreaux: true,
      eau: "Forage", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Villa de standing en bord de mer avec piscine privée, grand jardin arboré, terrasse donnant sur la lagune, parking pour 2 véhicules et groupe électrogène de secours. Cadre exceptionnel, idéale pour une résidence de fonction.",
      equipements: ["Meublé", "Climatisé", "Piscine", "Jardin", "Parking", "Groupe électrogène", "Gardiennage"],
      statut: "disponible", lat: 0.5320, lng: 9.3650, photos: photo("villa,house,exterior", 101)
    },
    // ── APPARTEMENT — Société privée (en attente de vérification) ──
    {
      ...VENDEUR_SOCIETE_1,
      titre: "Appartement moderne 2 chambres aux Cocotiers",
      type: "Appartement", commune: "Libreville", arrondissement: "2e arrondissement", quartier: "Cocotiers",
      pointRepere: "Immeuble Le Baobab, près de la pharmacie des Cocotiers",
      zoneCaractere: "Centre-ville",
      prix: 220000, surface: 85, chambres: 2, salons: 1, sdb: 1, douches: 1,
      cloture: false, materiau: "Dur (parpaing / béton)", couleurMurale: "Crème / Ivoire",
      cuisineType: "Interne", doucheType: "Interne", terrasse: true, carreaux: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Bel appartement lumineux au 2e étage, proche des commerces et des transports. Cuisine équipée, carrelage au sol dans toutes les pièces et balcon avec vue dégagée sur le quartier.",
      equipements: ["Climatisé", "Fibre optique", "Interphone"],
      statut: "disponible", lat: 0.3912, lng: 9.4580, photos: photo("apartment,livingroom", 201)
    },
    // ── STUDIO — Particulier ────────────────────────────────
    {
      ...VENDEUR_PARTICULIER_1,
      titre: "Studio meublé et climatisé à Akébé-Ville",
      type: "Studio", commune: "Libreville", arrondissement: "3e arrondissement", quartier: "Akébé-Ville",
      pointRepere: "Près du carrefour Akébé-Ville, à côté de l'école primaire",
      zoneCaractere: "Résidentiel calme",
      prix: 95000, surface: 28, chambres: 1, salons: 0, sdb: 1, douches: 1,
      cloture: false, materiau: "Semi-dur", couleurMurale: "Beige",
      cuisineType: "Interne", doucheType: "Interne", terrasse: false, carreaux: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Commun",
      description: "Studio compact et fonctionnel, parfait pour un étudiant ou une personne seule. Coin cuisine intégré, sol carrelé, quartier calme et bien desservi par les taxis.",
      equipements: ["Meublé", "Climatisé", "Interphone"],
      statut: "disponible", lat: 0.3830, lng: 9.4650, photos: photo("studio,apartment,interior", 301)
    },
    // ── CHAMBRE — Particulier ───────────────────────────────
    {
      ...VENDEUR_PARTICULIER_2,
      titre: "Chambre meublée à Glass, salle d'eau partagée",
      type: "Chambre", commune: "Libreville", arrondissement: "4e arrondissement", quartier: "Glass",
      pointRepere: "Résidence Bord-Mer, en face de l'ancien cinéma de Glass",
      zoneCaractere: "Bord de mer / lagune",
      prix: 60000, surface: 18, chambres: 1, salons: 0, sdb: 1, douches: 1,
      cloture: false, materiau: "Semi-dur", couleurMurale: "Jaune",
      cuisineType: "Externe", doucheType: "Externe", terrasse: false, carreaux: false,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Commun",
      description: "Chambre meublée avec cuisine et douche communes, dans une résidence sécurisée en bord de mer. Idéal petit budget, à deux pas du marché de Glass.",
      equipements: ["Meublé", "Gardiennage"],
      statut: "disponible", lat: 0.3980, lng: 9.4470, photos: photo("bedroom,interior", 401)
    },
    // ── MAISON — Agence immobilière (même agence que la villa) ─────
    {
      ...VENDEUR_AGENCE,
      titre: "Maison familiale clôturée à Angondjé",
      type: "Maison", commune: "Akanda", arrondissement: "2e arrondissement", quartier: "Angondjé",
      pointRepere: "Lot 34, non loin du temple d'Angondjé",
      zoneCaractere: "Périphérie / semi-rural",
      prix: 300000, surface: 140, chambres: 3, salons: 1, sdb: 2, douches: 2,
      cloture: true, materiau: "Dur (parpaing / béton)", couleurMurale: "Vert",
      cuisineType: "Interne", doucheType: "Interne", terrasse: true, carreaux: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Maison spacieuse dans un quartier résidentiel calme, cour clôturée avec espace pour jardin potager et terrasse couverte. Proche des écoles et d'un forage de secours.",
      equipements: ["Clôturé", "Parking", "Forage", "Gardiennage"],
      statut: "disponible", lat: 0.4790, lng: 9.4240, photos: photo("house,home,exterior", 501)
    },
    // ── BUREAU — Société privée (même société que l'appartement) ───
    {
      ...VENDEUR_SOCIETE_1,
      titre: "Bureau climatisé open-space à Charbonnages",
      type: "Bureau", commune: "Libreville", arrondissement: "1er arrondissement", quartier: "Charbonnages",
      pointRepere: "Immeuble Étoile, 1er étage, face à l'agence BICIG Charbonnages",
      zoneCaractere: "Zone commerciale",
      prix: 350000, surface: 100, chambres: 0, salons: 1, sdb: 1, douches: 1,
      cloture: false, materiau: "Dur (parpaing / béton)", couleurMurale: "Gris",
      cuisineType: "Externe", doucheType: "Interne", terrasse: false, carreaux: true,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Espace de bureau climatisé, open-space modulable avec salle de réunion, idéal pour une PME. Parking visiteurs et connexion fibre optique disponibles.",
      equipements: ["Climatisé", "Parking", "Fibre optique"],
      statut: "disponible", lat: 0.4210, lng: 9.4390, photos: photo("office,workspace,interior", 601)
    },
    // ── LOCAL COMMERCIAL — Société privée (différente, vérifiée) ───
    {
      ...VENDEUR_SOCIETE_2,
      titre: "Local commercial clôturé au port d'Owendo",
      type: "Local commercial", commune: "Owendo", arrondissement: "1er arrondissement", quartier: "Owendo Port",
      pointRepere: "Le long de la route du port, entrepôt B12",
      zoneCaractere: "Zone industrielle",
      prix: 400000, surface: 120, chambres: 0, salons: 0, sdb: 1, douches: 1,
      cloture: true, materiau: "Dur (parpaing / béton)", couleurMurale: "Autre",
      cuisineType: "Externe", doucheType: "Externe", terrasse: false, carreaux: false,
      eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel",
      description: "Local commercial bien situé à proximité immédiate du port, forte visibilité et passage. Grand espace de stockage, cour clôturée et gardiennée. Idéal commerce ou entrepôt.",
      equipements: ["Clôturé", "Parking", "Gardiennage"],
      statut: "disponible", lat: 0.2940, lng: 9.5050, photos: photo("shop,storefront,warehouse", 701)
    }
  ];
}

function semerAnnoncesDemo() {
  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }
  const lot = annoncesDemoData();
  if (!confirm(`Ajouter ${lot.length} annonces de démonstration (agences, sociétés privées et particuliers mélangés) dans Firestore ? Elles seront visibles sur le site public et modifiables/supprimables ici.`)) return;

  const batch = window.dbAdmin.batch();
  const maintenant = firebase.firestore.FieldValue.serverTimestamp();

  lot.forEach((item) => {
    const ref = window.dbAdmin.collection('annonces').doc();
    batch.set(ref, {
      ...item,
      video: null,
      proprietaireNom: item.proprietaireNom || "MALAGA Démo",
      proprietaireTel: item.proprietaireTel || "+241 60 14 19 24",
      whatsapp: item.whatsapp || item.proprietaireTel || "+241 60 14 19 24",
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
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Aucun utilisateur ne correspond</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    const role = u.email === ADMIN_EMAIL ? 'admin' : texte(u, 'role');
    const date = formaterDate(champ(u, 'dateCreation', 'date'));
    return `
      <tr>
        <td style="font-size:11px;color:#0A7A45;font-family:'Courier New',monospace;font-weight:700;" title="${u.id}">${(window.MALAGA_ID?.numeroMembre(u.id, u)) || u.id}</td>
        <td style="font-weight:600;">${escapeHTML(texte(u, 'nom'))}</td>
        <td>${escapeHTML(texte(u, 'email'))}</td>
        <td>${escapeHTML(texte(u, 'tel'))}</td>
        <td><span style="background:#DBEAFE;padding:2px 8px;border-radius:6px;font-size:11px;color:#1E40AF;">${escapeHTML(role)}</span></td>
        <td>${escapeHTML(date)}</td>
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

/* ══════════════════════════════════════════════════════════
   ENTREPRISES (comptes professionnels)
   Dérivé de usersData (pas de nouvelle écoute Firestore requise) :
   un compte professionnel est un document "users" avec compteType
   === 'entreprise'. Le nombre de biens publiés est calculé depuis
   annoncesData (proprietaireId === uid du compte entreprise).
══════════════════════════════════════════════════════════ */
const LABEL_STATUT_ENTREPRISE = {
  attente: { texte: '⏳ En attente', classe: 'badge-yellow' },
  verifie: { texte: '✅ Vérifié', classe: 'badge-green' },
  suspendu: { texte: '⛔ Suspendu', classe: 'badge-red' }
};

function entreprisesData() {
  return usersData.filter(u => u.compteType === 'entreprise');
}

function nbBiensEntreprise(uid) {
  return annoncesData.filter(a => champ(a, 'proprietaireId') === uid).length;
}

function loadEntreprises(liste) {
  injecterToolbarEntreprisesDemo();
  const tbody = document.getElementById('entreprisesTableBody');
  const data = liste || entreprisesData();

  const tous = entreprisesData();
  document.getElementById('kpiEntreprisesTotal').textContent = tous.length;
  document.getElementById('kpiEntreprisesAttente').textContent = tous.filter(u => u.statutEntreprise === 'attente').length;
  document.getElementById('kpiEntreprisesVerifiees').textContent = tous.filter(u => u.statutEntreprise === 'verifie').length;
  document.getElementById('kpiEntreprisesSuspendues').textContent = tous.filter(u => u.statutEntreprise === 'suspendu').length;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Aucun compte professionnel ne correspond</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    const statut = LABEL_STATUT_ENTREPRISE[u.statutEntreprise] || LABEL_STATUT_ENTREPRISE.attente;
    const date = formaterDate(champ(u, 'dateCreation'));
    const nbBiens = nbBiensEntreprise(u.id);

    let actions = '';
    actions += `<a href="entreprise.html?id=${u.id}" target="_blank" rel="noopener" style="padding:4px 8px;background:#009E60;color:#fff;border-radius:5px;font-size:11px;margin-right:4px;text-decoration:none;display:inline-block;">📋 Catalogue</a>`;
    if (typeof u.entrepriseLat === 'number' && typeof u.entrepriseLng === 'number') {
      actions += `<a href="https://www.google.com/maps?q=${u.entrepriseLat},${u.entrepriseLng}" target="_blank" rel="noopener" style="padding:4px 8px;background:#3B82F6;color:#fff;border-radius:5px;font-size:11px;margin-right:4px;text-decoration:none;display:inline-block;">📍 Carte</a>`;
    }
    if (u.statutEntreprise !== 'verifie') {
      actions += `<button onclick="verifierEntreprise('${u.id}')" style="padding:4px 8px;background:#009E60;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">✅ Vérifier</button>`;
    }
    if (u.statutEntreprise !== 'suspendu') {
      actions += `<button onclick="suspendreEntreprise('${u.id}')" style="padding:4px 8px;background:#EF4444;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">⛔ Suspendre</button>`;
    } else {
      actions += `<button onclick="reactiverEntreprise('${u.id}')" style="padding:4px 8px;background:#3B82F6;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">↩️ Réactiver</button>`;
    }

    return `
      <tr>
        <td style="font-weight:700;display:flex;align-items:center;gap:8px;">
          ${u.logoUrl ? `<img src="${escapeHTML(u.logoUrl)}" alt="" style="width:26px;height:26px;border-radius:6px;object-fit:cover;">` : '🏢'}
          ${escapeHTML(texte(u, 'raisonSociale', 'nom'))}
        </td>
        <td>${escapeHTML(texte(u, 'typeEntreprise'))}</td>
        <td>${escapeHTML(texte(u, 'entrepriseTel', 'tel'))}${u.entrepriseEmail ? '<br><span style="color:#888;font-size:11px;">' + escapeHTML(u.entrepriseEmail) + '</span>' : ''}</td>
        <td style="text-align:center;font-weight:700;">${nbBiens}</td>
        <td><span class="badge ${statut.classe}">${statut.texte}</span></td>
        <td>${escapeHTML(date)}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

function filtrerEntreprises() {
  const texteRecherche = (document.getElementById('filterEntreprise')?.value || '').toLowerCase().trim();
  const statut = document.getElementById('filterStatutEntreprise')?.value || '';

  const filtres = entreprisesData().filter(u => {
    const raison = String(texte(u, 'raisonSociale', 'nom')).toLowerCase();
    const correspondTexte = !texteRecherche || raison.includes(texteRecherche);
    const correspondStatut = !statut || u.statutEntreprise === statut;
    return correspondTexte && correspondStatut;
  });

  loadEntreprises(filtres);
}

/* Les annonces stockent une copie (dénormalisée) du statut de vérification de
   l'entreprise (proprietaireStatutEntreprise) pour afficher le badge "Agence
   vérifiée" sans lecture supplémentaire côté public. Il faut donc la resynchroniser
   sur toutes les annonces de ce compte à chaque changement de statut admin —
   sinon le badge public ne bouge jamais après une vérification/suspension. */
function synchroniserStatutAnnoncesEntreprise(uid, nouveauStatut) {
  const biens = annoncesData.filter(a => champ(a, 'proprietaireId') === uid);
  if (biens.length === 0) return Promise.resolve();
  const lot = window.dbAdmin.batch();
  biens.forEach(a => lot.update(window.dbAdmin.collection('annonces').doc(a.id), { proprietaireStatutEntreprise: nouveauStatut }));
  return lot.commit();
}

function verifierEntreprise(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  document.getElementById('modalTitle').textContent = 'Vérifier ce compte professionnel ?';
  document.getElementById('modalMsg').textContent = `« ${texte(u, 'raisonSociale', 'nom')} » obtiendra le badge « 🏢 Professionnel vérifié » et son logo s'affichera sur ses annonces.`;
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = 'Vérifier';
  btn.onclick = () => {
    window.dbAdmin.collection('users').doc(id).update({ statutEntreprise: 'verifie' })
      .then(() => synchroniserStatutAnnoncesEntreprise(id, 'verifie'))
      .then(() => toast('✅ Compte professionnel vérifié'))
      .catch((err) => { console.error(err); toast('❌ Erreur lors de la vérification'); });
    fermerModal();
  };
  document.getElementById('modalConfirm').classList.remove('hidden');
}

function suspendreEntreprise(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  document.getElementById('modalTitle').textContent = 'Suspendre ce compte professionnel ?';
  document.getElementById('modalMsg').textContent = `« ${texte(u, 'raisonSociale', 'nom')} » perdra son badge professionnel. Ses annonces restent visibles mais sans mise en avant.`;
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = 'Suspendre';
  btn.onclick = () => {
    const motif = window.prompt('Motif de la suspension (optionnel, visible en interne uniquement) :', '') || '';
    window.dbAdmin.collection('users').doc(id).update({ statutEntreprise: 'suspendu', motifSuspension: motif })
      .then(() => synchroniserStatutAnnoncesEntreprise(id, 'suspendu'))
      .then(() => toast('⛔ Compte professionnel suspendu'))
      .catch((err) => { console.error(err); toast('❌ Erreur lors de la suspension'); });
    fermerModal();
  };
  document.getElementById('modalConfirm').classList.remove('hidden');
}

function reactiverEntreprise(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  window.dbAdmin.collection('users').doc(id).update({ statutEntreprise: 'attente', motifSuspension: '' })
    .then(() => synchroniserStatutAnnoncesEntreprise(id, 'attente'))
    .then(() => toast('↩️ Compte réactivé — en attente de nouvelle vérification'))
    .catch((err) => { console.error(err); toast('❌ Erreur lors de la réactivation'); });
}

/* ══════════════════════════════════════════════════════════
   ENTREPRISES DÉMO — génération et nettoyage en un clic
   Même logique que semerAnnoncesDemo()/supprimerAnnoncesDemo()
   (annonces démo), mais ici on crée de VRAIS comptes "users"
   (compteType: 'entreprise', demo: true) avec leur catalogue de
   biens réellement lié (proprietaireId), pour visualiser en
   conditions réelles la page publique entreprise.html?id=...
   depuis l'admin. Tout porte demo:true → supprimable d'un clic
   sans toucher aux vrais comptes professionnels.
══════════════════════════════════════════════════════════ */
function entreprisesDemoData() {
  const photo = (mots, lock) => [0, 1, 2].map(n =>
    `https://loremflickr.com/800/600/${encodeURIComponent(mots)}?lock=${lock + n}`
  );
  const T = (dateStr) => firebase.firestore.Timestamp.fromDate(new Date(dateStr));
  const recent = (joursAvant) => firebase.firestore.Timestamp.fromDate(new Date(Date.now() - joursAvant * 86400000));

  return [
    // ── Agence immobilière vérifiée, catalogue fourni, tous contacts renseignés ──
    {
      entreprise: {
        raisonSociale: "Gabon Immo Services", typeEntreprise: "Agence immobilière",
        statutEntreprise: "verifie", slogan: "Votre partenaire immobilier de confiance à Libreville",
        entrepriseTel: "+241 74 12 34 56", entrepriseEmail: "contact@gabonimmo.ga",
        entrepriseAdresse: "Immeuble Horizon, Boulevard Triomphal, Libreville",
        entrepriseLat: 0.3924, entrepriseLng: 9.4536, dateCreation: T("2023-03-10")
      },
      biens: [
        { titre: "Villa de standing avec piscine à Cap Estérias", type: "Villa", commune: "Akanda", arrondissement: "1er arrondissement", quartier: "Cap Estérias", pointRepere: "À 200 m de la plage, après le carrefour Cap Estérias", zoneCaractere: "Bord de mer / lagune", prix: 550000, surface: 220, chambres: 4, salons: 2, sdb: 3, douches: 3, cloture: true, materiau: "Dur (parpaing / béton)", couleurMurale: "Bleu ciel", cuisineType: "Interne", doucheType: "Interne", terrasse: true, carreaux: true, eau: "Forage", electricite: "SEEG (réseau)", compteur: "Individuel", vue: "Vue mer", description: "Villa de standing en bord de mer avec piscine privée, grand jardin arboré, terrasse donnant sur la lagune, parking pour 2 véhicules et groupe électrogène de secours.", equipements: ["Meublé", "Climatisé", "Piscine", "Jardin", "Parking", "Groupe électrogène", "Gardiennage"], statut: "disponible", lat: 0.5320, lng: 9.3650, photos: photo("villa,house,exterior", 111), dateCreation: recent(2) },
        { titre: "Maison familiale clôturée à Angondjé", type: "Maison", commune: "Akanda", arrondissement: "2e arrondissement", quartier: "Angondjé", pointRepere: "Lot 34, non loin du temple d'Angondjé", zoneCaractere: "Périphérie / semi-rural", prix: 300000, surface: 140, chambres: 3, salons: 1, sdb: 2, douches: 2, cloture: true, materiau: "Dur (parpaing / béton)", couleurMurale: "Vert", cuisineType: "Interne", doucheType: "Interne", terrasse: true, carreaux: true, eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel", description: "Maison spacieuse dans un quartier résidentiel calme, cour clôturée avec espace pour jardin potager et terrasse couverte.", equipements: ["Clôturé", "Parking", "Forage", "Gardiennage"], statut: "disponible", lat: 0.4790, lng: 9.4240, photos: photo("house,home,exterior", 121), dateCreation: T("2024-06-20") },
        { titre: "Appartement moderne 2 chambres aux Cocotiers", type: "Appartement", commune: "Libreville", arrondissement: "2e arrondissement", quartier: "Cocotiers", pointRepere: "Immeuble Le Baobab, près de la pharmacie des Cocotiers", zoneCaractere: "Centre-ville", prix: 220000, surface: 85, chambres: 2, salons: 1, sdb: 1, douches: 1, cloture: false, materiau: "Dur (parpaing / béton)", couleurMurale: "Crème / Ivoire", cuisineType: "Interne", doucheType: "Interne", terrasse: true, carreaux: true, eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel", etage: "2e étage", description: "Bel appartement lumineux, proche des commerces et des transports. Cuisine équipée, carrelage au sol dans toutes les pièces et balcon avec vue dégagée.", equipements: ["Climatisé", "Fibre optique", "Interphone"], statut: "disponible", lat: 0.3912, lng: 9.4580, photos: photo("apartment,livingroom", 131), dateCreation: recent(5) },
        { titre: "Studio meublé et climatisé à Akébé-Ville", type: "Studio", commune: "Libreville", arrondissement: "3e arrondissement", quartier: "Akébé-Ville", pointRepere: "Près du carrefour Akébé-Ville, à côté de l'école primaire", zoneCaractere: "Résidentiel calme", prix: 95000, surface: 28, chambres: 1, salons: 0, sdb: 1, douches: 1, cloture: false, materiau: "Semi-dur", couleurMurale: "Beige", cuisineType: "Interne", doucheType: "Interne", terrasse: false, carreaux: true, eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Commun", description: "Studio compact et fonctionnel, parfait pour un étudiant ou une personne seule. Coin cuisine intégré, quartier calme et bien desservi.", equipements: ["Meublé", "Climatisé", "Interphone"], statut: "occupé", lat: 0.3830, lng: 9.4650, photos: photo("studio,apartment,interior", 141), dateCreation: T("2024-09-15") }
      ]
    },
    // ── Société privée en attente de vérification, catalogue réduit, pas de téléphone public ──
    {
      entreprise: {
        raisonSociale: "SOGACI Patrimoine", typeEntreprise: "Société privée",
        statutEntreprise: "attente", entrepriseEmail: "info@sogaci.ga"
      },
      biens: [
        { titre: "Bureau climatisé open-space à Charbonnages", type: "Bureau", commune: "Libreville", arrondissement: "1er arrondissement", quartier: "Charbonnages", pointRepere: "Immeuble Étoile, 1er étage, face à l'agence BICIG Charbonnages", zoneCaractere: "Zone commerciale", prix: 350000, surface: 100, chambres: 0, salons: 1, sdb: 1, douches: 1, cloture: false, materiau: "Dur (parpaing / béton)", couleurMurale: "Gris", cuisineType: "Externe", doucheType: "Interne", terrasse: false, carreaux: true, eau: "SEEG (réseau)", electricite: "SEEG (réseau)", compteur: "Individuel", description: "Espace de bureau climatisé, open-space modulable avec salle de réunion, idéal pour une PME. Parking visiteurs et fibre optique disponibles.", equipements: ["Climatisé", "Parking", "Fibre optique"], statut: "disponible", lat: 0.4210, lng: 9.4390, photos: photo("office,workspace,interior", 151), dateCreation: T("2024-04-18") },
        { titre: "Box de stockage sécurisé à Oloumi", type: "Box", commune: "Libreville", arrondissement: "5e arrondissement", quartier: "Zone Industrielle d'Oloumi", zoneCaractere: "Zone industrielle", prix: 90000, surface: 20, cloture: true, materiau: "Dur (parpaing / béton)", description: "Box de stockage sécurisé et gardienné, accès facile pour véhicule utilitaire.", equipements: ["Clôturé", "Gardiennage"], statut: "occupé", lat: 0.3980, lng: 9.4780, photos: [], dateCreation: T("2024-07-11") }
      ]
    },
    // ── Société privée vérifiée, mais catalogue vide (pour tester l'état "aucun bien publié") ──
    {
      entreprise: {
        raisonSociale: "AtlanticBiz Gabon", typeEntreprise: "Société privée",
        statutEntreprise: "verifie", entrepriseTel: "+241 62 45 67 89", dateCreation: T("2025-01-05")
      },
      biens: []
    }
  ];
}

function semerEntreprisesDemo() {
  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }
  const profils = entreprisesDemoData();
  const totalBiens = profils.reduce((n, p) => n + p.biens.length, 0);
  if (!confirm(`Ajouter ${profils.length} entreprises démo (agence + sociétés) et ${totalBiens} biens liés à leur catalogue ? Elles seront visibles sur le site public et gérables ici comme un vrai compte professionnel.`)) return;

  const batch = window.dbAdmin.batch();
  const maintenant = firebase.firestore.FieldValue.serverTimestamp();

  profils.forEach((p) => {
    const refEntreprise = window.dbAdmin.collection('users').doc();
    batch.set(refEntreprise, {
      ...p.entreprise,
      compteType: 'entreprise',
      demo: true,
      dateCreation: p.entreprise.dateCreation || maintenant
    });

    p.biens.forEach((b) => {
      const refAnnonce = window.dbAdmin.collection('annonces').doc();
      batch.set(refAnnonce, {
        ...b,
        video: null,
        proprietaireId: refEntreprise.id,
        proprietaireCompteType: 'entreprise',
        proprietaireTypeEntreprise: p.entreprise.typeEntreprise,
        proprietaireStatutEntreprise: p.entreprise.statutEntreprise,
        proprietaireRaisonSociale: p.entreprise.raisonSociale,
        proprietaireNom: p.entreprise.raisonSociale,
        proprietaireTel: p.entreprise.entrepriseTel || '',
        whatsapp: p.entreprise.entrepriseTel || '',
        vues: Math.floor(Math.random() * 40),
        demo: true,
        dateCreation: b.dateCreation || maintenant,
        dateModification: maintenant
      });
    });
  });

  batch.commit()
    .then(() => toast(`✅ ${profils.length} entreprises démo + ${totalBiens} biens ajoutés`))
    .catch((err) => { console.error(err); toast('❌ Erreur lors de l\'ajout des entreprises démo'); });
}

function supprimerEntreprisesDemo() {
  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }
  const demosEnt = usersData.filter(u => u.demo === true && u.compteType === 'entreprise');
  if (demosEnt.length === 0) { toast('ℹ️ Aucune entreprise démo à supprimer'); return; }

  const idsEnt = demosEnt.map(u => u.id);
  const biensLies = annoncesData.filter(a => idsEnt.includes(champ(a, 'proprietaireId')));
  if (!confirm(`Supprimer définitivement ${demosEnt.length} entreprise(s) démo et les ${biensLies.length} bien(s) de leur catalogue ?`)) return;

  const batch = window.dbAdmin.batch();
  demosEnt.forEach(u => batch.delete(window.dbAdmin.collection('users').doc(u.id)));
  biensLies.forEach(a => batch.delete(window.dbAdmin.collection('annonces').doc(a.id)));

  batch.commit()
    .then(() => toast(`✅ ${demosEnt.length} entreprise(s) et ${biensLies.length} bien(s) supprimés`))
    .catch((err) => { console.error(err); toast('❌ Erreur lors de la suppression'); });
}

// Injecte la barre "Générer / Supprimer entreprises démo" au-dessus du tableau,
// sans dépendre de admin.html (fonctionne même si le bouton n'y a pas été ajouté à la main).
function injecterToolbarEntreprisesDemo() {
  if (document.getElementById('entreprisesDemoToolbar')) return;
  const tbody = document.getElementById('entreprisesTableBody');
  if (!tbody) return;
  const cible = tbody.closest('table') || tbody;

  cible.insertAdjacentHTML('beforebegin', `
    <div id="entreprisesDemoToolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <button id="btnSemerEntreprisesDemo" style="padding:8px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700;">🧪 Générer 3 entreprises démo (avec catalogue)</button>
      <button id="btnSupprimerEntreprisesDemo" style="padding:8px 14px;background:#fff;color:#EF4444;border:1.5px solid #EF4444;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700;">🗑️ Supprimer les entreprises démo</button>
    </div>
  `);
  document.getElementById('btnSemerEntreprisesDemo').addEventListener('click', semerEntreprisesDemo);
  document.getElementById('btnSupprimerEntreprisesDemo').addEventListener('click', supprimerEntreprisesDemo);
}

window.filtrerEntreprises = filtrerEntreprises;
window.verifierEntreprise = verifierEntreprise;
window.suspendreEntreprise = suspendreEntreprise;
window.reactiverEntreprise = reactiverEntreprise;
window.semerEntreprisesDemo = semerEntreprisesDemo;
window.supprimerEntreprisesDemo = supprimerEntreprisesDemo;

function formaterDate(valeur) {
  if (!valeur) return '—';
  if (valeur.toDate) return valeur.toDate().toLocaleDateString('fr-FR');
  if (typeof valeur === 'string') return valeur;
  return '—';
}

/* ══════════════════════════════════════════════════════════
   VÉRIFICATION & ARCHIVES (dossiers d'identité + anti-fraude)
   Chaque dossier (collection "verificationsIdentite", doc id = uid) est
   joint au profil correspondant dans usersData (même id) pour afficher
   nom/email/tel — ces derniers restent dans "users" (déjà en place),
   seules les données sensibles (pièce, photos, adresse) vivent ici.
══════════════════════════════════════════════════════════ */
const LABEL_STATUT_VERIF = {
  attente:  { texte: '⏳ En attente', classe: 'badge-yellow' },
  verifie:  { texte: '✅ Vérifié',    classe: 'badge-green' },
  signale:  { texte: '🚩 Signalé',    classe: 'badge-red' },
  suspendu: { texte: '⛔ Suspendu',   classe: 'badge-red' }
};
const LABEL_TYPE_ALERTE = {
  doublon_piece:  'Pièce déjà utilisée',
  doublon_tel:    'Téléphone partagé, nom différent',
  age_incoherent: 'Âge incohérent (< 18 ans)',
  nom_suspect:    'Nom déjà signalé'
};

function normaliserNomAdmin(nom) {
  return String(nom || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function verifJointeAUser(v) {
  const u = usersData.find(x => x.id === v.id) || {};
  return { ...v, _nom: texte(u, 'nom'), _email: texte(u, 'email'), _tel: texte(u, 'tel'), _role: texte(u, 'role'), _user: u };
}

function calculerKpiVerif() {
  const total = verificationsData.length;
  const attente = verificationsData.filter(v => v.statut === 'attente').length;
  const verifie = verificationsData.filter(v => v.statut === 'verifie').length;
  const signale = verificationsData.filter(v => v.statut === 'signale' || v.statut === 'suspendu').length;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('kpiVerifTotal', total);
  set('kpiVerifAttente', attente);
  set('kpiVerifOk', verifie);
  set('kpiVerifSignal', signale);
}

function filtrerVerif() {
  const texteRecherche = (document.getElementById('filterVerif')?.value || '').toLowerCase().trim();
  const statut = document.getElementById('filterStatutVerif')?.value || '';
  const jointes = verificationsData.map(verifJointeAUser);
  const filtres = jointes.filter(v => {
    const correspondTexte = !texteRecherche ||
      v._nom.toLowerCase().includes(texteRecherche) ||
      v._email.toLowerCase().includes(texteRecherche) ||
      String(v.nomLegal || '').toLowerCase().includes(texteRecherche);
    const correspondStatut = !statut || v.statut === statut;
    return correspondTexte && correspondStatut;
  });
  loadVerif(filtres);
}

function filtrerVerifParStatut(statut) {
  showPage('verification');
  const sel = document.getElementById('filterStatutVerif');
  if (sel) sel.value = statut;
  filtrerVerif();
}

function masquerNumeroPiece(numero) {
  const n = String(numero || '');
  if (n.length <= 4) return n;
  return '•••• ' + n.slice(-4);
}

function loadVerif(liste) {
  const tbody = document.getElementById('verifTableBody');
  if (!liste || liste.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Aucun dossier ne correspond</td></tr>';
    return;
  }
  tbody.innerHTML = liste.map(v => {
    const label = LABEL_STATUT_VERIF[v.statut] || LABEL_STATUT_VERIF.attente;
    const nbAlertes = alertesFraudeData.filter(a => a.uid === v.id).length;
    const coche = selectionVerif.has(v.id) ? 'checked' : '';
    return `
      <tr>
        <td><input type="checkbox" data-uid="${v.id}" ${coche} onchange="toggleSelectionVerif('${v.id}', this.checked)"></td>
        <td>
          <div style="font-weight:600;">${escapeHTML(v._nom)}</div>
          <div style="font-size:11px;color:#888;">${escapeHTML(v._email)}</div>
        </td>
        <td>${escapeHTML(v.typePiece || '—')}<br><span style="font-size:11px;color:#888;">${escapeHTML(masquerNumeroPiece(v.numeroPiece))}</span></td>
        <td><span class="${label.classe}" style="padding:2px 8px;border-radius:6px;font-size:11px;">${label.texte}</span></td>
        <td>${nbAlertes ? `<span class="badge-red" style="padding:2px 8px;border-radius:6px;font-size:11px;">🚩 ${nbAlertes}</span>` : '—'}</td>
        <td>${escapeHTML(formaterDate(v.dateCreation))}</td>
        <td style="white-space:nowrap;">
          <button onclick="ouvrirFicheVerif('${v.id}')" style="padding:4px 8px;background:#3B82F6;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">👁️ Fiche</button>
          ${v.statut !== 'verifie' ? `<button onclick="marquerStatutVerif('${v.id}','verifie')" style="padding:4px 8px;background:#22C55E;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">✅</button>` : ''}
          ${v.statut !== 'suspendu' ? `<button onclick="marquerStatutVerif('${v.id}','suspendu')" style="padding:4px 8px;background:#EF4444;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">⛔</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

/* Marque le dossier avec un nouveau statut. Si "signale"/"suspendu", alimente
   aussi identiteNomSuspect pour que les futures inscriptions au même nom
   soient automatiquement signalées (voir enregistrerVerificationIdentite
   dans auth.js). */
function marquerStatutVerif(uid, nouveauStatut) {
  const v = verificationsData.find(x => x.id === uid);
  if (!v) return;
  window.dbAdmin.collection('verificationsIdentite').doc(uid).update({ statut: nouveauStatut })
    .then(() => {
      if (nouveauStatut === 'suspendu' || nouveauStatut === 'signale') {
        const nomNormalise = normaliserNomAdmin(v.nomLegal);
        if (nomNormalise) {
          window.dbAdmin.collection('identiteNomSuspect').doc(nomNormalise).set({
            motif: nouveauStatut === 'suspendu' ? 'Compte suspendu par l\'admin' : 'Compte signalé par l\'admin',
            uid, dateCreation: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      toast('✅ Statut mis à jour');
    })
    .catch((err) => { console.error(err); toast('❌ Erreur lors de la mise à jour du statut'); });
}

function toggleSelectionVerif(uid, coche) {
  if (coche) selectionVerif.add(uid); else selectionVerif.delete(uid);
}

function toggleToutSelectionVerif(checkbox) {
  document.querySelectorAll('#verifTableBody input[type="checkbox"]').forEach(c => {
    c.checked = checkbox.checked;
    if (checkbox.checked) selectionVerif.add(c.dataset.uid); else selectionVerif.delete(c.dataset.uid);
  });
}

/* Construit le HTML d'une fiche imprimable pour un dossier donné. */
function ficheVerifHTML(uid) {
  const v = verifJointeAUser(verificationsData.find(x => x.id === uid) || {});
  const label = LABEL_STATUT_VERIF[v.statut] || LABEL_STATUT_VERIF.attente;
  const alertes = alertesFraudeData.filter(a => a.uid === uid);
  const numMembre = window.MALAGA_ID?.numeroMembre(uid, v._user) || '';
  const biens = annoncesData.filter(a => a.proprietaireId === uid);
  return `
    <div class="fiche-print">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h2 style="margin:0 0 4px;">${escapeHTML(v._nom)}</h2>
          <p style="margin:0 0 2px;font-family:'Courier New',monospace;font-weight:700;color:#0A7A45;font-size:13px;">${numMembre}</p>
          <p style="margin:0 0 14px;color:#666;">Statut : ${label.texte}</p>
        </div>
        <canvas class="fiche-qr-canvas" data-fiche-qr="${escapeHTML(numMembre)}" width="90" height="90" style="flex-shrink:0;"></canvas>
      </div>
      <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
        ${v.selfieUrl ? `<div><div style="font-size:11px;color:#888;margin-bottom:4px;">Selfie</div><img src="${v.selfieUrl}"></div>` : ''}
        ${v.pieceRectoUrl ? `<div><div style="font-size:11px;color:#888;margin-bottom:4px;">Pièce (recto)</div><img src="${v.pieceRectoUrl}"></div>` : ''}
        ${v.pieceVersoUrl ? `<div><div style="font-size:11px;color:#888;margin-bottom:4px;">Pièce (verso)</div><img src="${v.pieceVersoUrl}"></div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Nom légal</td><td style="padding:4px 0;font-weight:600;">${escapeHTML(v.nomLegal)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Date de naissance</td><td style="padding:4px 0;">${escapeHTML(v.dateNaissance)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Type de pièce</td><td style="padding:4px 0;">${escapeHTML(v.typePiece)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Numéro de pièce</td><td style="padding:4px 0;">${escapeHTML(v.numeroPiece)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Adresse</td><td style="padding:4px 0;">${escapeHTML(v.adresseResidence)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Téléphone</td><td style="padding:4px 0;">${escapeHTML(v._tel)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Email</td><td style="padding:4px 0;">${escapeHTML(v._email)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Soumis le</td><td style="padding:4px 0;">${escapeHTML(formaterDate(v.dateCreation))}</td></tr>
      </table>
      ${biens.length ? `
        <h3 style="font-size:13px;margin:14px 0 6px;">🏠 Biens publiés sur MALAGA (${biens.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          ${biens.map(b => `
            <tr>
              <td style="padding:3px 8px 3px 0;font-family:'Courier New',monospace;color:#0A7A45;font-weight:700;">${window.MALAGA_ID?.numeroAnnonce(b.id) || ''}</td>
              <td style="padding:3px 0;">${escapeHTML(String(texte(b, 'titre', 'title')).substring(0, 40))}</td>
            </tr>
          `).join('')}
        </table>
      ` : ''}
      ${alertes.length ? `
        <h3 style="font-size:13px;margin:14px 0 6px;color:#EF4444;">🚩 Alertes (${alertes.length})</h3>
        <ul style="font-size:12.5px;padding-left:18px;margin:0;">
          ${alertes.map(a => `<li>${escapeHTML(LABEL_TYPE_ALERTE[a.type] || a.type)} — ${escapeHTML(a.details)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  `;
}

/* Dessine les QR codes des fiches actuellement affichées (fiche unique ou
   impression groupée), et ATTEND que ce soit fait (retourne une Promise) —
   important pour l'impression groupée : sans ce await, le tout premier clic
   déclencherait window.print() avant que la librairie QR (chargée à la
   demande) ait eu le temps de dessiner quoi que ce soit, laissant les QR
   vides sur cette première impression. Best-effort malgré tout : si la lib
   échoue, la fiche reste simplement sans QR plutôt que de bloquer l'impression. */
async function dessinerQRCodesFiches(conteneur) {
  const canvases = [...conteneur.querySelectorAll('[data-fiche-qr]')];
  await Promise.all(canvases.map((canvas) => {
    const texte = canvas.dataset.ficheQr;
    if (!texte || !window.MALAGA_ID?.dessinerQRCode) return Promise.resolve();
    return window.MALAGA_ID.dessinerQRCode(canvas, texte, 90)
      .catch((err) => console.error("Dessin du QR (fiche admin) impossible :", err));
  }));
}

function ouvrirFicheVerif(uid) {
  const contenu = document.getElementById('ficheVerifContenu');
  contenu.innerHTML = ficheVerifHTML(uid);
  dessinerQRCodesFiches(contenu);
  const modal = document.getElementById('modalFicheVerif');
  modal.classList.remove('hidden');
  modal.classList.add('impression-active');
}
function fermerFicheVerif() {
  const modal = document.getElementById('modalFicheVerif');
  modal.classList.add('hidden');
  modal.classList.remove('impression-active');
}

async function imprimerSelectionVerif() {
  if (selectionVerif.size === 0) { toast('⚠️ Sélectionnez au moins un membre'); return; }
  const zone = document.getElementById('zoneImpressionGroupee');
  zone.innerHTML = Array.from(selectionVerif).map(uid => ficheVerifHTML(uid)).join('');
  await dessinerQRCodesFiches(zone);
  zone.classList.add('impression-active');
  window.print();
  setTimeout(() => zone.classList.remove('impression-active'), 500);
}

/* ══════════════════════════════════════════════════════════
   ALERTES ANTI-FRAUDE (brutes, avant tri par dossier)
══════════════════════════════════════════════════════════ */
function loadAlertesFraude() {
  const tbody = document.getElementById('alertesFraudeBody');
  if (!tbody) return;
  if (alertesFraudeData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Aucune alerte</td></tr>';
    return;
  }
  tbody.innerHTML = alertesFraudeData.map(a => `
    <tr>
      <td>${escapeHTML(formaterDate(a.dateCreation))}</td>
      <td>${escapeHTML(LABEL_TYPE_ALERTE[a.type] || a.type)}</td>
      <td>${escapeHTML(a.nom)}</td>
      <td>${escapeHTML(a.details)}</td>
      <td>${a.traite ? '✅' : '⏳'}</td>
      <td>
        <button onclick="ouvrirFicheVerif('${a.uid}')" style="padding:4px 8px;background:#3B82F6;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-right:4px;">👁️ Fiche</button>
        ${!a.traite ? `<button onclick="marquerAlerteTraitee('${a.id}')" style="padding:4px 8px;background:#22C55E;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">✅ Traiter</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function marquerAlerteTraitee(id) {
  window.dbAdmin.collection('alertesFraude').doc(id).update({ traite: true })
    .then(() => toast('✅ Alerte marquée comme traitée'))
    .catch((err) => { console.error(err); toast('❌ Erreur'); });
}

window.filtrerVerif = filtrerVerif;
window.filtrerVerifParStatut = filtrerVerifParStatut;
window.marquerStatutVerif = marquerStatutVerif;
window.toggleSelectionVerif = toggleSelectionVerif;
window.toggleToutSelectionVerif = toggleToutSelectionVerif;
window.ouvrirFicheVerif = ouvrirFicheVerif;
window.fermerFicheVerif = fermerFicheVerif;
window.imprimerSelectionVerif = imprimerSelectionVerif;
window.marquerAlerteTraitee = marquerAlerteTraitee;

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
      <td style="font-size:12px;">${escapeHTML(formaterDate(champ(s, 'dateCreation', 'date')))}</td>
      <td style="font-weight:600;">${escapeHTML(texte(s, 'type'))}</td>
      <td>${escapeHTML(texte(s, 'annonceTitre', 'annonce'))}</td>
      <td>${escapeHTML(texte(s, 'signalePar'))}</td>
      <td style="font-size:12px;">${escapeHTML(texte(s, 'desc', 'description'))}</td>
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
        <td style="font-size:12px;">${escapeHTML(formaterDate(champ(m, 'dateCreation', 'date')))}</td>
        <td>${escapeHTML(texte(m, 'nom'))}</td>
        <td>${escapeHTML(texte(m, 'tel'))}</td>
        <td>${escapeHTML(texte(m, 'sujet'))}</td>
        <td style="font-size:12px;max-width:200px;">${escapeHTML(String(msg).substring(0, 50) + (msg.length > 50 ? '...' : ''))}</td>
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
// Types "à vivre" : seuls ceux-ci ont des chambres / salles de bain à renseigner.
const TYPES_RESIDENTIELS_ADMIN = ['Maison', 'Appartement', 'Studio', 'Villa', 'Chambre'];
function adapterPubFormulaireAuType() {
  const residentiel = TYPES_RESIDENTIELS_ADMIN.includes(document.getElementById('pubType').value);
  const gChambres = document.getElementById('pubGroupeChambres');
  const gSdb = document.getElementById('pubGroupeSdb');
  if (gChambres) gChambres.style.display = residentiel ? '' : 'none';
  if (gSdb) gSdb.style.display = residentiel ? '' : 'none';
  if (!residentiel) {
    if (document.getElementById('pubChambres')) document.getElementById('pubChambres').value = '';
    if (document.getElementById('pubSdb')) document.getElementById('pubSdb').value = '';
  }
}
window.adapterPubFormulaireAuType = adapterPubFormulaireAuType;

function publierAnnonce() {
  const titre = document.getElementById('pubTitre').value.trim();
  const type = document.getElementById('pubType').value;
  const commune = document.getElementById('pubVille').value;
  const quartier = document.getElementById('pubQuartier').value.trim();
  const arrondissement = document.getElementById('pubArrondissement').value.trim();
  const prix = document.getElementById('pubPrix').value;
  const tel = document.getElementById('pubTel').value.trim();
  const lat = parseFloat(document.getElementById('pubLat').value);
  const lng = parseFloat(document.getElementById('pubLng').value);

  if (!titre || !type || !commune || !quartier || !prix || !tel) {
    alert('⚠️ Remplissez tous les champs obligatoires (*)');
    return;
  }
  if (isNaN(lat) || isNaN(lng)) {
    alert('📍 Placez la position exacte du bien sur la carte : chaque annonce doit être géolocalisée.');
    return;
  }

  if (!window.dbAdmin) { toast('❌ Firebase non initialisé'); return; }

  const equipements = Array.from(document.querySelectorAll('#tagsPicker input:checked')).map(el => el.value);
  const btn = document.getElementById('pubBtnText');
  btn.textContent = '⏳ Publication...';

  const residentiel = TYPES_RESIDENTIELS_ADMIN.includes(type);
  const nouvelleAnnonce = {
    titre, type, commune, quartier, arrondissement,
    prix: parseInt(prix) || 0,
    surface: parseInt(document.getElementById('pubSurface').value) || 0,
    chambres: residentiel ? (parseInt(document.getElementById('pubChambres').value) || 0) : 0,
    sdb: residentiel ? (parseInt(document.getElementById('pubSdb').value) || 0) : 0,
    numeroBien: document.getElementById('pubNumeroBien').value.trim(),
    etage: document.getElementById('pubEtage').value,
    vue: document.getElementById('pubVue').value,
    description: document.getElementById('pubDesc').value.trim(),
    equipements,
    statut: document.getElementById('pubStatut').value || 'disponible',
    proprietaireNom: document.getElementById('pubProprioNom').value.trim() || 'Admin',
    proprietaireTel: tel,
    proprietaireEmail: document.getElementById('pubProprioEmail').value.trim() || null,
    whatsapp: tel,
    lat, lng,
    vues: 0,
    dateCreation: firebase.firestore.FieldValue.serverTimestamp()
  };

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
  adapterPubFormulaireAuType();
  document.getElementById('pubProprioNom').value = '';
  document.getElementById('pubProprioEmail').value = '';
  document.getElementById('pubLat').value = '';
  document.getElementById('pubLng').value = '';
  document.getElementById('pubNumeroBien').value = '';
  document.getElementById('pubEtage').value = 'Non précisé';
  document.getElementById('pubVue').value = 'Non précisé';
  if (pubMarqueur && pubMiniMap) { pubMiniMap.removeLayer(pubMarqueur); pubMarqueur = null; }
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


