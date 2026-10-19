(function(){
var T='Image générique – non contractuelle';
var st=document.createElement('style');
st.textContent='.tm-gen{position:absolute;box-sizing:border-box;padding:4px 6px;font:600 11px/1.2 sans-serif;color:#fff;background:rgba(0,0,0,.62);text-align:center;pointer-events:none;z-index:5;display:none}';
document.head.appendChild(st);
function ok(i){return (i.getAttribute('src')||'').indexOf('/img/cat/')>-1;}
function place(i){
  var b=i.nextElementSibling;
  if(!(b&&b.classList&&b.classList.contains('tm-gen'))){
    b=document.createElement('div');b.className='tm-gen';b.textContent=T;
    i.insertAdjacentElement('afterend',b);
  }
  if(!i.offsetWidth||!i.offsetHeight){b.style.display='none';return;}
  b.style.display='block';
  b.style.left=i.offsetLeft+'px';
  b.style.width=i.offsetWidth+'px';
  b.style.top=(i.offsetTop+i.offsetHeight-b.offsetHeight)+'px';
}
function run(){
  var imgs=document.querySelectorAll('img');
  for(var k=0;k<imgs.length;k++){if(ok(imgs[k]))place(imgs[k]);}
  var bs=document.querySelectorAll('.tm-gen');
  for(var j=0;j<bs.length;j++){var p=bs[j].previousElementSibling;if(!(p&&p.tagName==='IMG'&&ok(p)))bs[j].remove();}
}
setInterval(run,600);
window.addEventListener('resize',run);
document.addEventListener('load',run,true);
run();
})();
