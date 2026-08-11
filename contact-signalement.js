/* ═══════════════════════════════════════════
   MALAGA — contact-signalement.js
   Formulaires "✉️ Nous écrire" et "🚩 Signaler un problème" du menu.
   Écrivent respectivement dans les collections Firestore "messages"
   et "signalements", lues en temps réel par le panneau admin
   (admin.js : demarrerEcouteMessages / demarrerEcouteSignalements).
═══════════════════════════════════════════ */

import { db, serverTimestamp } from "./firebase-config.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function ouvrirModal(id) {
  document.getElementById(id)?.classList.add("ouverte");
  document.body.style.overflow = "hidden";
}
function fermerModal(id) {
  document.getElementById(id)?.classList.remove("ouverte");
  document.body.style.overflow = "";
}
function afficherErreur(id, texte) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "❌ " + texte;
  el.classList.add("visible");
}
function masquerMessages(...ids) {
  ids.forEach(id => document.getElementById(id)?.classList.remove("visible"));
}

/* ══════════ FORMULAIRE CONTACT → collection "messages" ══════════ */
function initContact() {
  document.getElementById("drawerContact")?.addEventListener("click", (e) => {
    e.preventDefault();
    ouvrirModal("contactModal");
  });
  document.getElementById("fermerContact")?.addEventListener("click", () => fermerModal("contactModal"));
  document.getElementById("contactModal")?.addEventListener("click", (e) => {
    if (e.target.id === "contactModal") fermerModal("contactModal");
  });

  document.getElementById("formContact")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    masquerMessages("contactErreur", "contactSucces");

    const nom = document.getElementById("contactNom").value.trim();
    const tel = document.getElementById("contactTel").value.trim();
    const sujet = document.getElementById("contactSujet").value.trim() || "Sans sujet";
    const msg = document.getElementById("contactMessage").value.trim();

    if (!nom || !tel || !msg) {
      afficherErreur("contactErreur", "Merci de remplir les champs obligatoires (*).");
      return;
    }

    const btn = document.getElementById("contactBtn");
    btn.disabled = true;
    btn.textContent = "⏳ Envoi...";

    try {
      await addDoc(collection(db, "messages"), {
        nom, tel, sujet, msg,
        lu: false,
        dateCreation: serverTimestamp()
      });
      document.getElementById("contactSucces").classList.add("visible");
      document.getElementById("formContact").reset();
      setTimeout(() => fermerModal("contactModal"), 1600);
    } catch (err) {
      console.error("Erreur envoi message :", err);
      afficherErreur("contactErreur", "Une erreur est survenue. Réessayez ou contactez-nous par WhatsApp.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Envoyer";
    }
  });
}

/* ══════════ FORMULAIRE SIGNALEMENT → collection "signalements" ══════════ */
let signalementAnnonceId = null;

function initSignalement() {
  document.getElementById("drawerSignaler")?.addEventListener("click", (e) => {
    e.preventDefault();
    signalementAnnonceId = null;
    document.getElementById("signalerAnnonce").value = "";
    document.getElementById("signalerAnnonce").readOnly = false;
    ouvrirModal("signalerModal");
  });
  document.getElementById("fermerSignaler")?.addEventListener("click", () => fermerModal("signalerModal"));
  document.getElementById("signalerModal")?.addEventListener("click", (e) => {
    if (e.target.id === "signalerModal") fermerModal("signalerModal");
  });

  // Appelée depuis app.js (bouton "Signaler" dans la fiche détail d'une annonce)
  window.ouvrirSignalementAnnonce = (annonceId, annonceTitre) => {
    signalementAnnonceId = annonceId || null;
    const champAnnonce = document.getElementById("signalerAnnonce");
    champAnnonce.value = annonceTitre || "";
    champAnnonce.readOnly = !!annonceTitre;
    masquerMessages("signalerErreur", "signalerSucces");
    ouvrirModal("signalerModal");
  };

  document.getElementById("formSignaler")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    masquerMessages("signalerErreur", "signalerSucces");

    const type = document.getElementById("signalerType").value;
    const annonceTitre = document.getElementById("signalerAnnonce").value.trim() || "Non précisée";
    const signalePar = document.getElementById("signalerNom").value.trim() || "Anonyme";
    const desc = document.getElementById("signalerDesc").value.trim();

    if (!type || !desc) {
      afficherErreur("signalerErreur", "Merci de remplir les champs obligatoires (*).");
      return;
    }

    const btn = document.getElementById("signalerBtn");
    btn.disabled = true;
    btn.textContent = "⏳ Envoi...";

    try {
      await addDoc(collection(db, "signalements"), {
        type, annonceTitre, signalePar, desc,
        annonceId: signalementAnnonceId,
        traite: false,
        dateCreation: serverTimestamp()
      });
      document.getElementById("signalerSucces").classList.add("visible");
      document.getElementById("formSignaler").reset();
      signalementAnnonceId = null;
      setTimeout(() => fermerModal("signalerModal"), 1800);
    } catch (err) {
      console.error("Erreur envoi signalement :", err);
      afficherErreur("signalerErreur", "Une erreur est survenue. Réessayez.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Envoyer le signalement";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initContact();
  initSignalement();
});
