// grille-adaptive.js
// Rend la grille d'annonces de la page d'accueil "dynamique" :
// - plus il y a d'annonces, plus les tuiles se réduisent (comme un collage économique)
// - au-delà d'un certain nombre, la colonne liste passe en scroll interne
//   (sur bureau) au lieu d'étirer la hauteur de toute la page.
// Aucune dépendance : s'appuie uniquement sur le nombre d'enfants .carte-annonce
// présents dans #liste-annonces-grille, quel que soit le script qui les injecte.
(function () {
  const SEUIL_SCROLL_BUREAU = 9; // au-delà, la liste scrolle au lieu de pousser la page

  function ajusterGrille() {
    const grille = document.getElementById('liste-annonces-grille');
    if (!grille) return;

    const nb = grille.querySelectorAll('.carte-annonce').length;
    const estMobile = window.innerWidth <= 860;

    // Si l'utilisateur a choisi un mode d'affichage manuel (boutons Liste/Miniature/
    // Moyenne/Grande), on ne touche plus à --tile-min/--tile-img-h : c'est le mode
    // choisi (voir app.js → initVueModes) qui les définit via les classes CSS vue-*.
    if (grille.dataset.vueManuelle !== "1") {
      let tileMin, imgH;

      if (estMobile) {
        // Mobile : 2 colonnes dès que possible, tuiles plus compactes si beaucoup d'annonces
        tileMin = nb > 8 ? 128 : nb > 4 ? 140 : 155;
        imgH = nb > 8 ? 92 : nb > 4 ? 108 : 125;
      } else {
        if (nb <= 4)      { tileMin = 260; imgH = 170; }
        else if (nb <= 9) { tileMin = 220; imgH = 150; }
        else if (nb <= 16){ tileMin = 190; imgH = 130; }
        else              { tileMin = 165; imgH = 112; }
      }

      grille.style.setProperty('--tile-min', tileMin + 'px');
      grille.style.setProperty('--tile-img-h', imgH + 'px');
    }

    // Scroll interne uniquement sur bureau et seulement s'il y a vraiment beaucoup d'annonces
    // (reste actif quel que soit le mode d'affichage, sauf en mode "liste" où chaque ligne
    // est déjà compacte horizontalement et où on préfère laisser la page défiler normalement).
    const modeListe = grille.classList.contains('vue-liste');
    grille.classList.toggle('grille-scroll', !estMobile && !modeListe && nb > SEUIL_SCROLL_BUREAU);
  }

  const cible = document.getElementById('liste-annonces-grille');
  if (cible) {
    // Réagit dès que les annonces sont injectées dans le DOM (rendu async depuis Firebase)
    const observateur = new MutationObserver(ajusterGrille);
    observateur.observe(cible, { childList: true });
  }

  window.addEventListener('resize', ajusterGrille);
  document.addEventListener('DOMContentLoaded', ajusterGrille);
  window.addEventListener('load', ajusterGrille);
  // Filet de sécurité si le rendu des annonces prend un peu de temps
  setTimeout(ajusterGrille, 1200);
})();
