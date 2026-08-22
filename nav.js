/* ═══════════════════════════════════════════
   MALAGA — nav.js
   Logique partagée du header compact, du menu latéral (drawer)
   et de la barre de navigation basse, utilisée par toutes les pages.
═══════════════════════════════════════════ */

import { auth, db, onAuthStateChanged, signOut, doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, increment, collection, query, where, onSnapshot, orderBy, limit } from "./firebase-config.js";
import { getProfil } from "./auth.js";
import { escapeHTML, formatPrix } from "./malaga-reference.js";

/* ══════════ TRADUCTION FR / ANGLAIS ══════════
   Préférence mémorisée dans localStorage ("malaga_lang" : "fr" | "en").
   Le français reste la langue source : chaque texte traduisible porte
   l'attribut data-i18n (contenu) ou data-i18n-ph (placeholder), et sert
   lui-même de clé dans le dictionnaire TRADUCTIONS ci-dessous — pas besoin
   d'inventer un identifiant par élément, juste d'ajouter l'attribut.
   Appliqué au tout premier chargement du module (avant même
   DOMContentLoaded) pour éviter un flash FR→EN, puis ré-appliqué une fois
   le DOM prêt. */
const CLE_LANGUE = "malaga_lang";

const TRADUCTIONS = {
  // Header / menu latéral
  "Menu": "Menu",
  "Maison à louer au Gabon 🇬🇦": "Homes for rent in Gabon 🇬🇦",
  "🏠 Accueil": "🏠 Home",
  "📋 Toutes les annonces": "📋 All listings",
  "❤️ Mes favoris": "❤️ My favorites",
  "➕ Publier une annonce": "➕ Post a listing",
  "🏘️ Gérer mes annonces": "🏘️ Manage my listings",
  "🛠️ Panneau admin": "🛠️ Admin panel",
  "🔔 Activer les notifications": "🔔 Enable notifications",
  "⚙️ Paramètres": "⚙️ Settings",
  "📞 Nous appeler": "📞 Call us",
  "💬 WhatsApp": "💬 WhatsApp",
  "✉️ Nous écrire": "✉️ Write to us",
  "🚩 Signaler un problème": "🚩 Report a problem",
  "👤 Se connecter": "👤 Log in",
  "🚪 Se déconnecter": "🚪 Log out",
  "MALAGA 🇬🇦 — Libreville, Gabon": "MALAGA 🇬🇦 — Libreville, Gabon",
  "Favoris": "Favorites",
  "Mon compte": "My account",
  // Hero / accueil
  "Trouvez votre logement idéal à Libreville": "Find your ideal home in Libreville",
  "Quartier, arrondissement, type de bien...": "Neighborhood, district, property type...",
  "🔍 Rechercher": "🔍 Search",
  "Propriétaire": "Landlord",
  "Je publie des logements à louer": "I list homes for rent",
  "Chercheur": "Seeker",
  "Je cherche un logement": "I'm looking for a home",
  // Stats
  "🟢 Disponibles": "🟢 Available",
  "📍 Zones couvertes": "📍 Areas covered",
  "🆕 Publiées cette semaine": "🆕 Posted this week",
  // Filtres rapides
  "Toutes les communes": "All communes",
  "Tous les arrondissements": "All districts",
  "Tous les types": "All types",
  "Budget max": "Max budget",
  "Prix exact FCFA": "Exact price FCFA",
  "Agences et entreprises": "Agencies and companies",
  "🏢 Agences immobilières": "🏢 Real estate agencies",
  "🏛️ Sociétés privées": "🏛️ Private companies",
  "🏠 Particuliers": "🏠 Individuals",
  "🏢 Les catalogues": "🏢 Catalogs",
  // Recherches avancées
  "🎛️ Recherches avancées": "🎛️ Advanced search",
  "📍 Localisation": "📍 Location",
  "Quartier": "Neighborhood",
  "Ex : Angondjé": "E.g.: Angondjé",
  "Rue / point de repère": "Street / landmark",
  "Ex : Total d'Angondjé": "E.g.: Total Angondjé",
  "Caractère de la zone": "Area character",
  "Indifférent": "No preference",
  "Indifférente": "No preference",
  "Trier les annonces les plus proches de moi": "Sort listings closest to me",
  "🏠 Type & capacités": "🏠 Type & capacity",
  "Chambres (min.)": "Bedrooms (min.)",
  "Salons (min.)": "Living rooms (min.)",
  "Douches (min.)": "Showers (min.)",
  "Type de douche": "Shower type",
  "Cuisine": "Kitchen",
  "🧱 Construction & finitions": "🧱 Construction & finish",
  "Matériau de construction": "Construction material",
  "Couleur de peinture murale": "Wall paint color",
  "Terrasse": "Terrace",
  "Avec terrasse": "With terrace",
  "Sans terrasse": "Without terrace",
  "Sol carrelé": "Tiled floor",
  "Carrelé": "Tiled",
  "Non carrelé": "Not tiled",
  "💰 Budget": "💰 Budget",
  "Prix min. (FCFA)": "Min. price (FCFA)",
  "Prix max. (FCFA)": "Max. price (FCFA)",
  "Sans limite": "No limit",
  "✅ Équipements": "✅ Amenities",
  "Réinitialiser": "Reset",
  "Appliquer les filtres": "Apply filters",
  // Liste des annonces
  "Annonces disponibles": "Available listings",
  "Chargement…": "Loading…",
  "Liste détaillée": "Detailed list",
  "Liste": "List",
  "Miniature": "Thumbnail",
  "Mini": "Mini",
  "Moyenne": "Medium",
  "Moyen": "Medium",
  "Grande": "Large",
  "Grand": "Large",
  "Chargement des annonces en temps réel…": "Loading listings in real time…",
  // Footer
  "Mentions légales": "Legal notice",
  "Confidentialité": "Privacy",
  "CGU": "Terms of use",
  // Modales
  "✉️ Nous écrire": "✉️ Write to us",
  "Nom *": "Name *",
  "Votre nom": "Your name",
  "Téléphone *": "Phone *",
  "Sujet": "Subject",
  "Ex: Question sur une annonce": "E.g.: Question about a listing",
  "Message *": "Message *",
  "Votre message...": "Your message...",
  "✅ Message envoyé ! Nous vous répondrons rapidement.": "✅ Message sent! We'll reply shortly.",
  "Envoyer": "Send",
  "🚩 Signaler un problème": "🚩 Report a problem",
  "Type de problème *": "Problem type *",
  "Choisir...": "Choose...",
  "Fausse annonce": "Fake listing",
  "Numéro frauduleux": "Fraudulent phone number",
  "Bien déjà loué": "Already rented",
  "Contenu inapproprié": "Inappropriate content",
  "Autre": "Other",
  "Annonce concernée": "Related listing",
  "Titre ou quartier de l'annonce (facultatif)": "Listing title or neighborhood (optional)",
  "Votre nom": "Your name",
  "Facultatif": "Optional",
  "Description *": "Description *",
  "Décrivez le problème...": "Describe the problem...",
  "✅ Signalement envoyé. Merci de nous aider à garder MALAGA fiable.": "✅ Report sent. Thanks for helping keep MALAGA trustworthy.",
  "Envoyer le signalement": "Send report",
  "📅 Réserver une visite": "📅 Book a visit",
  "C'est gratuit. Indiquez la date et l'heure souhaitées : votre demande est envoyée au propriétaire par WhatsApp, avec un lien pour qu'il accepte ou refuse directement le rendez-vous.":
    "It's free. Pick your preferred date and time: your request is sent to the landlord via WhatsApp, with a link for them to accept or decline the appointment directly.",
  "Date souhaitée *": "Preferred date *",
  "Heure souhaitée *": "Preferred time *",
  "Message (optionnel)": "Message (optional)",
  "Précisions, questions sur le loyer ou les modalités de paiement...": "Details, questions about rent or payment terms...",
  "📲 Envoyer via WhatsApp": "📲 Send via WhatsApp",
  // Barre basse
  "Profil": "Profile",
  "Carte": "Map",

  // --- Pages complémentaires (connexion, profil, mes-annonces, publier, parametres, admin) ---
  "(obligatoire — chaque annonce doit être géolocalisée)": "(required — every listing must be geolocated)",
  "+ Ajouter une photo (URL)": "+ Add a photo (URL)",
  "+ Publier une annonce": "+ Post a listing",
  "Accueil": "Home",
  "Actions": "Actions",
  "Activer les notifications": "Enable notifications",
  "Admin": "Admin",
  "Administrateur": "Administrator",
  "Adresse du service commercial": "Sales department address",
  "Agence / Entreprise": "Agency / Company",
  "Agence immobilière": "Real estate agency",
  "Agences et entreprises inscrites — vérification et suivi de leur catalogue": "Registered agencies and companies — verification and catalog tracking",
  "Akanda": "Akanda",
  "Alimentation en eau": "Water supply",
  "Annonces actives": "Active listings",
  "Annonces par type de bien": "Listings by property type",
  "Annonces par ville": "Listings by city",
  "Annuler": "Cancel",
  "Appartement": "Apartment",
  "Arrondissement": "District",
  "Arrondissement *": "District *",
  "Aucun message": "No messages",
  "Aucun signalement": "No reports",
  "Aucun signalement récent": "No recent reports",
  "Aucune localisation enregistrée": "No location saved",
  "Bien": "Property",
  "Bien publié avec succès !": "Listing published successfully!",
  "Biens publiés": "Listings posted",
  "Bienvenue dans l'administration MALAGA": "Welcome to MALAGA administration",
  "Bon retour 👋": "Welcome back 👋",
  "Box": "Storage unit",
  "Bureau": "Office",
  "Ce mois-ci": "This month",
  "Cette semaine": "This week",
  "Chambre": "Bedroom",
  "Chambres": "Bedrooms",
  "Chargement de vos annonces…": "Loading your listings…",
  "Chargement...": "Loading...",
  "Choisir": "Choose",
  "Choisissez votre profil pour commencer": "Choose your profile to get started",
  "Cliquez pour ajouter des photos": "Click to add photos",
  "Cliquez pour ajouter une vidéo": "Click to add a video",
  "Cliquez sur la carte pour placer le repère, ou utilisez votre position actuelle.": "Click the map to place the marker, or use your current location.",
  "Cochez les moyens que vous acceptez pour le règlement du loyer. Ils s'afficheront sur votre annonce.": "Check the payment methods you accept for rent. They'll be shown on your listing.",
  "Colle le lien (URL) de chaque photo. La 1ʳᵉ photo de la liste sert d'image principale sur le site public.": "Paste the link (URL) of each photo. The 1st photo in the list is used as the main image on the public site.",
  "Commune *": "Commune *",
  "Comptes professionnels": "Professional accounts",
  "Compteur": "Meter",
  "Conditions Générales d'Utilisation": "Terms of Use",
  "Confirmation": "Confirmation",
  "Confirmer": "Confirm",
  "Connectez-vous à votre compte MALAGA": "Log in to your MALAGA account",
  "Connexion au flux temps réel…": "Connecting to the live feed…",
  "Contact commercial": "Sales contact",
  "Couleur de la peinture murale": "Wall paint color",
  "Couleur murale": "Wall color",
  "Couleur peinture murale": "Wall paint color",
  "Créer mon compte": "Create my account",
  "Créer un compte": "Create an account",
  "Date": "Date",
  "Depuis toujours": "All time",
  "Dernières annonces": "Latest listings",
  "Description": "Description",
  "Diffusez une annonce à tous les utilisateurs ayant activé les notifications sur le site.": "Broadcast an announcement to all users who have enabled notifications on the site.",
  "Disponibilité, modifications, suppression…": "Availability, edits, deletion…",
  "Disponible": "Available",
  "Douche": "Shower",
  "Douche (type)": "Shower (type)",
  "Email": "Email",
  "Email administrateur": "Administrator email",
  "Email de contact": "Contact email",
  "Email du propriétaire": "Landlord's email",
  "Email du service commercial": "Sales department email",
  "En attente": "Pending",
  "En attente de vérification": "Awaiting verification",
  "Enregistrer": "Save",
  "Entreprise": "Company",
  "Entrez votre email, nous vous enverrons un lien de réinitialisation": "Enter your email, we'll send you a reset link",
  "Envoyer le lien": "Send the link",
  "Envoyé par": "Sent by",
  "Franceville": "Franceville",
  "Gestion des annonces": "Listings management",
  "Gestion des utilisateurs": "User management",
  "Gérer mes annonces publiées": "Manage my published listings",
  "Gérez vos notifications et vos données sur cet appareil.": "Manage your notifications and data on this device.",
  "ID": "ID",
  "Inscrit le": "Joined on",
  "Je gère un catalogue de biens": "I manage a catalog of properties",
  "Je loue mon propre bien": "I rent out my own property",
  "Koulamoutou": "Koulamoutou",
  "L'IA génère automatiquement un titre accrocheur et une description professionnelle": "AI automatically generates a catchy title and a professional description",
  "Lambaréné": "Lambaréné",
  "Les photos et la position ne se modifient pas ici — supprimez et republiez si besoin.": "Photos and location can't be edited here — delete and repost if needed.",
  "Libreville": "Libreville",
  "Local commercial": "Commercial space",
  "Locataire": "Tenant",
  "Loyer mensuel (FCFA)": "Monthly rent (FCFA)",
  "Loyer mensuel (FCFA) *": "Monthly rent (FCFA) *",
  "MALAGA": "MALAGA",
  "MALAGA 🇬🇦": "MALAGA 🇬🇦",
  "Maison": "House",
  "Makokou": "Makokou",
  "Matériau": "Material",
  "Mes annonces": "My listings",
  "Message": "Message",
  "Moanda": "Moanda",
  "Modifier l'annonce": "Edit listing",
  "Modifier mon profil": "Edit my profile",
  "Mot de passe": "Password",
  "Mot de passe oublié ?": "Forgot your password?",
  "Mot de passe oublié 🔑": "Forgot password 🔑",
  "Mouila": "Mouila",
  "Nom": "Name",
  "Nom complet": "Full name",
  "Nom du propriétaire": "Landlord's name",
  "Nom du propriétaire / de l'agence": "Landlord's / agency's name",
  "Nombre de chambres": "Number of bedrooms",
  "Non": "No",
  "Non précisé": "Not specified",
  "Notifications activées": "Notifications enabled",
  "Numéro WhatsApp *": "WhatsApp number *",
  "N° de villa / porte / appartement": "Villa / door / apartment number",
  "Occupé": "Occupied",
  "Oui": "Yes",
  "Ouvrez un like pour le marquer comme vu : l'auteur reçoit alors une notification lui proposant de démarrer une discussion avec vous.": "Open a like to mark it as seen: the sender then gets a notification inviting them to start a conversation with you.",
  "Owendo": "Owendo",
  "Oyem": "Oyem",
  "Panneau d'administration": "Admin panel",
  "Particulier": "Individual",
  "Photos (jusqu'à 10) *": "Photos (up to 10) *",
  "Photos de l'annonce": "Listing photos",
  "Port-Gentil": "Port-Gentil",
  "Position exacte sur la carte *": "Exact position on the map *",
  "Prix": "Price",
  "Prix / mois": "Price / month",
  "Prix mensuel (FCFA) *": "Monthly price (FCFA) *",
  "Précisez la couleur": "Specify the color",
  "Précisez si le logement offre une vue mer, forêt, ville…": "Specify if the home offers a sea, forest, or city view…",
  "Publier l'annonce": "Post the listing",
  "Publier une annonce": "Post a listing",
  "Quartier *": "Neighborhood *",
  "Quartier / rue": "Neighborhood / street",
  "Raison sociale *": "Company name *",
  "Rang": "Rank",
  "Remplissez les détails de votre logement à louer": "Fill in the details of your home for rent",
  "Reçues aujourd'hui": "Received today",
  "Réinitialiser mes favoris et préférences": "Reset my favorites and preferences",
  "Rôle": "Role",
  "Salles de bain": "Bathrooms",
  "Salles de bain / douches": "Bathrooms / showers",
  "Salons": "Living rooms",
  "Se connecter": "Log in",
  "Signalements": "Reports",
  "Signalé par": "Reported by",
  "Slogan": "Slogan",
  "Société privée": "Private company",
  "Sol carrelé ?": "Tiled floor?",
  "Soyez averti(e) dès qu'un propriétaire réagit à un de vos likes, et recevez les actualités importantes de MALAGA.": "Get notified as soon as a landlord reacts to one of your likes, and receive important MALAGA news.",
  "Statut": "Status",
  "Statuts des annonces": "Listing statuses",
  "Studio": "Studio",
  "Surface (m²)": "Floor area (m²)",
  "Suspendus": "Suspended",
  "Tableau de bord": "Dashboard",
  "Tchibanga": "Tchibanga",
  "Terrain clôturé ?": "Fenced plot?",
  "Terrasse ?": "Terrace?",
  "Titre": "Title",
  "Titre *": "Title *",
  "Titre de l'annonce *": "Listing title *",
  "Top 5 annonces (vues)": "Top 5 listings (views)",
  "Tous": "All",
  "Tous les rôles": "All roles",
  "Tous les statuts": "All statuses",
  "Type": "Type",
  "Type de bien": "Property type",
  "Type de bien *": "Property type *",
  "Type de structure *": "Structure type *",
  "Téléphone": "Phone",
  "Téléphone du propriétaire": "Landlord's phone",
  "Téléphone du service commercial *": "Sales department phone *",
  "Une fois localisé, vous pouvez affiner en glissant le repère sur la carte. Cette position sera visible publiquement pour permettre aux visiteurs de venir jusqu'à vos bureaux (Google Maps, itinéraire, WhatsApp).": "Once located, you can fine-tune it by dragging the marker on the map. This position will be publicly visible so visitors can find their way to your offices (Google Maps, directions, WhatsApp).",
  "Utilisateurs": "Users",
  "Validation manuelle des paiements Airtel Money / Moov Money, en temps réel.": "Manual validation of Airtel Money / Moov Money payments, in real time.",
  "Vidéo courte (5 secondes maximum, facultatif)": "Short video (5 seconds max, optional)",
  "Villa": "Villa",
  "Ville": "City",
  "Ville *": "City *",
  "Visites programmées": "Scheduled visits",
  "Visiteurs/utilisateurs suivis": "Tracked visitors/users",
  "Voir tout →": "See all →",
  "Vos favoris et vos préférences de notifications sont stockés uniquement sur cet appareil. Vous pouvez les réinitialiser à tout moment.": "Your favorites and notification preferences are stored only on this device. You can reset them at any time.",
  "Votre photo, votre nom et votre téléphone": "Your photo, your name and your phone number",
  "Vous pouvez ajouter un autre bien maintenant, ou vous arrêter là — vos annonces vous attendent dans votre profil.": "You can add another property now, or stop here — your listings are waiting for you in your profile.",
  "Vous publiez en tant que...": "You're posting as...",
  "Vue": "View",
  "Vues": "Views",
  "Vues totales": "Total views",
  "Vérifiés": "Verified",
  "WhatsApp": "WhatsApp",
  "WhatsApp du propriétaire *": "Landlord's WhatsApp *",
  "directement avec le propriétaire, par WhatsApp/téléphone,\n            après une visite ou rencontre en personne": "directly with the landlord, by WhatsApp/phone,\n            after a visit or in-person meeting",
  "Écrivez-nous": "Write to us",
  "Électricité": "Electricity",
  "Équipements": "Amenities",
  "Équipements / Tags": "Amenities / Tags",
  "Étage": "Floor",
  "État du bâtiment": "Building condition",
  "Êtes-vous sûr ?": "Are you sure?",
  "ℹ️ Chambres, salons, cuisine et douche ne s'appliquent pas à ce type de bien — ces champs sont masqués.": "ℹ️ Bedrooms, living rooms, kitchen and shower don't apply to this property type — these fields are hidden.",
  "ℹ️ Votre profil (logo, contact, localisation) sera visible dès la création de votre compte, avec un catalogue prêt à recevoir vos annonces. Le badge\n            « 🏢 Professionnel vérifié » s'affichera une fois votre profil validé par l'équipe MALAGA.": "ℹ️ Your profile (logo, contact, location) will be visible as soon as your account is created, with a catalog ready to receive your listings. The badge\n            \"🏢 Verified professional\" will show once your profile is validated by the MALAGA team.",
  "ℹ️ À propos": "ℹ️ About",
  "← Retour": "← Back",
  "⌛ Expirées": "⌛ Expired",
  "⏳ En attente": "⏳ Pending",
  "⚫ Masqué": "⚫ Hidden",
  "⛔ Suspendu": "⛔ Suspended",
  "✅ Email de réinitialisation envoyé ! Vérifiez votre boîte de réception (et vos spams).": "✅ Reset email sent! Check your inbox (and your spam folder).",
  "✅ Vérifié": "✅ Verified",
  "✉️ Messages reçus": "✉️ Messages received",
  "✏️ Modifier": "✏️ Edit",
  "✏️ Modifier l'annonce": "✏️ Edit listing",
  "✨ Générer titre et description avec l'IA": "✨ Generate title and description with AI",
  "❌ Email ou mot de passe incorrect": "❌ Incorrect email or password",
  "❤️ Annonces likées": "❤️ Liked listings",
  "❤️ Favoris": "❤️ Favorites",
  "❤️ Likes ⇅": "❤️ Likes ⇅",
  "➕ Ajouter un autre bien": "➕ Add another property",
  "🌱 Ajouter des annonces démo": "🌱 Add demo listings",
  "🎛️ Filtres avancés": "🎛️ Advanced filters",
  "🏘️ Annonces": "🏘️ Listings",
  "🏘️ Mes annonces": "🏘️ My listings",
  "🏘️ Terminer et voir mes annonces": "🏘️ Finish and view my listings",
  "🏠 Caractéristiques": "🏠 Features",
  "🏠 Type &amp; capacités": "🏠 Type &amp; capacity",
  "🏠 Une fois votre compte créé, vous serez dirigé(e) vers le formulaire de publication pour ajouter votre premier bien (photos, localisation, moyens de paiement...). Vous pourrez ensuite en ajouter d'autres, un par un, à tout moment.": "🏠 Once your account is created, you'll be taken to the listing form to add your first property (photos, location, payment methods...). You can then add others, one at a time, whenever you like.",
  "🏢 Comptes professionnels": "🏢 Professional accounts",
  "🏢 Profil de votre agence / entreprise": "🏢 Your agency / company profile",
  "👤 Compte": "👤 Account",
  "💳 Demandes de visite": "💳 Visit requests",
  "💳 Moyens de paiement acceptés": "💳 Accepted payment methods",
  "💾 Enregistrer": "💾 Save",
  "📅 Demandes visite": "📅 Visit requests",
  "📅 Mes demandes de visite": "📅 My visit requests",
  "📈 Statistiques": "📈 Statistics",
  "📍 Localisation du siège / bureaux *": "📍 Headquarters / office location *",
  "📍 Utiliser ma position actuelle": "📍 Use my current location",
  "📞 +241 60 14 19 24 &nbsp;|&nbsp; ✉️ malagagabon@gmail.com": "📞 +241 60 14 19 24 &nbsp;|&nbsp; ✉️ malagagabon@gmail.com",
  "📞 Contact": "📞 Contact",
  "📢 Envoyer une notification à tous": "📢 Send a notification to everyone",
  "📢 Envoyer à tous": "📢 Send to everyone",
  "📤 Publier l'annonce": "📤 Post the listing",
  "📥 Demandes de visite reçues": "📥 Visit requests received",
  "📷 Ajouter le logo": "📷 Add the logo",
  "📷 Changer la photo": "📷 Change photo",
  "📸 Photos et vidéo": "📸 Photos and video",
  "🔔 Notifications": "🔔 Notifications",
  "🔥 Classement des likes": "🔥 Likes leaderboard",
  "🔥 Likes reçus": "🔥 Likes received",
  "🔴 Occupé": "🔴 Occupied",
  "🔵 Programmées": "🔵 Scheduled",
  "🕓 Historique des envois": "🕓 Sending history",
  "🗑️ Données sur cet appareil": "🗑️ Data on this device",
  "🗑️ Supprimer les démos": "🗑️ Delete demos",
  "🙍 Mon profil": "🙍 My profile",
  "🙍 Voir / modifier mon profil": "🙍 View / edit my profile",
  "🚨 Signalements": "🚨 Reports",
  "🚨 Signalements récents": "🚨 Recent reports",
  "🚫 Refusées": "🚫 Declined",
  "🛰️ Utiliser ma position GPS actuelle": "🛰️ Use my current GPS location",
  "🟡 En attente": "🟡 Pending",
  "🟡 Réservé": "🟡 Reserved",
  "🟢 Disponible": "🟢 Available",
  "🧱 Construction &amp; finitions": "🧱 Construction &amp; finish",
  "+241 6 XX XX XX": "+241 6 XX XX XX",
  "+241 XX XX XX XX": "+241 XX XX XX XX",
  "6 caractères minimum": "6 characters minimum",
  "Décrivez le bien : équipements, état, accès, particularités...": "Describe the property: amenities, condition, access, special features...",
  "Décrivez le logement, son environnement, ses atouts...": "Describe the home, its surroundings, its strengths...",
  "Ex : Belle villa meublée avec jardin": "E.g.: Beautiful furnished villa with garden",
  "Ex : Bleu marine": "E.g.: Navy blue",
  "Ex : De nouvelles annonces viennent d'être publiées à Akanda !": "E.g.: New listings have just been posted in Akanda!",
  "Ex : Gabon Immo Services": "E.g.: Gabon Immo Services",
  "Ex : Immeuble X, Centre-ville, Libreville": "E.g.: Building X, Downtown, Libreville",
  "Ex : Jean Mbadinga": "E.g.: Jean Mbadinga",
  "Ex : Nouveauté sur MALAGA": "E.g.: New on MALAGA",
  "Ex : Villa B12, Appt 4": "E.g.: Villa B12, Apt 4",
  "Ex : Villa B12, Appt 4, Porte 3": "E.g.: Villa B12, Apt 4, Door 3",
  "Ex : Votre partenaire immobilier de confiance": "E.g.: Your trusted real estate partner",
  "Ex : derrière la station Total d'Angondjé": "E.g.: behind the Total station in Angondjé",
  "Ex: 1": "E.g.: 1",
  "Ex: 150000": "E.g.: 150000",
  "Ex: 2": "E.g.: 2",
  "Ex: 2e arrondissement": "E.g.: 2nd district",
  "Ex: 80": "E.g.: 80",
  "Ex: Agence Malaga Immo": "E.g.: Malaga Immo Agency",
  "Ex: Akanda, Batterie IV...": "E.g.: Akanda, Batterie IV...",
  "Ex: Belle villa meublée avec jardin à Akanda": "E.g.: Beautiful furnished villa with garden in Akanda",
  "admin@malaga.gabon": "admin@malaga.gabon",
  "contact@entreprise.ga": "contact@entreprise.ga",
  "proprietaire@exemple.com": "proprietaire@exemple.com",
  "vous@exemple.com": "vous@exemple.com",
  "🔍 Rechercher un bien ou un propriétaire...": "🔍 Search a property or landlord...",
  "🔍 Rechercher un utilisateur...": "🔍 Search a user...",
  "🔍 Rechercher une entreprise...": "🔍 Search a company...",
  "🔍 Rechercher...": "🔍 Search...",
};

function langueMemorisee() {
  try { return localStorage.getItem(CLE_LANGUE); } catch { return null; }
}

function langueCourantePreferere() {
  const memorisee = langueMemorisee();
  if (memorisee === "fr" || memorisee === "en") return memorisee;
  return "fr";
}

/* Applique la langue : traduit tout élément marqué data-i18n (texte) ou
   data-i18n-ph (placeholder) en utilisant le texte français d'origine
   (mémorisé dans data-i18n-src la première fois) comme clé du dictionnaire. */
function appliquerLangue(langue) {
  document.documentElement.setAttribute("lang", langue);

  document.querySelectorAll("[data-i18n]").forEach(el => {
    if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.textContent;
    const source = el.dataset.i18nSrc;
    const cle = source.trim();
    el.textContent = (langue === "en" && TRADUCTIONS[cle]) ? TRADUCTIONS[cle] : source;
  });

  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    if (!el.dataset.i18nPhSrc) el.dataset.i18nPhSrc = el.getAttribute("placeholder") || "";
    const source = el.dataset.i18nPhSrc;
    el.setAttribute("placeholder", (langue === "en" && TRADUCTIONS[source]) ? TRADUCTIONS[source] : source);
  });

  document.querySelectorAll("#btnLang").forEach(el => {
    el.setAttribute("aria-label", langue === "en" ? "Switch to French" : "Passer en anglais");
  });
  document.querySelectorAll("#drawerLang").forEach(el => {
    el.textContent = langue === "en" ? "🌐 Français" : "🌐 English";
  });
}

export function basculerLangue() {
  const nouvelle = langueCourantePreferere() === "en" ? "fr" : "en";
  try { localStorage.setItem(CLE_LANGUE, nouvelle); } catch { /* ignoré */ }
  appliquerLangue(nouvelle);
  return nouvelle;
}

function initLangue() {
  appliquerLangue(langueCourantePreferere());
  // Délégation sur document plutôt qu'un addEventListener direct sur chaque
  // bouton : le clic est capté même si #btnLang/#drawerLang sont recréés ou
  // remplacés par un autre script après le chargement initial de la page.
  document.addEventListener("click", (e) => {
    const cible = e.target.closest("#btnLang, #drawerLang");
    if (!cible) return;
    e.preventDefault();
    basculerLangue();
  });
}

// Appliqué immédiatement au chargement du module, avant DOMContentLoaded,
// pour éviter un flash de texte français suivi d'un passage en anglais.
appliquerLangue(langueCourantePreferere());

/* ══════════ FAVORIS (stockage local) ══════════ */
const CLE_FAVORIS = "malaga_favoris";

export function getFavoris() {
  try { return JSON.parse(localStorage.getItem(CLE_FAVORIS)) || []; }
  catch { return []; }
}

export function estFavori(id) {
  return getFavoris().includes(id);
}

/* Retire du stockage local les favoris dont l'annonce n'existe plus côté Firestore
   (supprimée, ou passée "occupé" donc sortie de la liste publique), pour éviter
   d'accumuler des ids obsolètes. Appelée par app.js à chaque mise à jour temps réel
   des annonces. */
export function purgerFavorisInexistants(idsExistants) {
  try {
    const favoris = getFavoris();
    const ensemble = new Set(idsExistants || []);
    const filtres = favoris.filter(id => ensemble.has(id));
    if (filtres.length !== favoris.length) {
      localStorage.setItem(CLE_FAVORIS, JSON.stringify(filtres));
      majBadgeFavoris();
    }
  } catch (err) {
    console.error("Purge des favoris obsolètes impossible :", err);
  }
}

/* Réinitialise toutes les préférences locales de l'appareil (favoris, identifiant
   visiteur anonyme, notifications déjà vues/activées). Utilisé par parametres.html. */
export function viderDonneesLocales() {
  localStorage.removeItem(CLE_FAVORIS);
  localStorage.removeItem("malaga_likes_notifies");
  localStorage.removeItem("malaga_derniere_notif_globale_vue");
  localStorage.removeItem("malaga_notifs_actives");
  majBadgeFavoris();
}

/* ══════════ IDENTIFIANT VISITEUR ANONYME ══════════
   Persistant dans localStorage : permet à un visiteur non connecté de
   liker/déliker sans dupliquer les documents Firestore, et sert de clé
   stable pour le document de like tant qu'il ne se connecte pas. */
const CLE_VISITEUR = "malaga_visiteur_id";
function idVisiteur() {
  let id = localStorage.getItem(CLE_VISITEUR);
  if (!id) {
    id = "v_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(CLE_VISITEUR, id);
  }
  return id;
}

/* Identifiant stable de la personne courante : uid Firebase si connectée,
   sinon identifiant anonyme persistant. Sert de clé pour retrouver "ses"
   likes (collection "likes") depuis n'importe quelle page, y compris pour
   un visiteur non connecté. */
function identifiantActuel() {
  return auth.currentUser ? auth.currentUser.uid : idVisiteur();
}

/* ══════════ MIGRATION DES LIKES ANONYMES VERS LE COMPTE CONNECTÉ ══════════
   Anomalie corrigée : un même "like" pouvait se retrouver sous deux
   identifiants Firestore différents (l'id anonyme puis l'uid, ou l'inverse),
   selon que la personne était connectée ou non au moment du clic. Résultat :
   deux documents "likes" distincts pour la même annonce → deux liens/messages
   WhatsApp envoyés au propriétaire pour un seul geste.
   Dès qu'un utilisateur se connecte, on reprend chaque annonce présente dans
   ses favoris locaux et, si un like anonyme existe encore pour cette annonce
   sous l'ancien identifiant, on le transfère (copie + suppression) vers
   l'identifiant définitif (uid). Best-effort : ne bloque jamais l'affichage. */
async function migrerLikesAnonymesVersUid(uid) {
  if (!db) return;
  const idAnonyme = idVisiteur();
  if (!idAnonyme || idAnonyme === uid) return;

  const favoris = getFavoris();
  for (const annonceId of favoris) {
    try {
      const ancienRef = doc(db, "likes", `${annonceId}_${idAnonyme}`);
      const ancienSnap = await getDoc(ancienRef);
      if (!ancienSnap.exists()) continue;

      const nouveauRef = doc(db, "likes", `${annonceId}_${uid}`);
      const nouveauSnap = await getDoc(nouveauRef);
      if (!nouveauSnap.exists()) {
        const donnees = ancienSnap.data();
        await setDoc(nouveauRef, { ...donnees, utilisateurId: uid, identifiant: uid });
      }
      await deleteDoc(ancienRef);
    } catch (err) {
      console.error(`Migration du like anonyme pour l'annonce ${annonceId} impossible :`, err);
    }
  }
}

/* ══════════ TOGGLE FAVORI ══════════
   `annonce` : soit un id (rétrocompatibilité), soit l'objet annonce complet
   { id, proprietaireId, proprietaireNom, proprietaireEmail, titre }.
   Le like reste immédiat côté UI (localStorage) ; l'écriture Firestore et
   la notification email sont faites en best-effort, sans jamais bloquer
   l'interface si elles échouent (utilisateur hors-ligne, règles, etc.). */
export function toggleFavori(annonce) {
  const a = (typeof annonce === "string" || typeof annonce === "number") ? { id: annonce } : (annonce || {});
  const id = a.id;

  const favoris = getFavoris();
  const idx = favoris.indexOf(id);
  const ajout = idx === -1;
  if (ajout) favoris.push(id); else favoris.splice(idx, 1);
  localStorage.setItem(CLE_FAVORIS, JSON.stringify(favoris));
  majBadgeFavoris();

  // Identifiant du document "likes" calculé en synchrone (déterministe : annonceId +
  // identifiant courant) afin de pouvoir construire le lien "voir le like" tout de
  // suite, sans attendre l'écriture Firestore ci-dessous.
  const likeId = id ? `${id}_${identifiantActuel()}` : null;

  // Proposition WhatsApp déclenchée en synchrone, dans le même geste utilisateur
  // que le clic (nécessaire pour éviter le blocage de popup des navigateurs).
  // Garde-fou anti-doublon : un même likeId ne propose l'envoi WhatsApp qu'une
  // seule fois par session d'onglet (double-clic, ré-affichage, etc.).
  if (ajout && likeId && !dejaPropose(likeId)) {
    marquerPropose(likeId);
    proposerPartageWhatsApp(a, likeId);
  }

  synchroniserLikeFirestore(a, ajout, likeId).catch((err) => console.error("Synchronisation du like impossible :", err));

  return favoris.includes(id);
}

const CLE_LIKES_PROPOSES = "malaga_likes_proposes_session";
function dejaPropose(likeId) {
  try { return (JSON.parse(sessionStorage.getItem(CLE_LIKES_PROPOSES)) || []).includes(likeId); }
  catch { return false; }
}
function marquerPropose(likeId) {
  try {
    const liste = JSON.parse(sessionStorage.getItem(CLE_LIKES_PROPOSES)) || [];
    if (!liste.includes(likeId)) { liste.push(likeId); sessionStorage.setItem(CLE_LIKES_PROPOSES, JSON.stringify(liste)); }
  } catch { /* ignoré */ }
}

/* ══════════ PROPOSITION D'ENVOI DU LIKE AU PROPRIÉTAIRE PAR WHATSAPP ══════════
   Après un like, propose au visiteur de prévenir le propriétaire via le
   numéro WhatsApp déjà renseigné sur l'annonce (mêmes champs que le bouton
   WhatsApp existant sur la fiche détail : whatsapp, sinon tel). Le visiteur
   garde la main : il envoie lui-même le message (ou annule), aucun envoi
   automatique caché.

   Le message est volontairement descriptif (annonce, prix, quartier) et
   contient un lien vers "profil.html?like=ID" : en l'ouvrant, le propriétaire
   voit le like reçu et peut, en un clic, indiquer qu'il souhaite débuter une
   discussion — ce qui déclenchera à son tour une notification pour l'auteur
   du like (voir initNotificationsLikesVus ci-dessous). */
function proposerPartageWhatsApp(a, likeId) {
  const numero = (a.whatsapp || a.proprietaireTel || a.tel || "").replace(/[^\d]/g, "");
  if (!numero) return;

  const veut = confirm(`❤️ Annonce ajoutée à vos favoris !\n\nVoulez-vous prévenir le propriétaire par WhatsApp que vous aimez « ${a.titre || "cette annonce"} » ?`);
  if (!veut) return;

  const details = [
    a.prix ? formatPrix(a.prix) : "",
    a.quartier || a.commune || ""
  ].filter(Boolean).join(" · ");

  const lien = likeId ? `${location.origin}${location.pathname.replace(/[^/]*$/, "")}profil.html?like=${encodeURIComponent(likeId)}` : "";

  const texte = `Bonjour${a.proprietaireNom ? " " + a.proprietaireNom : ""} 👋, je viens d'ajouter votre annonce « ${a.titre || "votre annonce"} »${details ? ` (${details})` : ""} à mes favoris sur MALAGA ❤️.`
    + (lien ? `\n\n👉 Cliquez ici pour voir mon like et me dire si vous souhaitez qu'on discute : ${lien}` : "");

  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texte)}`, "_blank");
}

async function synchroniserLikeFirestore(a, ajout, likeIdCalcule) {
  if (!a.id || !db) return;

  const user = auth.currentUser;
  const identifiant = identifiantActuel();
  const likeId = likeIdCalcule || `${a.id}_${identifiant}`;
  const likeRef = doc(db, "likes", likeId);
  const annonceRef = doc(db, "annonces", a.id);

  if (ajout) {
    let nomAffiche = "Un visiteur";
    let visiteurTel = "";
    if (user) {
      const profil = await getProfil(user.uid).catch(() => null);
      nomAffiche = profil?.nom || user.email || "Un visiteur";
      visiteurTel = profil?.tel || "";
    }

    await setDoc(likeRef, {
      annonceId: a.id,
      annonceTitre: a.titre || "",
      proprietaireId: a.proprietaireId || null,
      proprietaireNom: a.proprietaireNom || "",
      proprietaireWhatsapp: (a.whatsapp || a.proprietaireTel || a.tel || "").replace(/[^\d]/g, ""),
      utilisateurId: user ? user.uid : null,
      identifiant,          // clé stable (uid ou id anonyme) pour retrouver "mes" likes
      nomAffiche,
      visiteurTel,           // permet au propriétaire de répondre directement par WhatsApp
      vu: false,             // passe à true quand le propriétaire ouvre le lien "voir le like"
      dateVu: null,
      dateLike: serverTimestamp()
    });
    await updateDoc(annonceRef, { nbLikes: increment(1) }).catch(() => {});

    // Notification email au propriétaire (best-effort, ne bloque jamais l'UI)
    if (a.proprietaireEmail && window.MALAGA_EMAIL?.envoyerNotificationLike) {
      window.MALAGA_EMAIL.envoyerNotificationLike({
        proprietaireEmail: a.proprietaireEmail,
        proprietaireNom: a.proprietaireNom || "",
        annonceTitre: a.titre || "votre annonce",
        nomVisiteur: nomAffiche
      });
    }
  } else {
    await deleteDoc(likeRef).catch(() => {});
    await updateDoc(annonceRef, { nbLikes: increment(-1) }).catch(() => {});
  }
}

/* ══════════ NOTIFICATION RETOUR À L'AUTEUR DU LIKE ══════════
   Dès que le propriétaire ouvre "profil.html?like=ID" et marque le like
   comme vu (champ vu:true, écrit depuis profil.html), l'auteur du like —
   qu'il soit connecté ou simple visiteur anonyme — reçoit, à sa prochaine
   page vue sur le site, une notification en surcouche lui proposant de
   démarrer une discussion WhatsApp avec le propriétaire. Écoute en temps
   réel best-effort : ne bloque jamais l'affichage du site si Firestore est
   indisponible. */
const CLE_LIKES_NOTIFIES = "malaga_likes_notifies";

function getLikesNotifies() {
  try { return JSON.parse(localStorage.getItem(CLE_LIKES_NOTIFIES)) || []; }
  catch { return []; }
}
function marquerLikeNotifieLocalement(likeId) {
  const liste = getLikesNotifies();
  if (!liste.includes(likeId)) {
    liste.push(likeId);
    localStorage.setItem(CLE_LIKES_NOTIFIES, JSON.stringify(liste));
  }
}

let ecouteNotifsLikesDemarree = false;
function initNotificationsLikesVus() {
  if (ecouteNotifsLikesDemarree || !db) return;
  ecouteNotifsLikesDemarree = true;

  onAuthStateChanged(auth, (user) => {
    const identifiant = user ? user.uid : idVisiteur();
    const q = query(collection(db, "likes"), where("identifiant", "==", identifiant), where("vu", "==", true));
    onSnapshot(q, (snap) => {
      const deja = getLikesNotifies();
      snap.docs
        .filter(d => !deja.includes(d.id))
        .forEach(d => afficherNotificationLikeVu({ id: d.id, ...d.data() }));
    }, (err) => console.error("Écoute des notifications de like impossible :", err));
  });
}

let fileNotificationsLikes = [];
let notificationLikeEnCours = false;

function afficherNotificationLikeVu(like) {
  marquerLikeNotifieLocalement(like.id);
  fileNotificationsLikes.push({ type: "like", ...like });
  if (!notificationLikeEnCours) traiterFileNotificationsLikes();
  notifierNatif("👀 Votre like a été vu !", `Le propriétaire de « ${like.annonceTitre || "cette annonce"} » a vu votre like.`);
}

function injecterStylesNotifLike() {
  if (document.getElementById("styleNotifLike")) return;
  const style = document.createElement("style");
  style.id = "styleNotifLike";
  style.textContent = `
    .notif-like-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;
      justify-content:center;z-index:9999;animation:notifLikeFondu .18s ease;}
    @keyframes notifLikeFondu{from{opacity:0;}to{opacity:1;}}
    .notif-like-carte{background:#fff;border-radius:18px 18px 0 0;padding:22px 20px 26px;max-width:420px;width:100%;
      box-shadow:0 -8px 30px rgba(0,0,0,.18);font-family:inherit;}
    @media (min-width:480px){.notif-like-overlay{align-items:center;}.notif-like-carte{border-radius:18px;}}
    .notif-like-icone{font-size:30px;margin-bottom:8px;}
    .notif-like-titre{font-size:15px;font-weight:800;color:#1A2332;margin-bottom:6px;line-height:1.35;}
    .notif-like-texte{font-size:13px;color:#555;line-height:1.5;margin-bottom:18px;}
    .notif-like-boutons{display:flex;gap:10px;}
    .notif-like-btn{flex:1;padding:12px 10px;border-radius:12px;font-size:13px;font-weight:700;border:none;cursor:pointer;text-align:center;}
    .notif-like-btn-oui{background:#009E60;color:#fff;}
    .notif-like-btn-non{background:#F2F2F2;color:#444;}
  `;
  document.head.appendChild(style);
}

/* Affiche une notification en surcouche, qu'il s'agisse du retour d'un like vu
   (type "like", avec proposition de discussion WhatsApp) ou d'une annonce
   diffusée par l'administrateur (type "globale", simple message informatif). */
function traiterFileNotificationsLikes() {
  const notif = fileNotificationsLikes.shift();
  if (!notif) { notificationLikeEnCours = false; return; }
  notificationLikeEnCours = true;
  injecterStylesNotifLike();

  const estGlobale = notif.type === "globale";
  const overlay = document.createElement("div");
  overlay.className = "notif-like-overlay";
  overlay.innerHTML = estGlobale ? `
    <div class="notif-like-carte">
      <div class="notif-like-icone">📢</div>
      <div class="notif-like-titre">${escapeHTML(notif.titre || "MALAGA")}</div>
      <div class="notif-like-texte">${escapeHTML(notif.message || "")}</div>
      <div class="notif-like-boutons">
        <button type="button" class="notif-like-btn notif-like-btn-oui" style="flex:1;">OK, compris</button>
      </div>
    </div>
  ` : `
    <div class="notif-like-carte">
      <div class="notif-like-icone">👀</div>
      <div class="notif-like-titre">Votre like a été vu !</div>
      <div class="notif-like-texte">Le propriétaire de l'annonce « ${escapeHTML(notif.annonceTitre || "cette annonce")} » a vu votre like. Souhaitez-vous débuter une discussion avec lui ?</div>
      <div class="notif-like-boutons">
        <button type="button" class="notif-like-btn notif-like-btn-non">Plus tard</button>
        <button type="button" class="notif-like-btn notif-like-btn-oui">💬 Oui, discuter</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fermer = () => { overlay.remove(); traiterFileNotificationsLikes(); };

  overlay.querySelector(".notif-like-btn-non")?.addEventListener("click", fermer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fermer(); });

  overlay.querySelector(".notif-like-btn-oui").onclick = () => {
    if (!estGlobale) {
      const numero = (notif.proprietaireWhatsapp || "").replace(/[^\d]/g, "");
      if (numero) {
        const texte = `Bonjour${notif.proprietaireNom ? " " + notif.proprietaireNom : ""}, je viens de voir que vous avez consulté mon like sur votre annonce « ${notif.annonceTitre || ""} » 😊. Discutons-en !`;
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texte)}`, "_blank");
      } else {
        alert("Le numéro WhatsApp du propriétaire n'est pas disponible pour le moment.");
      }
    }
    fermer();
  };
}

/* ══════════ ACTIVATION DES NOTIFICATIONS ══════════
   Deux niveaux, indépendants et complémentaires :
   1. Les notifications en surcouche (like vu, annonces admin) sont TOUJOURS
      affichées à l'ouverture du site, qu'on soit "activé" ou non.
   2. "Activer les notifications" (menu ☰) demande en plus la permission du
      navigateur pour envoyer de vraies notifications système (Notification
      API), utiles quand l'onglet MALAGA n'est pas affiché. La préférence est
      enregistrée dans Firestore ("notifsPrefs") afin que l'admin puisse voir
      combien de personnes l'ont activée et leur diffuser des annonces. */
const CLE_NOTIFS_ACTIVES = "malaga_notifs_actives";

export function estNotifsActives() {
  return localStorage.getItem(CLE_NOTIFS_ACTIVES) === "1";
}

export async function toggleNotifications() {
  const activerMaintenant = !estNotifsActives();

  if (activerMaintenant && typeof Notification !== "undefined" && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* ignoré : best-effort */ }
  }

  localStorage.setItem(CLE_NOTIFS_ACTIVES, activerMaintenant ? "1" : "0");
  majLabelDrawerNotifs();
  enregistrerPrefNotifFirestore(activerMaintenant).catch((err) => console.error("Enregistrement de la préférence de notifications impossible :", err));

  return activerMaintenant;
}

async function enregistrerPrefNotifFirestore(actif) {
  if (!db) return;
  const identifiant = identifiantActuel();
  await setDoc(doc(db, "notifsPrefs", identifiant), {
    identifiant,
    uid: auth.currentUser ? auth.currentUser.uid : null,
    actif,
    dateMaj: serverTimestamp()
  }, { merge: true });
}

/* Notification système native (best-effort) : uniquement si l'utilisateur a
   explicitement activé les notifications ET que le navigateur a donné la
   permission. N'affiche jamais rien qui bloque l'usage du site. */
function notifierNatif(titre, corps) {
  if (!estNotifsActives()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(titre, { body: corps, icon: "img/favicon-180.png" }); } catch { /* ignoré */ }
}

function majLabelDrawerNotifs() {
  document.querySelectorAll("#drawerNotifs").forEach(el => {
    el.textContent = estNotifsActives() ? "🔕 Désactiver les notifications" : "🔔 Activer les notifications";
  });
}

function initDrawerNotifs() {
  majLabelDrawerNotifs();
  document.querySelectorAll("#drawerNotifs").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      const actif = await toggleNotifications();
      alert(actif
        ? "🔔 Notifications activées ! Vous serez prévenu(e) des réponses à vos likes et des actualités MALAGA."
        : "🔕 Notifications désactivées.");
    });
  });
}

/* ══════════ NOTIFICATIONS DIFFUSÉES PAR L'ADMIN ("notificationsGlobales") ══════════
   Écoute best-effort du dernier message envoyé par l'administrateur depuis le
   panneau admin (page "Notifications"). Affichée une seule fois par personne
   (mémorisé en localStorage), à tous les visiteurs — activer les notifications
   ajoute en plus une alerte système native quand l'onglet n'est pas au premier plan. */
const CLE_DERNIERE_NOTIF_GLOBALE = "malaga_derniere_notif_globale_vue";

let ecouteNotifsGlobalesDemarree = false;
function initEcouteNotificationsGlobales() {
  if (ecouteNotifsGlobalesDemarree || !db) return;
  ecouteNotifsGlobalesDemarree = true;

  const q = query(collection(db, "notificationsGlobales"), orderBy("dateEnvoi", "desc"), limit(1));
  onSnapshot(q, (snap) => {
    if (snap.empty) return;
    const dernier = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const dejaVue = localStorage.getItem(CLE_DERNIERE_NOTIF_GLOBALE);
    if (dernier.id === dejaVue) return;

    localStorage.setItem(CLE_DERNIERE_NOTIF_GLOBALE, dernier.id);
    fileNotificationsLikes.push({ type: "globale", titre: dernier.titre, message: dernier.message });
    if (!notificationLikeEnCours) traiterFileNotificationsLikes();
    notifierNatif(dernier.titre || "MALAGA", dernier.message || "");
  }, (err) => console.error("Écoute des notifications globales impossible :", err));
}



function majBadgeFavoris() {
  const n = getFavoris().length;
  document.querySelectorAll(".badge-favoris").forEach(el => {
    el.textContent = n > 0 ? n : "";
    el.style.display = n > 0 ? "flex" : "none";
  });
}

/* ══════════ INITIALES POUR L'AVATAR ══════════ */
function initiales(nom) {
  if (!nom) return "?";
  const parts = nom.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || nom[0].toUpperCase();
}

/* ══════════ MENU LATÉRAL (DRAWER) ══════════ */
function initDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const btnOuvrir = document.getElementById("btnMenu");
  const btnFermer = document.getElementById("fermerDrawer");
  if (!drawer) return;

  const ouvrir = () => { drawer.classList.add("ouvert"); overlay.classList.add("visible"); document.body.style.overflow = "hidden"; };
  const fermer = () => { drawer.classList.remove("ouvert"); overlay.classList.remove("visible"); document.body.style.overflow = ""; };

  btnOuvrir?.addEventListener("click", ouvrir);
  btnFermer?.addEventListener("click", fermer);
  overlay?.addEventListener("click", fermer);
  drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", fermer));
}

/* Doit rester identique à ADMIN_EMAIL dans admin.js */
const ADMIN_EMAIL = "malagagabon@gmail.com";

/* ══════════ ÉTAT DE CONNEXION → AVATAR, DRAWER, BARRE BASSE ══════════ */
function initAuthUI() {
  onAuthStateChanged(auth, async (user) => {
    const avatar = document.getElementById("btnCompte");
    const drawerConnexion = document.getElementById("drawerConnexion");
    const drawerProprio = document.getElementById("drawerProprio");
    const drawerAdmin = document.getElementById("drawerAdmin");
    const bnProfilLabel = document.getElementById("bnProfilLabel");
    const bnProfilLien = document.getElementById("bnProfil");

    if (!user) {
      if (avatar) { avatar.textContent = "👤"; avatar.href = "connexion.html"; avatar.classList.remove("avatar-initiales"); }
      if (drawerConnexion) { drawerConnexion.textContent = "👤 Se connecter"; drawerConnexion.href = "connexion.html"; }
      if (drawerProprio) drawerProprio.style.display = "none";
      if (drawerAdmin) drawerAdmin.style.display = "none";
      if (bnProfilLabel) bnProfilLabel.textContent = "Profil";
      if (bnProfilLien) bnProfilLien.href = "connexion.html";
      return;
    }

    migrerLikesAnonymesVersUid(user.uid);

    const profil = await getProfil(user.uid);
    const nom = profil?.nom || "Mon compte";
    if (avatar) {
      if (profil?.photoURL) {
        avatar.innerHTML = `<img src="${escapeHTML(profil.photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        avatar.classList.remove("avatar-initiales");
      } else {
        avatar.textContent = initiales(nom);
        avatar.classList.add("avatar-initiales");
      }
      avatar.href = "profil.html";
    }
    if (drawerConnexion) { drawerConnexion.textContent = "🚪 Se déconnecter"; drawerConnexion.href = "#"; drawerConnexion.onclick = (e) => { e.preventDefault(); signOut(auth); }; }
    if (drawerProprio) drawerProprio.style.display = profil?.role === "proprietaire" ? "block" : "none";
    if (drawerAdmin) drawerAdmin.style.display = user.email === ADMIN_EMAIL ? "block" : "none";
    if (bnProfilLabel) bnProfilLabel.textContent = nom.split(" ")[0];
    if (bnProfilLien) bnProfilLien.href = "profil.html";
  });
}

/* ══════════ FLÈCHES DE SCROLL (haut / bas) — discrètes, dynamiques, sur toute l'app ══════════ */
function initScrollNav() {
  if (document.getElementById("scrollNav")) return;

  const nav = document.createElement("div");
  nav.className = "scroll-nav";
  nav.id = "scrollNav";
  nav.innerHTML = `
    <button type="button" class="scroll-btn" id="scrollHaut" aria-label="Remonter en haut">▲</button>
    <button type="button" class="scroll-btn" id="scrollBas" aria-label="Aller en bas">▼</button>
  `;
  document.body.appendChild(nav);

  const btnHaut = document.getElementById("scrollHaut");
  const btnBas = document.getElementById("scrollBas");

  const majVisibilite = () => {
    const y = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const prochePied = maxScroll - y < 80;

    // Flèche du haut : visible seulement après un léger scroll vers le bas
    btnHaut.classList.toggle("visible", y > 220);
    // Flèche du bas : visible tant qu'on n'a pas atteint (presque) le bas de page
    btnBas.classList.toggle("visible", maxScroll > 220 && !prochePied);
  };

  btnHaut.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  btnBas.addEventListener("click", () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));

  window.addEventListener("scroll", majVisibilite, { passive: true });
  window.addEventListener("resize", majVisibilite);
  majVisibilite();
}

/* ══════════ OUVERTURE DIRECTE D'UNE FICHE ANNONCE (lien partagé) ══════════
   Corrige l'anomalie : les cartes "like reçu" / "demande de visite reçue" de
   profil.html ne menaient jamais à l'annonce elle-même. Elles pointent
   désormais vers "index.html?annonce=ID" ; au chargement de index.html, si ce
   paramètre est présent, on récupère l'annonce dans Firestore et on l'affiche
   directement dans la modale de détail existante (#detailModal/#detailPanneau),
   sans attendre que l'utilisateur la retrouve lui-même dans la liste/carte.
   Best-effort : ne bloque jamais l'affichage du reste du site en cas d'échec. */
function injecterStylesFicheAnnoncePartagee() {
  if (document.getElementById("styleFichePartagee")) return;
  const style = document.createElement("style");
  style.id = "styleFichePartagee";
  style.textContent = `
    .fiche-partagee{padding:20px;max-width:520px;}
    .fiche-partagee .fp-fermer{position:absolute;top:14px;right:14px;background:rgba(0,0,0,.08);border:none;
      width:32px;height:32px;border-radius:50%;font-size:15px;cursor:pointer;}
    .fiche-partagee .fp-photo{width:100%;height:200px;object-fit:cover;border-radius:12px;margin-bottom:14px;background:var(--gris-fond,#f2f2f2);}
    .fiche-partagee h2{font-size:17px;font-weight:800;margin-bottom:6px;}
    .fiche-partagee .fp-prix{font-size:16px;font-weight:800;color:var(--vert,#009E60);margin-bottom:4px;}
    .fiche-partagee .fp-meta{font-size:12.5px;color:var(--gris-clair,#777);margin-bottom:12px;}
    .fiche-partagee .fp-desc{font-size:13.5px;line-height:1.5;color:#333;margin-bottom:16px;white-space:pre-line;}
  `;
  document.head.appendChild(style);
}

async function afficherFicheAnnoncePartagee(id) {
  const modal = document.getElementById("detailModal");
  const panneau = document.getElementById("detailPanneau");
  if (!modal || !panneau || !db) return;

  injecterStylesFicheAnnoncePartagee();
  panneau.innerHTML = `<div class="fiche-partagee"><div class="spinner">Chargement de l'annonce…</div></div>`;
  modal.classList.add("ouverte");

  try {
    const snap = await getDoc(doc(db, "annonces", id));
    if (!snap.exists()) {
      panneau.innerHTML = `<div class="fiche-partagee"><button type="button" class="fp-fermer" id="fpFermer">✕</button><p>Cette annonce n'est plus disponible.</p></div>`;
    } else {
      const a = snap.data();
      const meta = [a.quartier, a.commune, a.statut === "occupe" ? "🔴 Occupé" : "🟢 Disponible"].filter(Boolean).join(" · ");
      panneau.innerHTML = `
        <div class="fiche-partagee">
          <button type="button" class="fp-fermer" id="fpFermer">✕</button>
          ${a.photos?.[0] ? `<img src="${escapeHTML(a.photos[0])}" alt="" class="fp-photo">` : ""}
          <h2>${escapeHTML(a.titre || "Annonce")}</h2>
          <div class="fp-prix">${formatPrix ? formatPrix(a.prix) : a.prix}</div>
          <div class="fp-meta">📍 ${escapeHTML(meta)}</div>
          ${a.description ? `<div class="fp-desc">${escapeHTML(a.description)}</div>` : ""}
        </div>`;
    }
  } catch (err) {
    console.error("Impossible de charger l'annonce partagée :", err);
    panneau.innerHTML = `<div class="fiche-partagee"><button type="button" class="fp-fermer" id="fpFermer">✕</button><p>Impossible de charger cette annonce pour le moment.</p></div>`;
  }

  const fermer = () => modal.classList.remove("ouverte");
  panneau.querySelector("#fpFermer")?.addEventListener("click", fermer);
  modal.addEventListener("click", (e) => { if (e.target === modal) fermer(); }, { once: true });
}

function initOuvertureAnnoncePartagee() {
  const id = new URLSearchParams(location.search).get("annonce");
  if (id) afficherFicheAnnoncePartagee(id);
}

/* ══════════ INITIALISATION GÉNÉRALE ══════════
   Chaque fonction d'init est isolée dans son propre try/catch : une erreur
   dans l'une (ex. initAuthUI si Firebase répond mal) ne doit plus jamais
   empêcher silencieusement les suivantes (ex. initTheme) de s'exécuter. */
function initSansBloquer(fn, nom) {
  try { fn(); }
  catch (err) { console.error(`Initialisation "${nom}" impossible :`, err); }
}

document.addEventListener("DOMContentLoaded", () => {
  initSansBloquer(initLangue, "initLangue");
  initSansBloquer(initDrawer, "initDrawer");
  initSansBloquer(initAuthUI, "initAuthUI");
  initSansBloquer(majBadgeFavoris, "majBadgeFavoris");
  initSansBloquer(initScrollNav, "initScrollNav");
  initSansBloquer(initNotificationsLikesVus, "initNotificationsLikesVus");
  initSansBloquer(initDrawerNotifs, "initDrawerNotifs");
  initSansBloquer(initEcouteNotificationsGlobales, "initEcouteNotificationsGlobales");
  initSansBloquer(initOuvertureAnnoncePartagee, "initOuvertureAnnoncePartagee");

  // Marque l'onglet actif de la barre basse selon la page courante
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".bn-item[data-page]").forEach(el => {
    el.classList.toggle("actif", el.dataset.page === page);
  });
});
