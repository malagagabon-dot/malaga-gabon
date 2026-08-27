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
  doc, setDoc, getDoc, serverTimestamp, collection, addDoc
} from "./firebase-config.js";

/* ══════════ INSCRIPTION ══════════
   role : "proprietaire" ou "chercheur"
   compteType (uniquement pour role="proprietaire") : "particulier", "entreprise" ou "hotel"
   Si compteType === "entreprise" OU "hotel", les champs entreprise.* sont enregistrés
   et le compte est créé avec statutEntreprise: "attente" (en attente de vérification
   par l'admin) — même mécanisme de vérification pour les deux. Les biens publiés
   restent visibles normalement pendant l'attente ; seuls le badge et le logo
   "🏢 Professionnel" / "🏨 Hôtel-Motel" n'apparaissent qu'une fois vérifié.
   Si compteType === "hotel", l'objet hotel.* (standing, horaires, équipements,
   nombre total de chambres) est en plus enregistré sur le profil. */
export async function inscrire({ email, motDePasse, nom, tel, role, compteType, entreprise, hotel }) {
  const credentiels = await createUserWithEmailAndPassword(auth, email, motDePasse);
  const uid = credentiels.user.uid;

  const donnees = {
    nom: nom || "",
    tel: tel || "",
    email,
    role: role || "chercheur",
    dateCreation: serverTimestamp()
  };

  const estProEntreprise = role === "proprietaire" && compteType === "entreprise" && entreprise;
  const estProHotel = role === "proprietaire" && compteType === "hotel" && entreprise;

  if (estProEntreprise || estProHotel) {
    donnees.compteType = compteType; // "entreprise" ou "hotel"
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

    if (estProHotel && hotel) {
      donnees.standing = hotel.standing || "";
      donnees.checkIn = hotel.checkIn || "";
      donnees.checkOut = hotel.checkOut || "";
      donnees.nombreChambresTotal = typeof hotel.nombreChambresTotal === "number" ? hotel.nombreChambresTotal : null;
      donnees.equipementsHotel = Array.isArray(hotel.equipementsHotel) ? hotel.equipementsHotel : [];
    }
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
    "auth/network-request-failed": "Problème de connexion internet. Réessayez.",
    "auth/user-disabled": "Ce compte a été désactivé.",
    "auth/missing-password": "Veuillez saisir un mot de passe."
  };
  return messages[code] || "Une erreur est survenue. Réessayez.";
}

/* ══════════ PROFIL UTILISATEUR ══════════
   Récupère le document Firestore /users/{uid}. Retourne null si absent —
   et aussi en cas d'erreur réseau/règles Firestore, plutôt que de faire
   planter l'appelant : sans ce try/catch, un simple aléa réseau ici faisait
   afficher "Une erreur est survenue. Réessayez." sur l'écran de connexion
   ALORS MÊME que l'authentification avait réussi (connecter() n'était pas
   en cause), et côté site public (app.js) ça empêchait carrément l'écoute
   des demandes de visite de l'utilisateur de démarrer. */
export async function getProfil(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Erreur récupération du profil :", err);
    return null;
  }
}

/* ══════════ MISE À JOUR DU PROFIL ══════════
   Met à jour tout ou partie du document /users/{uid} (nom, tel, photoURL...). */
export async function majProfil(uid, donnees) {
  await setDoc(doc(db, "users", uid), donnees, { merge: true });
}

/* ══════════════════════════════════════════════════════════
   VÉRIFICATION D'IDENTITÉ + DÉTECTION D'ANOMALIES
   ══════════════════════════════════════════════════════════
   IMPORTANT (sécurité) : ces données NE SONT PAS écrites dans /users/{uid},
   qui est lisible par tout utilisateur connecté (règles actuelles du site).
   Elles vont dans des collections séparées, dont les règles Firestore
   doivent restreindre l'accès (voir règles fournies à coller dans la
   console Firebase) :
     - verificationsIdentite/{uid}     → dossier complet (photos, adresse,
       n° de pièce en clair). Lecture réservée à l'admin + au propriétaire.
     - identitePieceIndex/{hash}       → juste { uid } pour repérer un même
       n° de pièce réutilisé, sans jamais stocker le n° en clair.
     - identiteTelIndex/{telNormalise} → juste { nomNormalise, uid } pour
       repérer un même téléphone utilisé avec un nom différent.
     - identiteNomSuspect/{nomNormalise} → liste noire alimentée par l'admin
       (voir admin.js) quand il signale/suspend un compte.
   Les deux collections "index" doivent rester lisibles par tout utilisateur
   connecté (nécessaire pour cette vérification côté client, faute de Cloud
   Functions sur le plan gratuit) — c'est un compromis à connaître : elles
   n'exposent qu'une empreinte, jamais la pièce ou la photo en clair. */

export async function hacherTexte(texte) {
  const enc = new TextEncoder().encode(texte.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function normaliserNom(nom) {
  return nom.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}
function normaliserTel(tel) {
  return tel.replace(/[^\d+]/g, "");
}

/* Calcule l'âge à partir d'une date de naissance "YYYY-MM-DD". */
export function calculerAge(dateNaissance) {
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance)) return null;
  const auj = new Date();
  let age = auj.getFullYear() - naissance.getFullYear();
  const avantAnniversaire = (auj.getMonth() < naissance.getMonth()) ||
    (auj.getMonth() === naissance.getMonth() && auj.getDate() < naissance.getDate());
  if (avantAnniversaire) age--;
  return age;
}

/* Vérifie les anomalies, écrit les index (sans jamais écraser l'entrée
   d'un autre utilisateur), crée les alertes dans "alertesFraude" s'il y a
   lieu, puis enregistre le dossier complet dans verificationsIdentite/{uid}.
   Retourne le statut final : "attente" ou "signale". */
export async function enregistrerVerificationIdentite(uid, donnees) {
  const { nomLegal, dateNaissance, typePiece, numeroPiece, adresseResidence, tel, selfieUrl, pieceRectoUrl, pieceVersoUrl } = donnees;
  const nomNormalise = normaliserNom(nomLegal);
  const telNormalise = normaliserTel(tel || "");
  const pieceHash = await hacherTexte(numeroPiece);
  const anomalies = [];

  // 1) Âge incohérent (moins de 18 ans)
  const age = calculerAge(dateNaissance);
  if (age !== null && age < 18) {
    anomalies.push({ type: "age_incoherent", details: `Âge calculé : ${age} ans (date de naissance : ${dateNaissance})` });
  }

  // 2) Numéro de pièce déjà utilisé par un autre compte
  const refPiece = doc(db, "identitePieceIndex", pieceHash);
  const snapPiece = await getDoc(refPiece);
  if (snapPiece.exists() && snapPiece.data().uid !== uid) {
    anomalies.push({ type: "doublon_piece", details: `Numéro de pièce déjà associé au compte ${snapPiece.data().uid}` });
  } else {
    await setDoc(refPiece, { uid, dateCreation: serverTimestamp() });
  }

  // 3) Même téléphone, nom différent
  if (telNormalise) {
    const refTel = doc(db, "identiteTelIndex", telNormalise);
    const snapTel = await getDoc(refTel);
    if (snapTel.exists() && snapTel.data().nomNormalise !== nomNormalise && snapTel.data().uid !== uid) {
      anomalies.push({ type: "doublon_tel", details: `Téléphone déjà utilisé par « ${snapTel.data().nomNormalise} » (compte ${snapTel.data().uid})` });
    } else {
      await setDoc(refTel, { nomNormalise, uid, dateCreation: serverTimestamp() });
    }
  }

  // 4) Nom déjà signalé/suspendu par l'admin
  const snapSuspect = await getDoc(doc(db, "identiteNomSuspect", nomNormalise));
  if (snapSuspect.exists()) {
    anomalies.push({ type: "nom_suspect", details: `Nom déjà signalé le : ${snapSuspect.data().motif || "motif non précisé"}` });
  }

  // Création des alertes
  for (const a of anomalies) {
    await addDoc(collection(db, "alertesFraude"), {
      uid, nom: nomLegal, type: a.type, details: a.details,
      traite: false, dateCreation: serverTimestamp()
    });
  }

  const statut = anomalies.length ? "signale" : "attente";

  await setDoc(doc(db, "verificationsIdentite", uid), {
    nomLegal, dateNaissance, typePiece, numeroPiece, adresseResidence,
    selfieUrl: selfieUrl || "", pieceRectoUrl: pieceRectoUrl || "", pieceVersoUrl: pieceVersoUrl || "",
    statut, // "attente" | "verifie" | "signale" | "suspendu"
    dateCreation: serverTimestamp()
  });

  return statut;
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
