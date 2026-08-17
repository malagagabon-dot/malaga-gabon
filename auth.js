/* ═══════════════════════════════════════════
   MALAGA — auth.js
   Fonctions d'authentification et de gestion du profil utilisateur,
   partagées par toutes les pages du site.
═══════════════════════════════════════════ */

import {
  auth, db,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  doc, setDoc, getDoc, serverTimestamp
} from "./firebase-config.js";

/* ══════════ INSCRIPTION ══════════
   role : "proprietaire" ou "chercheur"
   compteType (uniquement pour role="proprietaire") : "particulier" ou "entreprise"
   Si compteType === "entreprise", les champs entreprise.* sont enregistrés et le
   compte est créé avec statutEntreprise: "attente" (en attente de vérification
   par l'admin). Les biens publiés restent visibles normalement pendant l'attente ;
   seuls le badge et le logo "🏢 Professionnel" n'apparaissent qu'une fois vérifié. */
export async function inscrire({ email, motDePasse, nom, tel, role, compteType, entreprise }) {
  const credentiels = await createUserWithEmailAndPassword(auth, email, motDePasse);
  const uid = credentiels.user.uid;

  const donnees = {
    nom: nom || "",
    tel: tel || "",
    email,
    role: role || "chercheur",
    dateCreation: serverTimestamp()
  };

  if (role === "proprietaire" && compteType === "entreprise" && entreprise) {
    donnees.compteType = "entreprise";
    donnees.statutEntreprise = "attente";
    donnees.raisonSociale = entreprise.raisonSociale || "";
    donnees.slogan = entreprise.slogan || "";
    donnees.logoUrl = entreprise.logoUrl || "";
    donnees.typeEntreprise = entreprise.typeEntreprise || "";
    donnees.entrepriseTel = entreprise.entrepriseTel || "";
    donnees.entrepriseEmail = entreprise.entrepriseEmail || "";
    donnees.entrepriseAdresse = entreprise.entrepriseAdresse || "";
    donnees.entrepriseLat = typeof entreprise.entrepriseLat === "number" ? entreprise.entrepriseLat : null;
    donnees.entrepriseLng = typeof entreprise.entrepriseLng === "number" ? entreprise.entrepriseLng : null;
  } else if (role === "proprietaire") {
    donnees.compteType = "particulier";
  }

  await setDoc(doc(db, "users", uid), donnees);

  return credentiels.user;
}

/* ══════════ CONNEXION ══════════ */
export async function connecter(email, motDePasse) {
  const credentiels = await signInWithEmailAndPassword(auth, email, motDePasse);
  return credentiels.user;
}

/* ══════════ DÉCONNEXION ══════════ */
export async function deconnecter() {
  await signOut(auth);
}

/* ══════════ RÉINITIALISATION DU MOT DE PASSE ══════════
   L'URL personnalisée est indiquée ici, directement dans le code — elle
   s'applique à chaque envoi, sans dépendre du réglage "Personnaliser
   l'URL d'action" de la console Firebase (qui peut échouer selon les
   comptes/domaines). */
const URL_REINITIALISATION = "https://malagagabon-dot.github.io/malaga-gabon/reinitialiser.html";

export async function reinitialiserMotDePasse(email) {
  await sendPasswordResetEmail(auth, email, { url: URL_REINITIALISATION });
}

/* ══════════ MESSAGES D'ERREUR AUTH (en français) ══════════ */
export function messageErreurAuth(code) {
  const messages = {
    "auth/email-already-in-use": "Cette adresse email est déjà utilisée par un compte.",
    "auth/invalid-email": "L'adresse email n'est pas valide.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
    "auth/user-not-found": "Aucun compte ne correspond à cette adresse email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
    "auth/network-request-failed": "Problème de connexion internet. Réessayez."
  };
  return messages[code] || "Une erreur est survenue. Réessayez.";
}

/* ══════════ PROFIL UTILISATEUR ══════════
   Récupère le document Firestore /users/{uid}. Retourne null si absent. */
export async function getProfil(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/* ══════════ MISE À JOUR DU PROFIL ══════════
   Met à jour tout ou partie du document /users/{uid} (nom, tel, photoURL...). */
export async function majProfil(uid, donnees) {
  await setDoc(doc(db, "users", uid), donnees, { merge: true });
}

/* ══════════ PROTECTION DE PAGE ══════════
   À utiliser sur les pages réservées aux utilisateurs connectés
   (ex. publier.html, mes-annonces.html).

   - callback(user) est appelé une fois que l'utilisateur est confirmé connecté.
   - roleRequis (optionnel) : si fourni, vérifie que le profil correspond à ce rôle
     ("proprietaire" ou "chercheur"). Sinon, redirige vers la page d'accueil.
   - Si l'utilisateur n'est pas connecté, redirige vers connexion.html. */
export function protegerPage(callback, roleRequis) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "connexion.html";
      return;
    }
    if (roleRequis) {
      const profil = await getProfil(user.uid);
      if (profil?.role !== roleRequis) {
        window.location.href = "index.html";
        return;
      }
    }
    callback(user);
  });
}
