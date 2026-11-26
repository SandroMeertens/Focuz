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
