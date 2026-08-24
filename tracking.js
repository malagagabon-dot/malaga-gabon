/* ═══════════════════════════════════════════
   MALAGA — tracking.js
   Enregistre les visites de page et les consultations d'annonces
   dans Firestore ("visites"), pour le tableau de bord admin.
═══════════════════════════════════════════ */
import { db, auth, addDoc, collection, serverTimestamp } from "./firebase-config.js";

function getSessionId() {
  let id = sessionStorage.getItem("malaga_session");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("malaga_session", id);
  }
  return id;
}

// Géolocalisation approximative par IP (gratuite, sans clé, sans demande de
// permission au visiteur) — mise en cache pour n'être interrogée qu'une
// fois par session. Best-effort : si la requête échoue, la visite est quand
// même enregistrée, simplement sans ville/pays.
let geoloc = null;
async function obtenirGeoloc() {
  if (geoloc !== null) return geoloc;
  try {
    const rep = await fetch("https://ipwho.is/");
    const data = await rep.json();
    geoloc = data?.success ? { ville: data.city || null, pays: data.country || null } : { ville: null, pays: null };
  } catch (e) {
    geoloc = { ville: null, pays: null };
  }
  return geoloc;
}

export async function enregistrerVisite(type, cible, titre = null) {
  try {
    const { ville, pays } = await obtenirGeoloc();
    await addDoc(collection(db, "visites"), {
      type, cible, titre,
      uid: auth.currentUser?.uid || null,
      session: getSessionId(),
      ville, pays,
      dateCreation: serverTimestamp()
    });
  } catch (e) {
    console.error("Erreur d'enregistrement de visite :", e);
  }
}
