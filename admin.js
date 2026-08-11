/* ═══════════════════════════════════════════════════════════
   MALAGA – admin.js (SIMPLIFIÉ)
   Panneau d'administration en mode démo (sans Firebase)
═══════════════════════════════════════════════════════════ */

'use strict';

const ADMIN_EMAIL = 'malagagabon@gmail.com';

// Mock data
const MOCK_ANNONCES = [
  { id:'ann001', titre:'Belle villa meublée avec jardin', type:'Villa', ville:'Libreville', quartier:'Akanda', prix:350000, vues:842, statut:'disponible', proprio:'Jean Mbadinga', tel:'+24166580032', surface:180, chambres:4, sdb:2 },
  { id:'ann002', titre:'Appartement 3 pièces climatisé', type:'Appartement', ville:'Libreville', quartier:'Batterie IV', prix:150000, vues:631, statut:'disponible', proprio:'Marie Ondo', tel:'+24177001122', surface:75, chambres:2, sdb:1 },
  { id:'ann003', titre:'Studio moderne avec forage', type:'Studio', ville:'Libreville', quartier:'Owendo', prix:65000, vues:287, statut:'disponible', proprio:'Paul Nze', tel:'+24166123456', surface:28, chambres:1, sdb:1 },
  { id:'ann004', titre:'Maison 5 pièces', type:'Maison', ville:'Port-Gentil', quartier:'Ozouri', prix:200000, vues:445, statut:'réservé', proprio:'Sophie Moukagni', tel:'+24177654321', surface:120, chambres:3, sdb:2 },
  { id:'ann005', titre:'Villa standing avec piscine', type:'Villa', ville:'Libreville', quartier:'Angondjé', prix:600000, vues:1203, statut:'disponible', proprio:'Eric Boulingui', tel:'+24166789012', surface:250, chambres:5, sdb:3 },
];

const MOCK_USERS = [
  { nom:'KOZANGUE Patrick', email:'malagagabon@gmail.com', tel:'+24166580032', role:'admin', date:'12 jan 2026' },
  { nom:'Jean Mbadinga', email:'jean.mbadinga@gmail.com', tel:'+24166111222', role:'proprietaire', date:'15 jan 2026' },
  { nom:'Marie Ondo', email:'marie.ondo@gmail.com', tel:'+24177334455', role:'proprietaire', date:'18 jan 2026' },
  { nom:'Alain Ntoutoume', email:'alain.ntout@gmail.com', tel:'+24166998877', role:'locataire', date:'20 jan 2026' },
  { nom:'Sophie Moukagni', email:'sophie.m@gmail.com', tel:'+24177654321', role:'proprietaire', date:'22 jan 2026' },
];

const MOCK_SIGNALEMENTS = [
  { id:'sig001', date:'12 juin 2026', type:'Fausse annonce', annonce:'ann003', signalePar:'Alain Ntoutoume', desc:'Le bien ne correspond pas aux photos.', traite:false },
  { id:'sig002', date:'10 juin 2026', type:'Numéro frauduleux', annonce:'ann006', signalePar:'Jean Mbadinga', desc:'Le numéro demande de l\'argent à l\'avance.', traite:false },
];

const MOCK_MESSAGES = [
  { date:'13 juin 2026', nom:'Alain Ntoutoume', tel:'+24166998877', sujet:'Question sur une annonce', msg:'Bonjour, est-ce que la villa à Angondjé est encore disponible ?' },
  { date:'11 juin 2026', nom:'Fatou Diallo', tel:'+24177223344', sujet:'Problème technique', msg:'Je n\'arrive pas à publier mon annonce depuis hier soir.' },
];

let currentUser = null;
let annoncesData = [...MOCK_ANNONCES];
let usersData = [...MOCK_USERS];
let signalementsData = [...MOCK_SIGNALEMENTS];
let messagesData = [...MOCK_MESSAGES];
let theme = localStorage.getItem('malaga_admin_theme') || 'light';

/* ══════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTopbarDate();
  initSidebar();
  checkAuth();
});

/* ══════════════════════════════════════════════════════════
   AUTHENTIFICATION
══════════════════════════════════════════════════════════ */
function checkAuth() {
  const saved = sessionStorage.getItem('malaga_admin_demo');
  if (saved) {
    onLoginSuccess({ email: saved, displayName: 'KOZANGUE Patrick' });
  } else {
    document.getElementById('loginOverlay').classList.remove('hidden');
  }
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

  setTimeout(() => {
    if (email === ADMIN_EMAIL && password.length >= 6) {
      sessionStorage.setItem('malaga_admin_demo', email);
      onLoginSuccess({ email, displayName: 'KOZANGUE Patrick' });
    } else {
      errEl.textContent = '❌ Email ou mot de passe incorrect';
      errEl.classList.remove('hidden');
      btn.textContent = 'Se connecter';
    }
  }, 500);
}

function onLoginSuccess(user) {
  currentUser = user;
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('adminName').textContent = user.displayName || 'Admin';
  document.getElementById('adminEmailDisplay').textContent = user.email || '';
  loadDashboard();
}

function adminLogout() {
  if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    sessionStorage.removeItem('malaga_admin_demo');
    location.reload();
  }
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
  
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
  else if (pageId === 'annonces') loadAnnonces();
  else if (pageId === 'utilisateurs') loadUsers();
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
  document.getElementById('kpiVues').textContent = annoncesData.reduce((s, a) => s + (a.vues || 0), 0).toLocaleString();
  document.getElementById('kpiSignal').textContent = signalementsData.filter(s => !s.traite).length;

  const tbody = document.getElementById('dashAnnoncesBody');
  tbody.innerHTML = annoncesData.slice(0, 5).map(a => `
    <tr>
      <td style="font-weight:700;">${a.titre.substring(0, 30)}</td>
      <td>${a.ville}</td>
      <td>${a.prix.toLocaleString()}</td>
      <td><span style="background:#D1FAE5;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;">${a.statut}</span></td>
      <td><button onclick="alert('${a.titre}')" style="padding:6px 10px;background:#009E60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Voir</button></td>
    </tr>
  `).join('');

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
   ANNONCES
══════════════════════════════════════════════════════════ */
function loadAnnonces() {
  const tbody = document.getElementById('annoncesTableBody');
  tbody.innerHTML = annoncesData.map(a => `
    <tr>
      <td style="font-size:11px;color:#888;">${a.id}</td>
      <td style="font-weight:600;">${a.titre.substring(0, 20)}</td>
      <td>${a.proprio}</td>
      <td>${a.ville}</td>
      <td>${a.prix.toLocaleString()}</td>
      <td>${a.vues.toLocaleString()}</td>
      <td><span style="background:#D1FAE5;padding:3px 8px;border-radius:6px;font-size:11px;">${a.statut}</span></td>
      <td><button onclick="alert('Édition: ${a.titre}')" style="padding:4px 8px;background:#3A75C4;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Éditer</button></td>
    </tr>
  `).join('');
}

function filtrerAnnonces() {
  loadAnnonces();
}

/* ══════════════════════════════════════════════════════════
   UTILISATEURS
══════════════════════════════════════════════════════════ */
function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = usersData.map(u => `
    <tr>
      <td style="font-weight:600;">${u.nom}</td>
      <td>${u.email}</td>
      <td>${u.tel}</td>
      <td><span style="background:#DBEAFE;padding:2px 8px;border-radius:6px;font-size:11px;color:#1E40AF;">${u.role}</span></td>
      <td>${u.date}</td>
      <td><button onclick="alert('${u.nom}')" style="padding:4px 8px;background:#EF4444;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Supprimer</button></td>
    </tr>
  `).join('');
}

/* ══════════════════════════════════════════════════════════
   SIGNALEMENTS
══════════════════════════════════════════════════════════ */
function loadSignalements() {
  const tbody = document.getElementById('signalementsBody');
  tbody.innerHTML = signalementsData.map(s => `
    <tr>
      <td>${s.date}</td>
      <td style="font-weight:600;">${s.type}</td>
      <td>${s.annonce}</td>
      <td>${s.signalePar}</td>
      <td style="font-size:12px;">${s.desc}</td>
      <td>
        <button onclick="marquerTraite('${s.id}')" style="padding:4px 8px;background:#009E60;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">
          ${s.traite ? 'Traité' : 'Traiter'}
        </button>
      </td>
    </tr>
  `).join('');
}

function marquerTraite(id) {
  const sig = signalementsData.find(s => s.id === id);
  if (sig) sig.traite = true;
  loadSignalements();
}

/* ══════════════════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════════════════ */
function loadMessages() {
  const tbody = document.getElementById('messagesBody');
  tbody.innerHTML = messagesData.map(m => `
    <tr>
      <td>${m.date}</td>
      <td style="font-weight:600;">${m.nom}</td>
      <td>${m.tel}</td>
      <td>${m.sujet}</td>
      <td style="font-size:12px;max-width:200px;">${m.msg.substring(0, 50)}...</td>
      <td><button onclick="alert('${m.msg}')" style="padding:4px 8px;background:#3A75C4;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">Lire</button></td>
    </tr>
  `).join('');
}

/* ══════════════════════════════════════════════════════════
   STATISTIQUES
══════════════════════════════════════════════════════════ */
function loadStats() {
  alert('📊 Statistiques:\n- Total annonces: ' + annoncesData.length + '\n- Total utilisateurs: ' + usersData.length + '\n- Signalements non traités: ' + signalementsData.filter(s => !s.traite).length);
}

/* ══════════════════════════════════════════════════════════
   PUBLICATION ANNONCE
══════════════════════════════════════════════════════════ */
function publierAnnonce() {
  const titre = document.getElementById('pubTitre').value;
  const type = document.getElementById('pubType').value;
  const ville = document.getElementById('pubVille').value;
  const quartier = document.getElementById('pubQuartier').value;
  const prix = document.getElementById('pubPrix').value;
  const tel = document.getElementById('pubTel').value;

  if (!titre || !type || !ville || !quartier || !prix || !tel) {
    alert('⚠️ Remplissez tous les champs obligatoires (*)');
    return;
  }

  const newAnnonce = {
    id: 'ann' + Date.now(),
    titre, type, ville, quartier,
    prix: parseInt(prix),
    tel,
    surface: parseInt(document.getElementById('pubSurface').value) || 0,
    chambres: parseInt(document.getElementById('pubChambres').value) || 0,
    sdb: parseInt(document.getElementById('pubSdb').value) || 0,
    desc: document.getElementById('pubDesc').value,
    statut: document.getElementById('pubStatut').value || 'disponible',
    proprio: 'Admin',
    vues: 0,
    dateCreation: new Date().toISOString().split('T')[0]
  };

  annoncesData.unshift(newAnnonce);
  alert('✅ Annonce publiée avec succès !');
  resetForm();
  showPage('annonces');
}

function resetForm() {
  document.getElementById('pubTitre').value = '';
  document.getElementById('pubType').value = '';
  document.getElementById('pubVille').value = '';
  document.getElementById('pubQuartier').value = '';
  document.getElementById('pubPrix').value = '';
  document.getElementById('pubTel').value = '';
  document.getElementById('pubDesc').value = '';
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

function confirmer(title, msg, callback) {
  if (confirm(msg)) callback();
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }
}

// Charger le dashboard au démarrage
window.addEventListener('load', () => {
  if (currentUser) loadDashboard();
});
