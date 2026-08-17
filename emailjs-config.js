/* ═══════════════════════════════════════════
   MALAGA — emailjs-config.js
   Initialisation d'EmailJS (envoi d'emails depuis le navigateur,
   sans serveur) + window.MALAGA_EMAIL.envoyerEmail(label, params),
   utilisé par contact-signalement.js (messages, signalements) et
   publier.html (notification de nouvelle annonce).

   Chargé en script classique (pas de type="module") AVANT les
   scripts modules (nav.js, app.js, contact-signalement.js...),
   donc window.MALAGA_EMAIL est déjà disponible quand ces derniers
   s'exécutent.

   Un seul template EmailJS ("Contact Us", champs nom/tel/sujet/
   message) est utilisé pour toutes les notifications : le premier
   argument sert de sujet par défaut, et les champs additionnels de
   params sont mis en forme dans le corps du message.
═══════════════════════════════════════════ */

(function () {
  const EMAILJS_SERVICE_ID = "service_zfc6lnr";
  const EMAILJS_TEMPLATE_ID = "template_bwgmgot";
  const EMAILJS_PUBLIC_KEY = "YetOFNIJMn9KOljxi";

  if (typeof emailjs === "undefined") {
    console.error("EmailJS n'a pas pu se charger (vérifier la balise <script> du CDN).");
    window.MALAGA_EMAIL = { envoyerEmail: () => {} };
    return;
  }

  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

  /* ══════════ Envoi d'une notification email à l'administrateur ══════════
     Best-effort : n'empêche jamais le fonctionnement du site si ça échoue
     (pas de blocage, pas d'erreur visible pour l'utilisateur). L'écriture
     dans Firestore reste la source de vérité, vue en temps réel dans le
     panneau admin — l'email n'est qu'un avertissement en plus.

     - label  : texte court décrivant l'événement (ex. "Nouveau message",
                "Nouvelle annonce publiée"), utilisé comme sujet par défaut.
     - params : objet libre. Les clés nom/tel/sujet/message sont utilisées
                telles quelles si présentes ; toutes les autres clés sont
                automatiquement mises en forme dans le corps de l'email. */
  window.MALAGA_EMAIL = {
    envoyerEmail(label, params = {}) {
      const nom = params.nom || params.proprietaire || params.signalePar || "MALAGA";
      const tel = params.tel || params.telephone || "—";
      const sujet = params.sujet || `MALAGA — ${label || "Notification"}`;
      const message = params.message || Object.entries(params)
        .filter(([cle]) => !["nom", "tel", "telephone", "sujet", "message"].includes(cle))
        .map(([cle, val]) => `${cle} : ${val ?? "—"}`)
        .join("\n");

      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { nom, tel, sujet, message })
        .then(() => console.log("Notification email envoyée."))
        .catch((err) => console.error("Échec de l'envoi de la notification email :", err));
    }
  };
})();
