// ===== klassen in plaats van CSS :has() (werkt ook op oudere iPads) =====
function syncHas(){
  const b=document.body,vis=id=>{const e=$(id);return !!e&&!e.classList.contains('hide')};
  b.classList.toggle('scr-teacher',vis('teacher'));b.classList.toggle('scr-board',vis('board'));b.classList.toggle('scr-home',vis('home'));
  $('kid').classList.toggle('has-free',vis('kFree'));$('board').classList.toggle('has-morning',vis('bMorning'));
  document.querySelectorAll('.panel,.tab').forEach(el=>el.classList.toggle('has-open',!!el.querySelector('details.opt[open]')));
}
// oudere Safari (voor iOS 14.5) kent geen 'gap' bij flexbox: dan zetten we marges op de kinderen
const FLEXGAP=!/[?&]oud\b/.test(location.search)&&(()=>{const d=document.createElement('div');d.style.cssText='display:flex;flex-direction:column;row-gap:1px;position:absolute';d.append(document.createElement('div'),document.createElement('div'));document.body.append(d);const ok=d.scrollHeight===1;d.remove();return ok})();
function flexGapFix(){if(FLEXGAP)return;
  document.querySelectorAll('body *').forEach(el=>{const c=getComputedStyle(el);if(!/flex/.test(c.display))return;
    const cg=parseFloat(c.columnGap)||0,rg=parseFloat(c.rowGap)||0;if(!cg&&!rg)return;
    const col=/column/.test(c.flexDirection),wrap=c.flexWrap!=='nowrap';const kids=[...el.children].filter(k=>getComputedStyle(k).display!=='none'&&getComputedStyle(k).position!=='absolute');
    const free=(k,side)=>k.dataset.fg||parseFloat(getComputedStyle(k)[side])===0; // eigen marges (zoals 'auto') niet overschrijven
    kids.forEach((k,i)=>{if(col){if(free(k,'marginTop')){k.style.marginTop=i?rg+'px':'';k.dataset.fg=1}}
      else if(wrap){if(free(k,'marginRight')){k.style.marginRight=cg+'px';k.style.marginBottom=rg+'px';k.dataset.fg=1}}
      else if(free(k,'marginLeft')){k.style.marginLeft=i?cg+'px':'';k.dataset.fg=1}})})}
{let q=false;const run=()=>{q=false;syncHas();flexGapFix()};
  new MutationObserver(()=>{if(!q){q=true;(window.requestAnimationFrame||setTimeout)(run)}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','open']});
  document.addEventListener('toggle',()=>{syncHas();flexGapFix()},true);syncHas();flexGapFix()}
/* =================== tikken =================== */
setInterval(()=>{
  if(role==='kid'){manageWake();renderSoundTip()}
  if(!role)return;if(role==='kid'){const e=effState();if(e!==state){if(e.sid!==state.sid)rang=false;state=e}}render();renderMsg();
  if(role==='kid'&&mini&&!mini.rung&&mini.endAt<=Date.now()&&!getTicks().includes(mini.i)){mini.rung=true;saveMini();if(state.sound!==false)chime(true)}
},500);
setInterval(()=>{T&&T.tick();T&&T.count()},10000);
setInterval(autoCheck,5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(role==='kid')keepAwake();T&&T.wake();autoCheck()}});

/* =================== start =================== */
$('btnKid').addEventListener('click',()=>{$('homeChoose').classList.add('hide');$('homeKid').classList.remove('hide');$('codeIn').focus()});
$('btnBack').addEventListener('click',()=>{$('homeKid').classList.add('hide');$('homeChoose').classList.remove('hide')});
$('btnTeacher').addEventListener('click',startTeacher);
const join=()=>{const c=$('codeIn').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!validCode(c)){$('codeErr').textContent='Die code klopt niet. Een klascode heeft 6 tekens.';return}unlockAudio();startKid(c)};
$('btnJoin').addEventListener('click',join);
$('codeIn').addEventListener('keydown',e=>{if(e.key==='Enter')join()});
let leaveT=null;
const leaveCancel=()=>{clearTimeout(leaveT);leaveT=null;$('kLeave').classList.remove('holding')};
$('kLeave').addEventListener('pointerdown',()=>{$('kLeave').classList.add('holding');leaveT=setTimeout(()=>{leaveCancel();doLeave()},3000)});
['pointerup','pointerleave','pointercancel'].forEach(ev=>$('kLeave').addEventListener(ev,()=>{if(leaveT){leaveCancel();$('kLeave').textContent='Houd 3 sec ingedrukt';setTimeout(()=>$('kLeave').textContent='Andere code',2000)}}));
const doLeave=async()=>{if(!await ask({title:'Andere klascode invoeren?',text:'Deze iPad ontvangt dan geen timer meer van deze klas.',ok:'Ja'}))return;store.del('kt_kid_code');store.del('kt_role');T&&T.stop();T=null;role=null;state={status:'idle'};show('home');$('homeChoose').classList.add('hide');$('homeKid').classList.remove('hide');setConn(false,'Niet verbonden')};
{let st=null;const S=document.querySelector('.status');S.addEventListener('pointerdown',()=>{if(role!=='kid'||VIEW)return;st=setTimeout(()=>{st=null;doLeave()},3000)});['pointerup','pointerleave','pointercancel'].forEach(ev=>S.addEventListener(ev,()=>{clearTimeout(st);st=null}))}
document.addEventListener('pointerdown',unlockAudio,{passive:true});
bindTeacher();

/* offline: app-bestanden bewaren op het apparaat */
if('serviceWorker' in navigator&&location.protocol==='https:'){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})})}

/* intro bij openen (één keer per sessie, niet in voorbeeldvensters) */
(function(){
  const q=new URLSearchParams(location.search);
  let seen=false;try{seen=sessionStorage.getItem('fz_intro')==='1'}catch(e){}
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(seen||reduce||q.has('kijk')||q.has('mini')||window.self!==window.top)return;
  try{sessionStorage.setItem('fz_intro','1')}catch(e){}
  const el=$('intro');el.classList.remove('hide');
  const end=()=>{if(el.classList.contains('out'))return;el.classList.add('out');setTimeout(()=>el.classList.add('hide'),650)};
  el.addEventListener('click',end);setTimeout(end,2900);
})();

const qs=new URLSearchParams(location.search);
const urlCode=(qs.get('klas')||'').toUpperCase(),homeCode=(qs.get('thuis')||'').toUpperCase();
if(PROBEER)startProbeer();
else if(HOME&&validCode(homeCode))startThuis(homeCode);
else if(validCode(urlCode))startKid(urlCode);
else if(qs.has('leerkracht'))startTeacher();
else if(store.get('kt_role')==='kid'&&validCode(store.get('kt_kid_code')||''))startKid(store.get('kt_kid_code'));
else if(store.get('kt_role')==='teacher')startTeacher();
else{show('home');setConn(false,'Niet verbonden')}
