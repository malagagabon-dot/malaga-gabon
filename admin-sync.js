(function(){
var ADMIN='malagagabon@gmail.com',busy=false,REF=null,d=document;
function n(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function el(t,c,x){var e=d.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function avatar(type){
  var t=n(type),bed=t==='chambre';
  var col=(t==='studio'||bed)?['#e6f6ea','#1f7a43']:(t==='maison'||t==='villa')?['#e8f1fb','#1f5fa8']:['#fdf0e0','#a85f12'];
  var art=bed?'<rect x="16" y="46" width="68" height="24" rx="4"/><path d="M16 70v8M84 70v8M16 46V30h24v16M60 46h24"/>':'<path d="M14 52L50 22l36 30v32H14z"/><path d="M42 84V62h16v22"/>';
  var s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="'+col[0]+'"/><g fill="'+col[0]+'" stroke="'+col[1]+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'+art+'</g></svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
}
function wa(list){for(var i=0;i<list.length;i++){var g=String(list[i]).replace(/\D/g,'');if(g.length===9&&g.charAt(0)==='0'){return '+241 '+g.slice(1).replace(/(\d{2})(?=\d)/g,'$1 ');}}return '';}
function names(arr){return (arr||[]).map(function(x){return typeof x==='string'?x:(x&&(x.value||x.nom||x.label))||'';}).filter(Boolean);}
function locate(hint){
  var h=n(hint).replace(/\d+/g,'').trim();if(!h)return null;
  var cm=names(REF.COMMUNES).filter(function(c){return n(c)===h;});if(cm.length)return {commune:cm[0],arr:''};
  var found=[];
  Object.keys(REF.QUARTIERS||{}).forEach(function(k){(REF.QUARTIERS[k]||[]).forEach(function(q){var nq=n(q);if(nq===h||(nq.length>3&&nq.indexOf(h)===0)){if(found.indexOf(k)<0)found.push(k);}});});
  if(found.length===1){var p=found[0].split('|');return {commune:p[0],arr:p[1]};}
  return null;
}
var st=d.createElement('style');
st.textContent='#mg-sync{display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:14px;background:#e7f4ee;border:1px solid #cfe5d8;border-radius:12px}#mg-sync button{flex:none;border:0;border-radius:10px;background:#16a34a;color:#fff;font-weight:700;padding:11px 14px;font-size:.95rem;cursor:pointer}#mg-sync button:disabled{opacity:.6}#mg-sync span{flex:1;font-size:.85rem;color:#2b4a3a}.mg-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:10px}.mg-box{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;color:#222}.mg-box h3{margin:0;padding:14px 14px 4px}.mg-p{margin:0;padding:0 14px 8px;font-size:.85rem;color:#555}.mg-list{overflow:auto;padding:0 14px;flex:1}.mg-row{border-top:1px solid #eee;padding:10px 0}.mg-t{display:flex;gap:8px;align-items:flex-start;font-size:.9rem}.mg-f{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}.mg-f select,.mg-f input{padding:8px;border:1px solid #ccc;border-radius:8px;font-size:.85rem;width:100%;box-sizing:border-box}.mg-ft{display:flex;gap:8px;align-items:center;padding:12px 14px;border-top:1px solid #eee}.mg-ft span{flex:1;font-size:.8rem;color:#b00}.mg-ft button{border:0;border-radius:10px;padding:11px 14px;font-weight:700;cursor:pointer}.mg-ok{background:#16a34a;color:#fff}.mg-no{background:#eee}';
d.head.appendChild(st);
function sel(opts,val,ph){var s=el('select');s.append(new Option(ph||'— choisir —',''));names(opts).forEach(function(o){s.append(new Option(o,o));});s.value=val||'';if(s.value!==(val||''))s.value='';return s;}
function fillArr(sc,sa,val){var cur=val||sa.value;sa.replaceChildren(new Option('Arrondissement',''));names((REF.ARRONDISSEMENTS||{})[sc.value]||[]).forEach(function(o){sa.append(new Option(o,o));});sa.value=cur;if(sa.value!==cur)sa.value='';}
function matchType(g){var l=names(REF.TYPES_BIEN).filter(function(t){return n(t)===n(g);});return l[0]||'';}
function review(fresh,u,s){
  var ov=el('div','mg-ov'),box=el('div','mg-box'),list=el('div','mg-list'),rows=[];
  box.append(el('h3','',fresh.length+' nouvelle(s) annonce(s)'),el('p','mg-p','Vérifiez commune, arrondissement et type : une annonce incomplète reste décochée.'),list);
  fresh.forEach(function(a){
    var loc=locate(a.quartier_hint)||{},row=el('div','mg-row'),lab=el('label','mg-t'),cb=d.createElement('input');cb.type='checkbox';
    lab.append(cb,el('b','',a.titre+' — '+a.prix_texte));
    var f=el('div','mg-f'),sc=sel(REF.COMMUNES,loc.commune||'','Commune'),sa=el('select'),sty=sel(REF.TYPES_BIEN,matchType(a.type_guess),'Type'),qi=d.createElement('input');
    qi.placeholder='Quartier';qi.value=a.quartier_hint||'';
    fillArr(sc,sa,loc.arr||'');
    function chk(){var ok=!!(sc.value&&sa.value&&sty.value);cb.disabled=!ok;if(!ok)cb.checked=false;}
    sc.onchange=function(){fillArr(sc,sa,'');chk();};sa.onchange=chk;sty.onchange=chk;
    f.append(sc,sa,sty,qi);row.append(lab,f);list.append(row);
    chk();if(!cb.disabled)cb.checked=true;
    rows.push({a:a,cb:cb,sc:sc,sa:sa,sty:sty,qi:qi});
  });
  var ft=el('div','mg-ft'),msg=el('span'),no=el('button','mg-no','Annuler'),add=el('button','mg-ok','Ajouter');
  no.onclick=function(){ov.remove();};
  add.onclick=async function(){
    var picked=rows.filter(function(r){return r.cb.checked;});
    if(!picked.length){msg.textContent='Cochez au moins une annonce.';return;}
    add.disabled=true;msg.textContent='';
    try{
      var db=window.dbAdmin,batch=db.batch(),ts=firebase.firestore.FieldValue.serverTimestamp();
      picked.forEach(function(r){
        var a=r.a,type=r.sty.value,res=REF.estResidentiel?REF.estResidentiel(type):false;
        batch.set(db.collection('annonces').doc(),{
          proprietaireId:u.uid,proprietaireNom:'MALAGA',proprietaireTel:a.contact[0],proprietaireEmail:ADMIN,
          proprietaireCompteType:'particulier',proprietaireRaisonSociale:'',proprietaireLogoUrl:'',proprietaireStatutEntreprise:'',
          whatsapp:wa(a.contact),titre:a.titre,type:type,prix:a.prix,description:a.description,
          commune:r.sc.value,arrondissement:r.sa.value,quartier:r.qi.value.trim(),pointRepere:'',zoneCaractere:'',
          lat:null,lng:null,surface:null,
          chambres:res?(a.chambres||null):null,salons:null,sdb:null,douches:null,cuisineType:'',doucheType:'',
          etat:'Bon état',numeroBien:'',etage:'',vue:'',cloture:!!a.cloture,materiau:'',terrasse:!!a.terrasse,carreaux:false,couleurMurale:'',
          eau:'',electricite:'',compteur:'',equipements:[],moyensPaiement:[],
          uniteTarif:'mois',capacitePersonnes:null,typeLit:'',nbChambresCategorie:null,
          photos:[avatar(type)],video:'',statut:'disponible',vues:0,dateCreation:ts,dateModification:ts});
      });
      await batch.commit();
      s.textContent='✅ '+picked.length+' annonce(s) ajoutée(s).';ov.remove();
    }catch(e){msg.textContent='⚠️ '+((e&&(e.code||e.message))||e);add.disabled=false;}
  };
  ft.append(msg,no,add);box.append(ft);ov.append(box);d.body.append(ov);
}
async function run(b,s){
  if(busy)return;busy=true;b.disabled=true;b.textContent='⏳ Lecture…';
  try{
    var u=window.firebase&&firebase.auth&&firebase.auth().currentUser;
    if(!u||String(u.email).toLowerCase()!==ADMIN)throw new Error('Connectez-vous avec le compte admin');
    if(!window.dbAdmin)throw new Error('Base non prête, réessayez');
    REF=REF||await import('./malaga-reference.js');
    var r=await fetch('annonces-malaga.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('Fichier annonces introuvable ('+r.status+')');
    var list=await r.json();
    var q=await window.dbAdmin.collection('annonces').where('proprietaireId','==',u.uid).get();
    var have=q.docs.map(function(x){return x.data();});
    var fresh=list.filter(function(a){return a&&a.titre&&a.contact&&a.contact.length&&!have.some(function(h){return h.titre===a.titre&&String(h.description||'').indexOf(a.contact[0])>-1;});});
    if(!fresh.length){s.textContent='✅ Déjà à jour ('+list.length+' annonces présentes).';return;}
    s.textContent='';review(fresh,u,s);
  }catch(e){s.textContent='⚠️ '+((e&&(e.message||e.code))||e);}
  finally{busy=false;b.disabled=false;b.textContent='🔄 Synchroniser les annonces';}
}
function inject(){
  var p=d.getElementById('page-annonces');if(!p||d.getElementById('mg-sync'))return;
  var w=el('div');w.id='mg-sync';var b=el('button','','🔄 Synchroniser les annonces');b.type='button';
  var s=el('span','','Ajoute les nouvelles locations du fichier, sans doublons.');
  b.onclick=function(){run(b,s);};w.append(b,s);p.insertBefore(w,p.firstChild);
}
inject();setTimeout(inject,1500);setTimeout(inject,4000);
})();
