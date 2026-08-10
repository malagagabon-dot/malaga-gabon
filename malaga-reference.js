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
  "Maison", "Appartement", "Studio", "Chambre", "Villa", "Bureau", "Local commercial"
];

export const EQUIPEMENTS = [
  "Meublé", "Climatisé", "Clôturé", "Parking", "Jardin", "Piscine",
  "Fibre optique", "Groupe électrogène", "Forage", "Gardiennage", "Interphone"
];

export const EAU_OPTIONS = ["SEEG (réseau)", "Forage", "Aucune"];
export const ELECTRICITE_OPTIONS = ["SEEG (réseau)", "Groupe électrogène", "Aucune"];
export const COMPTEUR_OPTIONS = ["Individuel", "Commun"];
export const ETAT_BATIMENT = ["Neuf", "Bon état", "À rénover"];

// Centre par défaut de la carte au chargement (agglomération de Libreville)
export const LIBREVILLE_CENTER = { lat: 0.3924, lng: 9.4536 };

export function getIconeType(type) {
  const icons = {
    Villa: "🏡", Appartement: "🏢", Studio: "🛏️", Maison: "🏠",
    Chambre: "🚪", Bureau: "🏗️", "Local commercial": "🏪"
  };
  return icons[type] || "🏠";
}

export function formatPrix(prix) {
  return Number(prix).toLocaleString("fr-FR") + " FCFA/mois";
}
