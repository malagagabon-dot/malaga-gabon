(function(){
if(window.__malagaGuide)return;window.__malagaGuide=true;
var isAdmin=/admin\.html/.test(location.pathname);
var isHome=!isAdmin&&/(\/|index\.html)$/.test(location.pathname);
var ROLES=[
{id:"cher",label:"🔍 Chercheur",intro:"Je cherche un logement à louer.",secs:[
{t:"✅ Ce que je peux faire",p:[
"Voir la carte et les annonces sans compte.",
"Filtrer par commune, arrondissement, type, budget, prix exact ou type d'annonceur (agence, société, particulier).",
"Voir les logements les plus proches avec « Près de chez moi ».",
"Garder mes annonces préférées en ❤️ Favoris.",
"Contacter le propriétaire par appel ou WhatsApp.",
"Réserver une visite gratuite.",
"Signaler une annonce suspecte."]},
{t:"⚠️ Ce que je dois faire",p:[
"Donner une date et une heure de visite réelles.",
"Rester poli et clair dans mes messages.",
"Signaler toute fausse annonce ou tout numéro frauduleux."]},
{t:"🔧 Comment faire",p:[
"Accueil : choisissez vos filtres puis regardez la carte ou la liste.",
"Touchez une annonce : photos pièce par pièce, prix, détails.",
"Touchez ❤️ pour la garder.",
"Touchez « Réserver une visite », choisissez la date et l'heure, puis envoyez par WhatsApp.",
"Menu ☰ → « Signaler un problème » en cas de doute."]},
{t:"⭐ Points importants",p:[
"Ne payez jamais avant d'avoir visité le logement.",
"Vérifiez le bien sur place avant de vous engager.",
"Les prix sont en FCFA par mois."]}]},
{id:"prop",label:"🏠 Propriétaire",intro:"Je publie et je gère mes logements (particulier, agence, société ou hôtelier).",secs:[
{t:"✅ Ce que je peux faire",p:[
"Publier des annonces de logements ou de services hôteliers.",
"Ajouter des photos par pièce : façade, salon, chambre, cuisine, douche, terrasse.",
"Choisir les moyens de paiement que j'accepte.",
"Modifier, masquer ou supprimer mes annonces.",
"Recevoir les demandes de visite sur WhatsApp."]},
{t:"⚠️ Ce que je dois faire",p:[
"Donner des informations exactes : prix, zone, caractéristiques.",
"Publier de vraies photos de mon bien.",
"Indiquer un numéro WhatsApp valide.",
"Répondre vite aux demandes de visite.",
"Masquer l'annonce dès que le bien est loué."]},
{t:"🔧 Comment faire",p:[
"Créez un compte avec le rôle « Propriétaire ».",
"Touchez ➕ puis remplissez le formulaire de publication.",
"Ajoutez les photos de chaque pièce puis publiez.",
"Suivez vos annonces dans « Gérer mes annonces ».",
"À chaque demande de visite, ouvrez le lien WhatsApp reçu pour accepter ou refuser.",
"Avec ce lien, vous pouvez aussi masquer l'annonce temporairement ou la supprimer."]},
{t:"⭐ Points importants",p:[
"Des photos réelles et un bon prix attirent plus de visites.",
"Une réponse rapide évite de perdre un locataire.",
"Un bien loué doit être masqué tout de suite pour garder la confiance."]}]},
{id:"admin",label:"🛠️ Admin",intro:"Je supervise la plateforme (accès réservé).",secs:[
{t:"✅ Ce que je peux faire",p:[
"Voir toutes les annonces et les filtrer.",
"Voir la visibilité de chaque annonce.",
"Masquer, réafficher ou supprimer une annonce.",
"Suivre les réponses des propriétaires et les demandes de visite."]},
{t:"⚠️ Ce que je dois faire",p:[
"Vérifier que les annonces sont vraies (pas de doublon, pas de faux numéro).",
"Traiter vite les signalements reçus.",
"Garder l'accès admin strictement confidentiel."]},
{t:"🔧 Comment faire",p:[
"Menu ☰ → « Panneau admin ».",
"Utilisez les filtres pour retrouver une annonce.",
"Lisez la colonne « Visibilité » : visible, masquée ou supprimée.",
"Utilisez les boutons d'action sur la ligne de l'annonce."]},
{t:"⭐ Points importants",p:[
"La suppression est définitive : vérifiez avant de confirmer.",
"Ne partagez jamais votre accès admin.",
"Une annonce douteuse se masque d'abord, elle se supprime ensuite."]}]}];
if(!isAdmin)ROLES=ROLES.filter(function(r){return r.id!=="admin"});
var css=".mg-g-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px}.mg-g-modal.on{display:flex}.mg-g-card{background:#1b2030;color:#fff;max-width:440px;width:100%;max-height:85vh;overflow:auto;border-radius:16px;padding:18px;border:1px solid #009E60}.mg-g-card h3{margin:0 0 12px;color:#35d08a;font-size:18px}.mg-g-card h4{margin:14px 0 6px;color:#ffd24d;font-size:14px}.mg-g-card ol{margin:0;padding-left:20px;line-height:1.5;font-size:14px}.mg-g-card li{margin-bottom:5px}.mg-g-x{float:right;background:#009E60;color:#fff;border:0;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer}.mg-g-tabs{display:flex;gap:6px;margin:0 0 12px}.mg-g-tab{flex:1;background:#2a3147;color:#fff;border:0;border-radius:10px;padding:8px 4px;font-size:12px;cursor:pointer}.mg-g-tab.on{background:#009E60;font-weight:700}.mg-g-intro{margin:0;color:#ccc;font-size:13px}.mg-g-toast{position:fixed;left:12px;right:12px;bottom:84px;z-index:99998;max-width:360px;margin:auto;background:#009E60;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.4);transition:opacity .4s,transform .4s;cursor:pointer;font-size:14px}.mg-g-toast.off{opacity:0;transform:translateY(10px)}.mg-g-toast b{flex:1}.mg-g-toast button{background:rgba(0,0,0,.25);color:#fff;border:0;border-radius:50%;width:26px;height:26px;cursor:pointer}.mg-g-fab{position:fixed;left:12px;bottom:16px;z-index:99997;background:#009E60;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer}";
var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
var modal,body,tabs;
function render(id){
var r=ROLES.filter(function(x){return x.id===id})[0]||ROLES[0];
tabs.innerHTML=ROLES.map(function(x){return "<button class='mg-g-tab"+(x.id===r.id?" on":"")+"' data-r='"+x.id+"'>"+x.label+"</button>"}).join("");
body.innerHTML="<p class='mg-g-intro'>"+r.intro+"</p>"+r.secs.map(function(s){return "<h4>"+s.t+"</h4><ol>"+s.p.map(function(x){return "<li>"+x+"</li>"}).join("")+"</ol>"}).join("");
modal.querySelector(".mg-g-card").scrollTop=0;}
function openGuide(){
if(!modal){modal=document.createElement("div");modal.className="mg-g-modal";
modal.innerHTML="<div class='mg-g-card'><button class='mg-g-x' aria-label='Fermer'>✕</button><h3>❓ Comment ça marche</h3><div class='mg-g-tabs'></div><div class='mg-g-body'></div></div>";
tabs=modal.querySelector(".mg-g-tabs");body=modal.querySelector(".mg-g-body");
modal.addEventListener("click",function(e){var t=e.target;
if(t===modal||t.className==="mg-g-x")modal.classList.remove("on");
else if(t.getAttribute&&t.getAttribute("data-r"))render(t.getAttribute("data-r"));});
document.body.appendChild(modal);}
render(isAdmin?"admin":"cher");modal.classList.add("on");}
function addMenu(){
if(document.getElementById("mgGuideMenu"))return;
var ref=[].slice.call(document.querySelectorAll("a")).filter(function(a){return /Paramètres/.test(a.textContent)&&(a.getAttribute("href")||"").indexOf("parametres")>-1})[0];
if(!ref)return;
var a=ref.cloneNode(false);a.removeAttribute("onclick");a.id="mgGuideMenu";a.setAttribute("href","#");a.textContent="❓ Comment ça marche";
a.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openGuide()});
ref.parentNode.insertBefore(a,ref.nextSibling);}
function toast(){
try{if(sessionStorage.getItem("mgGuideSeen"))return;sessionStorage.setItem("mgGuideSeen","1")}catch(e){}
var t=document.createElement("div");t.className="mg-g-toast";
t.innerHTML="<span>❓</span><b>Comment ça marche ?</b><button aria-label='Fermer'>✕</button>";
function hide(){t.classList.add("off");setTimeout(function(){t.remove()},500)}
t.addEventListener("click",function(e){if(e.target.tagName==="BUTTON"){hide()}else{hide();openGuide()}});
document.body.appendChild(t);setTimeout(hide,7000);}
function fab(){var b=document.createElement("button");b.className="mg-g-fab";b.textContent="❓ Comment ça marche";b.addEventListener("click",openGuide);document.body.appendChild(b);}
function init(){addMenu();var tm;new MutationObserver(function(){clearTimeout(tm);tm=setTimeout(addMenu,300)}).observe(document.body,{childList:true,subtree:true});
if(isAdmin)fab();if(isHome)setTimeout(toast,1500);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
