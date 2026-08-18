/* ═══════════════════════════════════════════════════════════
   MALAGA — Données de référence géographiques
   Communes, arrondissements et quartiers réels de l'agglomération
   de Libreville, compilés à partir de sources officielles
   (Journal Officiel gabonais — répartition des sièges électoraux 2018)
   et de sources municipales publiques.
═══════════════════════════════════════════════════════════ */

// Les 3 communes de l'agglomération couvertes au lancement
export const COMMUNES = ["Libreville", "Akanda", "Owendo"];

export const ARRONDISSEMENTS = {
  "Libreville": [
    "1er arrondissement", "2e arrondissement", "3e arrondissement",
    "4e arrondissement", "5e arrondissement", "6e arrondissement"
  ],
  "Akanda": ["1er arrondissement", "2e arrondissement"],
  "Owendo": ["1er arrondissement", "2e arrondissement"]
};

// Quartiers réels par commune + arrondissement (clé : "Commune|Arrondissement")
export const QUARTIERS = {
  "Libreville|1er arrondissement": [
    "Aéroport", "Okala Sud", "Mikolongo", "Alibandeng", "Camp de Gaulle", "Tahiti",
    "Ambowé", "Charbonnages", "Cité de la Démocratie", "Lac Bleu", "Diba-Diba",
    "Ondogo", "Bel-Air", "Gué-Gué", "Bas de Gué-Gué", "Haut de Gué-Gué", "Ongongo",
    "Kalikak", "Camp des Boys", "Derrière la Prison", "Cité Pompidou",
    "Gros-Bouquet I", "Gros-Bouquet II", "Trois-Quartiers", "Batterie IV",
    "Quaben", "Louis", "Jeanne Ebori", "Plaine-Orety"
  ],
  "Libreville|2e arrondissement": [
    "Université Omar Bongo", "Plaine Orety", "Saint-Nicolas", "Pont Deemin",
    "Camp Boirot", "Derrière Mbolo", "Port-Môle", "Vallée Sainte-Marie",
    "Archevêché", "Jean-Paul II", "Bessieux", "Hôtel de Ville", "Fonction Publique",
    "Cocotiers", "Atong-Abé", "Nkembo Messanza", "Nkembo Marché", "La Campagne",
    "Sotega", "Sociga", "Avéa", "Atsib-Ntsos", "IUSO", "Cité de la Caisse",
    "Cité Mébiame", "Rio Cuvette"
  ],
  "Libreville|3e arrondissement": [
    "Sorbonne", "Mont-Bouet", "Sainte-Anne", "Akémindjogoni", "Abénélang",
    "Cinq Palmiers", "Carrefour Hassan", "Présidence", "CHUL", "Avenue de Cointet",
    "Derrière l'Hôpital", "Montagne Sainte", "Petit-Paris", "Peyrie Dakar",
    "Akébé-Ville", "Nombakélé-Nord", "Stade Omnisports", "STFO", "Venez-Voir",
    "Likouala", "Akébé Plaine", "La Peyrie", "Belle-Vue", "Belle-Vue II",
    "Kinguélé I", "Kinguélé II", "Plein Ciel", "Akébé Frontière", "PK5", "PK6",
    "PK7", "PK8"
  ],
  "Libreville|4e arrondissement": [
    "Ambilambani", "Baraka", "Carrefour Boulingui", "Camp Baraka", "Plaine Niger",
    "Awendjé", "Poste Centrale", "Hollando", "BICIG Centre", "Waterman",
    "Chambre de Commerce", "Saint-Benoît", "Nombakélé-Sud", "Batavéa", "London",
    "Saint-Michel", "Toulon", "Baraka Mission", "Glass"
  ],
  "Libreville|5e arrondissement": [
    "Plein-Ciel", "Cité Damas", "Bisségué", "Beau-Séjour", "Terre Nouvelle",
    "FOPI", "Mindoubé I", "Mindoubé II", "IAI", "Golf", "Ozangué", "Melen ENA",
    "Nzeng-Miang", "PK10", "PK11", "PK12", "Bizango-Rail", "Lalala", "ACAE",
    "SODUCO", "Zone Industrielle d'Oloumi", "INJS"
  ],
  "Libreville|6e arrondissement": [
    "Ondogo 2", "Montalier", "PK9", "PK10", "PK11", "Derrière l'Hôpital Militaire",
    "Melen", "Oveng", "Bambouchine", "Akougbe", "Sibang-Nkol-Ogoum",
    "Sibang-Arboretum", "Adzébé-Sibang", "Marché-Bananes", "Nzeng-Ayong"
  ],
  "Akanda|1er arrondissement": [
    "Marseille", "Mveng-Ayong", "1er Campement", "Makwengue", "Iyalala",
    "Malibé 1", "Malibé 2", "Santa-Clara", "Bolokobouet", "Cap Estérias",
    "Gabaga", "Île Mbanié", "Beau-Lieu"
  ],
  "Akanda|2e arrondissement": [
    "Sablière", "Avormbam", "Cité Amissa", "Angondjé", "Cap Caravane", "Okala",
    "Delta Postal", "Entraco"
  ],
  "Owendo|1er arrondissement": [
    "Akournam 1", "Cité SNI", "Cité OCTRA", "Agoungou", "Service Civique",
    "Alénakiri", "Owendo Port", "Virié"
  ],
  "Owendo|2e arrondissement": [
    "Akournam 2", "Igoumié", "Mbila-Nyambi", "Pointe Claire", "Île Coniquet",
    "Cité COMILOG"
  ]
};

export function getQuartiers(commune, arrondissement) {
  return QUARTIERS[`${commune}|${arrondissement}`] || [];
}

// Centres approximatifs pour recentrer la carte selon la sélection
export const CENTRES = {
  "Libreville": { lat: 0.3924, lng: 9.4536, zoom: 12 },
  "Akanda": { lat: 0.4870, lng: 9.4290, zoom: 13 },
  "Owendo": { lat: 0.2870, lng: 9.5010, zoom: 13 }
};

export const TYPES_BIEN = [
  "Maison", "Appartement", "Studio", "Chambre", "Villa", "Bureau", "Local commercial", "Box"
];

/* Types de biens "à vivre" (habitation), pour lesquels les champs chambres / salons /
   cuisine / douche ont un sens. Les biens commerciaux ou de stockage (Bureau, Local
   commercial, Box) n'affichent pas ces champs — ils ont leurs propres notions de
   pièces (bureaux, surface de vente, box de stockage...). */
export const TYPES_RESIDENTIELS = ["Maison", "Appartement", "Studio", "Chambre", "Villa"];
export function estResidentiel(type) {
  return TYPES_RESIDENTIELS.includes(type);
}

export const EQUIPEMENTS = [
  "Meublé", "Climatisé", "Clôturé", "Parking", "Jardin", "Piscine",
  "Fibre optique", "Groupe électrogène", "Forage", "Gardiennage", "Interphone"
];

/* ═══════════════════════════════════════════════════════════
   COMPTES PROFESSIONNELS (agences / entreprises)
═══════════════════════════════════════════════════════════ */
export const TYPES_ENTREPRISE = ["Agence immobilière", "Société privée"];

export const STATUTS_ENTREPRISE = {
  attente: { label: "⏳ En attente de vérification", badge: "badge-yellow" },
  verifie: { label: "✅ Vérifié", badge: "badge-green" },
  suspendu: { label: "⛔ Suspendu", badge: "badge-red" }
};

export const EAU_OPTIONS = ["SEEG (réseau)", "Forage", "Aucune"];
export const ELECTRICITE_OPTIONS = ["SEEG (réseau)", "Groupe électrogène", "Aucune"];
export const COMPTEUR_OPTIONS = ["Individuel", "Commun"];
export const ETAT_BATIMENT = ["Neuf", "Bon état", "À rénover"];

/* ═══════════════════════════════════════════════════════════
   RECHERCHE AVANCÉE — Construction, finitions & zonage
   Ajouté pour le filtre avancé (public + admin). Ces listes
   restent volontairement courtes et fermées pour que le filtre
   reste fiable (données cohérentes en base) ; un champ "Autre"
   avec saisie libre est prévu là où le terrain l'exige.
═══════════════════════════════════════════════════════════ */

// Nature du zonage / caractère du secteur (en plus du quartier administratif)
export const ZONES_CARACTERE = [
  "Résidentiel calme", "Centre-ville", "Bord de mer / lagune", "Axe principal",
  "Zone commerciale", "Zone industrielle", "Périphérie / semi-rural"
];

// Matériau principal de construction
export const MATERIAUX = ["Dur (parpaing / béton)", "Bois", "Semi-dur", "Autre"];

// Cuisine et douche : implantation par rapport au bâtiment principal
export const CUISINE_TYPES = ["Interne", "Externe"];
export const DOUCHE_TYPES = ["Interne", "Externe"];

// Couleurs de peinture murale les plus courantes sur le marché locatif de Libreville
export const COULEURS_MURALES = [
  "Blanc", "Crème / Ivoire", "Beige", "Gris", "Bleu ciel", "Vert", "Jaune",
  "Saumon / Rose", "Marron / Terracotta", "Autre"
];

// Options binaires affichées en toggle Oui / Non / Indifférent (formulaires + filtre)
export const OPTIONS_OUI_NON = ["Oui", "Non"];

/* ═══════════════════════════════════════════════════════════
   DÉTAILS ENRICHIS — repérage précis du logement
   Utile surtout pour les agences/entreprises qui gèrent plusieurs
   biens dans un même immeuble ou une même résidence (numéro de
   villa/porte, étage, vue). Restent optionnels pour un particulier
   qui loue un bien unique.
═══════════════════════════════════════════════════════════ */

// Vue depuis le logement — valorise les biens en hauteur ou bord de mer/forêt
export const VUES = [
  "Non précisé", "Vue mer", "Vue lagune", "Vue forêt", "Vue jardin",
  "Vue sur la ville", "Vue dégagée", "Vue cour intérieure"
];

// Étage — jusqu'au 20e, avec rez-de-chaussée et sous-sol en options spéciales
export const ETAGES = [
  "Non précisé", "Rez-de-chaussée", "Sous-sol",
  ...Array.from({ length: 20 }, (_, i) => `${i + 1}${i === 0 ? "er" : "e"} étage`)
];

// Paliers utilisés par les sélecteurs "au moins N" du filtre avancé (chambres, salons, douches)
export const PALIERS_PIECES = [1, 2, 3, 4, 5];

// Centre par défaut de la carte au chargement (agglomération de Libreville)
export const LIBREVILLE_CENTER = { lat: 0.3924, lng: 9.4536 };

/* Badge "vendeur" affiché sur les annonces : distingue les biens publiés par une
   agence/entreprise (avec ou sans vérification admin) de ceux publiés par un
   particulier. Les infos sont dénormalisées sur l'annonce à la publication
   (voir publier.html) pour éviter une lecture supplémentaire par carte affichée. */
export function getBadgeVendeur(annonce) {
  if (annonce.proprietaireCompteType !== "entreprise") {
    return { texte: "🏠 Particulier", classe: "badge-vendeur-particulier" };
  }
  return annonce.proprietaireStatutEntreprise === "verifie"
    ? { texte: "🏢 Agence vérifiée", classe: "badge-vendeur-verifie" }
    : { texte: "🏢 Agence / Entreprise", classe: "badge-vendeur-entreprise" };
}

export function getIconeType(type) {
  const icons = {
    Villa: "🏡", Appartement: "🏢", Studio: "🛏️", Maison: "🏠",
    Chambre: "🚪", Bureau: "🏗️", "Local commercial": "🏪", Box: "📦"
  };
  return icons[type] || "🏠";
}

export function formatPrix(prix) {
  return Number(prix).toLocaleString("fr-FR") + " FCFA/mois";
}

/* ══════════ SÉCURITÉ : échappement HTML ══════════
   Empêche l'injection de code (XSS) via des données saisies par les
   utilisateurs (titre d'annonce, quartier, message...) puis affichées
   avec innerHTML. À utiliser sur TOUTE valeur d'origine utilisateur
   avant de l'insérer dans un template HTML. */
export function escapeHTML(valeur) {
  const div = document.createElement("div");
  div.textContent = valeur === undefined || valeur === null ? "" : String(valeur);
  return div.innerHTML;
}
