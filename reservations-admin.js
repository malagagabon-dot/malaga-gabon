/* ═══════════════════════════════════════════════════════════
   MALAGA — reservations-admin.js
   Onglet "Réservations" du panneau admin (admin.html).
   Écoute en temps réel la collection Firestore "demandesVisite"
   (demandes de visite gratuites) et permet à l'admin de
   valider/refuser une demande, en parallèle du propriétaire qui
   peut faire de même depuis son profil (profil.html) — les deux
   actions mettent à jour le même statut de réservation du bien.
   Chargé après admin.js — n'y touche pas, s'y accroche seulement.
═══════════════════════════════════════════════════════════ */

const DELAI_EXPIRATION_MIN = 30;

let toutesLesDemandes = [];
let filtreResStatut = 'en_attente';
let sonResActif = localStorage.getItem('malaga_admin_son') !== 'off';
let premierChargementRes = true;
let compteurAttentePrecedent = 0;
let ecouteDemarree = false;

/* Appelée par showPage('reservations') dans admin.js */
window.chargerReservations = function () {
  majPastilleSonRes();
  if (ecouteDemarree) return; // l'écoute Firestore reste active en arrière-plan
  ecouteDemarree = true;
  demarrerEcouteReservations();
};

window.filtrerReservations = function () {
  filtreResStatut = document.getElementById('filterResStatut').value;
  rendreListeReservations();
};

/* ══════════ ÉCOUTE TEMPS RÉEL FIRESTORE (compat) ══════════ */
function demarrerEcouteReservations() {
  if (!window.dbAdmin) {
    document.getElementById('listeReservations').innerHTML =
      '<p class="table-empty">Firebase n\'est pas initialisé (voir firebase-config-compat.js).</p>';
    return;
  }
  window.dbAdmin.collection('demandesVisite').orderBy('dateCreation', 'desc')
    .onSnapshot((snap) => {
      toutesLesDemandes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      expirerLesDemandesEnRetard();

      const nbAttente = toutesLesDemandes.filter(d => d.statut === 'en_attente').length;
      if (!premierChargementRes && nbAttente > compteurAttentePrecedent) {
        jouerSonRes();
        toast('🔔 Nouvelle demande de visite reçue');
      }
      premierChargementRes = false;
      compteurAttentePrecedent = nbAttente;

      majStatsReservations(nbAttente);
      rendreListeReservations();
    }, (err) => {
      console.error('Erreur de synchronisation des réservations :', err);
      document.getElementById('listeReservations').innerHTML =
        '<p class="table-empty">Impossible de charger les demandes. Vérifiez les règles Firestore et votre rôle admin.</p>';
    });
}

/* ══════════ SON ══════════ */
function majPastilleSonRes() {
  const el = document.getElementById('toggleSonRes');
  if (!el) return;
  el.textContent = sonResActif ? '🔔' : '🔕';
  el.onclick = () => {
    sonResActif = !sonResActif;
    localStorage.setItem('malaga_admin_son', sonResActif ? 'on' : 'off');
    majPastilleSonRes();
  };
}
function jouerSonRes() {
  if (!sonResActif) return;
  try {
    const a = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    a.play().catch(() => {});
  } catch (e) {}
}

/* ══════════ EXPIRATION AUTOMATIQUE (>30 min sans traitement) ══════════ */
function expirerLesDemandesEnRetard() {
  const maintenant = Date.now();
  toutesLesDemandes.forEach(d => {
    if (d.statut !== 'en_attente' || !d.dateCreation?.toMillis) return;
    const ageMinutes = (maintenant - d.dateCreation.toMillis()) / 60000;
    if (ageMinutes > DELAI_EXPIRATION_MIN) {
      traiterReservation(d, 'expiree', true);
      d.statut = 'expiree';
    }
  });
}

/* ══════════ STATISTIQUES ══════════ */
function majStatsReservations(nbAttente) {
  const programmees = toutesLesDemandes.filter(d => d.statut === 'confirmee').length;
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const aujourdhui = toutesLesDemandes.filter(d => d.dateCreation?.toMillis?.() > debutJour.getTime()).length;

  document.getElementById('kpiResAttente').textContent = nbAttente;
  document.getElementById('kpiResProgrammees').textContent = programmees;
  document.getElementById('kpiResJour').textContent = aujourdhui;

  const badge = document.getElementById('badgeReservations');
  if (badge) badge.textContent = nbAttente;
  document.title = nbAttente > 0 ? `(${nbAttente}) MALAGA – Administration` : 'MALAGA – Administration';
}

/* ══════════ RENDU ══════════ */
function rendreListeReservations() {
  const container = document.getElementById('listeReservations');
  if (!container) return;
  const demandes = toutesLesDemandes.filter(d => d.statut === filtreResStatut);

  if (demandes.length === 0) {
    const messages = {
      en_attente: 'Aucune demande en attente. Tout est traité !',
      confirmee: 'Aucune visite programmée pour le moment.',
      refusee: 'Aucune demande refusée.',
      expiree: 'Aucune demande expirée.'
    };
    container.innerHTML = `<p class="table-empty">${messages[filtreResStatut]}</p>`;
    return;
  }

  container.innerHTML = demandes.map(carteReservationHTML).join('');

  demandes.forEach(d => {
    document.getElementById(`res-valider-${d.id}`)?.addEventListener('click', () => confirmerActionReservation(d, 'confirmee'));
    document.getElementById(`res-refuser-${d.id}`)?.addEventListener('click', () => confirmerActionReservation(d, 'refusee'));
  });
}

function tempsEcouleRes(timestamp) {
  if (!timestamp?.toMillis) return '';
  const minutes = Math.round((Date.now() - timestamp.toMillis()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}

const BADGE_STATUT = { en_attente: 'badge-yellow', confirmee: 'badge-blue', refusee: 'badge-red', expiree: 'badge-gray' };
const LABEL_STATUT = { en_attente: '🟡 En attente', confirmee: '🔵 Visite programmée', refusee: '🚫 Refusée', expiree: '⌛ Expirée' };

function carteReservationHTML(d) {
  const numeroWhatsApp = (d.numeroEnvoi || d.chercheurTel || '').replace(/[^\d]/g, '');
  const messageWhatsApp = encodeURIComponent(
    `Bonjour ${d.chercheurNom || ''}, concernant votre demande de visite pour "${d.annonceTitre || "l'annonce"}" : merci de confirmer que ce créneau vous convient toujours.`
  );

  return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:.75rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:.5rem;">
        <div>
          <div style="font-weight:700;font-size:.95rem;">${escapeHTML(d.annonceTitre || 'Annonce')}</div>
          <div style="font-size:.78rem;color:var(--text-3);">${escapeHTML(tempsEcouleRes(d.dateCreation))}</div>
        </div>
        <span class="badge ${BADGE_STATUT[d.statut]}">${escapeHTML(LABEL_STATUT[d.statut])}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.5rem 1rem;background:var(--bg);border-radius:8px;padding:.75rem 1rem;margin-bottom:.75rem;font-size:.83rem;">
        <div><div style="color:var(--text-3);font-size:.72rem;text-transform:uppercase;">Chercheur</div><strong>${escapeHTML(d.chercheurNom || '—')}</strong></div>
        <div><div style="color:var(--text-3);font-size:.72rem;text-transform:uppercase;">Téléphone</div><strong>${escapeHTML(d.chercheurTel || '—')}</strong></div>
        <div><div style="color:var(--text-3);font-size:.72rem;text-transform:uppercase;">Date souhaitée</div><strong>${escapeHTML(d.dateSouhaitee || '—')}${d.heureSouhaitee ? ' à ' + escapeHTML(d.heureSouhaitee) : ''}</strong></div>
        <div><div style="color:var(--text-3);font-size:.72rem;text-transform:uppercase;">Bien (ID)</div><strong>${escapeHTML(d.annonceId || '—')}</strong></div>
        ${d.message ? `<div style="grid-column:1/-1;"><div style="color:var(--text-3);font-size:.72rem;text-transform:uppercase;">Message du chercheur</div><strong style="font-weight:600;">${escapeHTML(d.message)}</strong></div>` : ''}
      </div>

      <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
        ${numeroWhatsApp ? `<a href="https://wa.me/${numeroWhatsApp}?text=${messageWhatsApp}" target="_blank" class="btn-outline-sm" style="text-decoration:none;">💬 Contacter sur WhatsApp</a>` : ''}
        ${d.statut === 'en_attente' ? `
          <button id="res-valider-${d.id}" class="btn-primary" style="padding:.5rem 1rem;font-size:.8rem;">✅ Valider</button>
          <button id="res-refuser-${d.id}" class="btn-danger" style="padding:.5rem 1rem;font-size:.8rem;">✕ Refuser</button>
        ` : ''}
      </div>
    </div>
  `;
}

/* ══════════ CONFIRMATION AVANT ACTION (réutilise la modale existante) ══════════ */
function confirmerActionReservation(d, nouveauStatut) {
  const estValidation = nouveauStatut === 'confirmee';
  document.getElementById('modalTitle').textContent = estValidation ? 'Confirmer la réservation ?' : 'Refuser cette demande ?';
  document.getElementById('modalMsg').textContent = estValidation
    ? "Le bien passera en « Visite programmée » et ne sera plus réservable par un autre chercheur tant que cette visite n'est pas refusée ou expirée. Le propriétaire peut aussi traiter cette demande directement depuis son profil : les deux actions restent synchronisées."
    : "L'annonce redeviendra immédiatement disponible pour les autres chercheurs.";

  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = estValidation ? 'Confirmer' : 'Refuser';
  btn.onclick = () => {
    traiterReservation(d, nouveauStatut);
    fermerModal();
  };
  document.getElementById('modalConfirm').classList.remove('hidden');
}

/* ══════════ ÉCRITURE FIRESTORE (compat) ══════════ */
function traiterReservation(d, nouveauStatut, silencieux) {
  window.dbAdmin.collection('demandesVisite').doc(d.id).update({
    statut: nouveauStatut,
    dateTraitement: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    if (d.annonceId) {
      return window.dbAdmin.collection('annonces').doc(d.annonceId).update({
        statutReservation: nouveauStatut === 'confirmee' ? 'reserve' : 'disponible'
      });
    }
  }).then(() => {
    if (!silencieux) toast(nouveauStatut === 'confirmee' ? '✅ Visite programmée' : '✕ Demande refusée');
  }).catch((err) => {
    console.error('Erreur lors du traitement de la demande :', err);
    if (!silencieux) toast('❌ Une erreur est survenue');
  });
}

/* Démarre l'écoute dès l'arrivée sur le dashboard, même avant le premier clic sur l'onglet,
   pour que le badge de la sidebar se mette à jour en temps réel. */
window.addEventListener('load', () => {
  setTimeout(() => { if (!ecouteDemarree && window.dbAdmin) { ecouteDemarree = true; demarrerEcouteReservations(); } }, 1200);
});
