/* =================== weergave timer =================== */
const remaining = () => state.status==='running'?state.endAt-srvNow():state.status==='paused'?state.remaining:null;
let calmPref = store.get('kt_calm')==='1';
const calmAllowed = () => !(curDay&&curDay.opts&&curDay.opts.calm===false);
let calm = calmPref;
function render(){
  if(HOME)return;
  const rem = remaining(), total = state.total||1;
  const done = state.status==='running' && rem<=0;
  const warn = !done && rem!==null && rem<=5*60000 && rem<total;
  let big='--:--', sub='', endTxt='';
  if(state.status==='idle'){big='Even wachten';sub='De timer is nog niet gestart'}
  else if(done){big='Tijd is om!';sub='Leg je spullen neer en kijk naar voren'}
  else {big=fmt(rem);sub=state.status==='paused'?'De timer staat even stil':(warn?'Nog even! Rond je werk af':'Werk rustig door');
        if(state.status==='running') endTxt='Klaar om '+clock(Math.round((state.endAt-offset)/60000)*60000)}
  if(role==='kid'){
    calm=calmPref&&calmAllowed();$('kCalm').classList.toggle('hide',!calmAllowed());
    const k=$('kid'),live=state.status!=='idle';
    const brk=live&&BREAK_RE.test(state.vak||''),gym=live&&GYM_RE.test(state.vak||'');
    const special=brk||gym;
    k.classList.toggle('warn',warn&&!special);k.classList.toggle('done',done);k.classList.toggle('idle',!live||done);k.classList.toggle('calm',calm);k.classList.toggle('brk',special&&!done);
    $('kVak').textContent=state.vak||'';$('kVak').classList.toggle('hide',!state.vak||!live||special);
    $('kTask').textContent=!live?'\u00a0':special?(state.vak||'Pauze'):kidTitle(state.task||'')||'\u00a0';
    {const [dm,da]=splitDoel(state.doel);$('kDoelTxt').textContent=dm;$('kDoel').classList.toggle('hide',!live||!dm||special||done);$('kAuto').textContent=da?'Automatiseren: '+da:'';$('kAuto').classList.toggle('hide',!live||!da||special||done)}
    // wat staat er in de klok: de taak van nu, of het hele vak
    const tm=taskTimer();let arc=1,overT=false,line='';
    const nb=nextBlockKid();
    if(!live){big='Even wachten';sub='De timer is nog niet gestart'}
    else if(done){big='';sub=nb?'Straks: '+nb.vak:'Leg je spullen neer';line=nb?'Om '+nb.at+' begint '+nb.vak+'. Pak je spullen alvast.':'Leg je spullen neer en kijk naar voren.';arc=0}
    else if(special){big=fmt(rem);sub=state.status==='paused'?'Staat even stil':brk?'Pauze tot '+clock(state.endAt-offset):'Omkleden en naar de gymzaal';arc=rem/total;line=nb?'Daarna: '+nb.at+' '+nb.vak:''}
    else if(tm){const r=tm.endAt-Date.now();overT=r<=0;big=overT?'+'+fmt(-r):fmt(r);sub=tm.t;arc=overT?0:r/(tm.m*60000);
      line=(overT?'Over je tijd, rond af en ga door. ':'')+'Hele vak: nog '+minTxt(Math.max(1,Math.ceil(rem/60000)))+' · klaar om '+clock(state.endAt-offset)}
    else {arc=rem/total;line=state.status==='running'?'Klaar om '+clock(Math.round((state.endAt-offset)/60000)*60000):''}
    if(calm&&live&&!done){const r=tm?tm.endAt-Date.now():rem;big=r>0?'nog '+Math.max(1,Math.ceil(r/60000))+' min':'tijd om';}
    if(done)$('kBig').innerHTML='<div class="doneicon">✓</div>Tijd is om!';else $('kBig').textContent=big;
    $('kSub').textContent=sub;$('kVakLine').textContent=line;
    $('kRing').classList.toggle('over',overT);$('kRing').classList.toggle('taskmode',!!tm&&!done&&!special);
    document.querySelectorAll('.kPaused').forEach(e=>e.classList.toggle('hide',state.status!=='paused'));
    $('kArc').style.strokeDashoffset=String(CIRC*(1-(!live?1:done?0:Math.max(0,Math.min(1,arc)))));
    // stoplicht
    $('kRing').classList.toggle('hide',calm);$('kLight').classList.toggle('hide',!calm);
    $('lR').classList.toggle('on',done||overT);$('lO').classList.toggle('on',warn&&!overT);$('lG').classList.toggle('on',live&&!done&&!warn&&!overT);
    {const r=tm?tm.endAt-Date.now():rem;
     $('kLText').textContent=!live?'Even wachten':done?'Tijd is om':state.status==='paused'?'Even pauze':overT?'Rond af, volgende taak':(warn?'Bijna klaar · nog ongeveer ':'Nog ongeveer ')+minTxt(Math.max(1,Math.ceil(r/60000)));}
    $('kCalm').textContent=calm?'Klok tonen':'Rustig scherm';
    if(state.status==='running'&&warn&&total>6*60000&&store.get('kt_warned')!==state.sid){store.set('kt_warned',state.sid);if(state.sound!==false)chime(true)}
    renderKidList();renderOffline();renderDay();
    if(done && !rang){rang=true;if(state.sound!==false)chime()}
  } else if(role==='teacher'){
    renderNow();
  }
}

const BREAK_RE=/^(pauze|eten|lunch|eten en drinken|fruit|buitenspelen)$/i, GYM_RE=/^(gym|bewegingsonderwijs|gymles)$/i;
function splitDoel(d){d=String(d||'').trim();const m=d.match(/^(.*?)[\s.;]*\bAutomatiseren\s*:\s*(.+)$/i);return m&&m[1].trim()?[m[1].trim(),m[2].trim()]:[d,'']}
function kidTitle(t){t=String(t||'').trim().replace(/^blok\s*\d+\s*[,–—-]?\s*week\s*\d+\s*[,–—-]?\s*/i,'');if(t)t=t[0].toUpperCase()+t.slice(1);const i=t.indexOf(':');if(i>=3&&i<=40)return t.slice(0,i).trim();return t}
function taskTimer(){ // lopende taaktimer van een taak die nog niet af is
  if(!mini||state.status!=='running')return null;const x=(state.tasks||[])[mini.i];if(!x||!x.m||getTicks().includes(mini.i))return null;
  return {endAt:mini.endAt,m:x.m,t:x.t,i:mini.i};
}
function nextBlockKid(){const bl=dayBlocks();const from=(typeof DEMO!=='undefined'&&DEMO&&state.wordAt)?state.wordAt:hmNow();return bl.find(b=>b.at>from&&!(state.wordAt&&b.at===state.wordAt))||null}

/* =================== afvinklijst op de iPad =================== */
let listSig='', listSid='', selTask=null, mini=null; // mini = {i,endAt,rung}
const ticksKey = () => 'kt_ticks_'+(state.sid||'');
const getTicks = () => {try{return JSON.parse(store.get(ticksKey())||'[]')}catch(e){return []}};
const setTicks = t => store.set(ticksKey(),JSON.stringify(t));
const saveMini = () => {if(mini)store.set('kt_mini_'+state.sid,JSON.stringify(mini));else store.del('kt_mini_'+state.sid)};
function startMini(i){const x=(state.tasks||[])[i];mini=x&&x.m?{i,endAt:Date.now()+x.m*60000,rung:false}:null;saveMini()}
// ===== instructiegroepen, beloning en reflectie =====
const taskTags = t => {const g=[];const text=String(t||'').replace(/\s*\[([^\]]{1,30})\]/g,(q,x)=>{x.split(/[,/]/).forEach(y=>{y=y.trim().toLowerCase();if(y)g.push(y)});return ''}).trim();return {text,g}};
const grpLabel = g => g?g[0].toUpperCase()+g.slice(1):'';
const myGroup = () => store.get('fz_group_'+code)||'';
const taskGroups = tasks => [...new Set(tasks.flatMap(x=>taskTags(x.t).g))];
const forMe = (x,grp) => {const g=taskTags(x.t).g;return !g.length||(grp&&g.includes(grp))};
const isTable = x => {const tt=taskTags(x.t);return tt.g.length&&/instructie|tafel/i.test(tt.text)};
function reflStore(){try{return JSON.parse(store.get('fz_refl_'+code)||'{}')||{}}catch(e){return {}}}
function reflRecent(){const r=reflStore();const ks=Object.keys(r).slice(-4);const o={};ks.forEach(k=>o[k]=r[k]);return o}
let reflFor=null,lastLesson=null,celebrated={},askedR={};
function askReflect(les){ // les: {sid,vak,doel}
  if(!les||!les.doel||VIEW&&!DEMO||reflStore()[les.sid]||askedR[les.sid])return;askedR[les.sid]=1;
  reflFor=les;$('kRefVak').textContent=les.vak?'Hoe ging '+les.vak+'?':'Hoe ging het?';$('kRefDoel').textContent=les.doel;
  $('kRefl').classList.remove('hide');clearTimeout(askReflect.t);askReflect.t=setTimeout(()=>$('kRefl').classList.add('hide'),90000);
}
function answerReflect(v){if(reflFor&&v){const r=reflStore();r[reflFor.sid]=v;const ks=Object.keys(r);if(ks.length>40)delete r[ks[0]];store.set('fz_refl_'+code,JSON.stringify(r));if(T&&!VIEW&&!DEMO)T.tick()}
  $('kRefl').classList.add('hide');reflFor=null}
function celebrate(){
  const el=$('kCele');el.classList.remove('hide');el.classList.remove('go');void el.offsetWidth;el.classList.add('go');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const box=el.querySelector('.conf');box.innerHTML='';
    for(let i=0;i<36;i++){const c=document.createElement('i');c.style.left=Math.random()*100+'%';c.style.animationDelay=(Math.random()*.5)+'s';c.style.background=['#2fb67c','#ffd08a','#7fb4ff','#ff9f8a','#fff'][i%5];c.style.transform='rotate('+(Math.random()*360)+'deg)';box.append(c)}}
  setTimeout(()=>{el.classList.add('hide');askReflect(curLesson())},2600);
}
const curLesson = () => state&&state.sid&&state.status!=='idle'&&!BREAK_RE.test(state.vak||'')?{sid:state.sid,vak:state.vak||'',doel:splitDoel(state.doel)[0]}:null;
function renderKidList(){
  const tasks = Array.isArray(state.tasks)?state.tasks.filter(x=>x&&x.t):[];
  const groups=taskGroups(tasks), grp=groups.includes(myGroup())?myGroup():'';
  const extras = Array.isArray(state.extra)?state.extra.filter(Boolean):[];
  const sp=BREAK_RE.test(state.vak||'')||GYM_RE.test(state.vak||'');const dn=state.status==='running'&&state.endAt<=srvNow();
  const show = state.status!=='idle' && !sp && !dn && (tasks.length||extras.length);
  {const cl=curLesson(); // reflectie: na de les, of als de tijd om is
    if(lastLesson&&(!cl||cl.sid!==lastLesson.sid))askReflect(lastLesson);
    if(cl&&dn){askReflect(cl);lastLesson=null}else lastLesson=cl}
  $('kid').classList.toggle('haslist',!!show);
  $('kListWrap').classList.toggle('hide',!show);
  if(!show){listSig='';return}
  if(listSid!==state.sid){listSid=state.sid;selTask=null;try{mini=JSON.parse(store.get('kt_mini_'+state.sid))}catch(e){mini=null}if(mini)selTask=mini.i;else{const t0=getTicks();const f=tasks.findIndex((x,j)=>!t0.includes(j)&&forMe(x,grp));selTask=f>=0?f:null}}
  $('kGrp').classList.toggle('hide',!groups.length);
  if(groups.length){$('kGrpTxt').textContent=grp?'Groep: '+grpLabel(grp):'Kies je groep:';
    $('kGrpBtns').innerHTML='';$('kGrpBtns').classList.toggle('hide',!!grp&&!kGrpOpen);groups.forEach(g=>{const b=document.createElement('button');b.textContent=grpLabel(g);b.dataset.g=g;b.classList.toggle('on',g===grp);$('kGrpBtns').append(b)});
    $('kGrpChange').classList.toggle('hide',!grp||kGrpOpen)}
  const sig=state.sid+JSON.stringify(tasks)+extras.join('|')+'#'+grp;
  if(sig!==listSig){
    listSig=sig;
    const ul=$('kTasks');ul.innerHTML='';
    tasks.forEach((x,i)=>{
      const li=document.createElement('li');li.dataset.i=i;
      li.innerHTML='<div class="trow"><button class="box" aria-label="Afvinken"></button><button class="tname"></button><span class="tmin"></span></div><div class="tdetail hide"><div class="say"></div><button class="mbtn"></button></div>';
      const tt=taskTags(x.t);li.classList.toggle('notme',!forMe(x,grp));
      li.querySelector('.tname').textContent=tt.text;if(isTable(x)){const bd=document.createElement('span');bd.className='tbadge';bd.textContent='Instructietafel';li.querySelector('.tname').append(bd)}
      li.querySelector('.tmin').textContent=x.m?x.m+' min':'';li.querySelector('.tmin').classList.toggle('hide',!x.m);
      ul.append(li);
    });
    $('kExtraList').innerHTML='';
    extras.forEach(e=>{const li=document.createElement('li');li.textContent=e;$('kExtraList').append(li)});
  }
  const ticks=getTicks();let doneCount=0,mine=0,num=0;
  [...$('kTasks').children].forEach((li,i)=>{
    const x=tasks[i], ok=ticks.includes(i);if(!forMe(x,grp)){li.classList.add('notme');return}mine++;if(ok)doneCount++;
    li.querySelector('.tname').dataset.n=(++num)+'. ';
    const running=mini&&mini.i===i, r=running?mini.endAt-Date.now():0;
    li.classList.toggle('ok',ok);li.classList.toggle('sel',selTask===i);li.classList.toggle('over',running&&r<=0&&!ok);li.classList.toggle('later',!ok&&selTask!==i);
    li.querySelector('.box').textContent=ok?'✓':'';
    li.querySelector('.tdetail').classList.toggle('hide',selTask!==i);
    if(selTask!==i)return;
    const say=li.querySelector('.say'), b=li.querySelector('.mbtn');
    if(running&&!ok){
      li.querySelector('.tdetail').classList.toggle('hide',r>0);
      say.textContent='Je tijd voor deze taak is om. Rond af en vink hem af.';
      b.classList.add('hide');
    } else {
      say.innerHTML=x.m?'':'Voor deze taak is geen tijd ingesteld.';
      b.textContent='Start taaktimer';b.classList.toggle('hide',!x.m||ok);
    }
  });
  $('kProg').textContent=mine?`${doneCount} van ${mine} af`:'';
  const all=mine>0&&doneCount===mine;
  if(all&&!celebrated[state.sid]&&!store.get('fz_cele_'+state.sid)){celebrated[state.sid]=1;store.set('fz_cele_'+state.sid,'1');if(listReady)celebrate()}
  listReady=true;
  $('kAllDone').classList.toggle('hide',!(all&&extras.length));
  $('kid').classList.toggle('tasksdone',all&&extras.length>0);
  $('kExtras').classList.toggle('hide',!extras.length||(mine>0&&!all));
}
let listReady=false,kGrpOpen=false;
$('kGrpBtns').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;store.set('fz_group_'+code,b.dataset.g);kGrpOpen=false;listSig='';renderKidList();if(T&&!VIEW&&!DEMO)T.tick()});
$('kGrpChange').addEventListener('click',()=>{kGrpOpen=true;renderKidList()});
$('kRefl').addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b)answerReflect(b.dataset.r)});
$('kTasks').addEventListener('click',e=>{
  const li=e.target.closest('li');if(!li)return;const i=+li.dataset.i;
  const tasks=state.tasks||[];
  if(e.target.closest('.box')){
    let t=getTicks();
    if(t.includes(i))t=t.filter(x=>x!==i);
    else{t.push(i);if(mini&&mini.i===i){mini=null;saveMini()}
      const g0=myGroup();const next=tasks.findIndex((x,j)=>j>i&&!t.includes(j)&&forMe(x,taskGroups(tasks).includes(g0)?g0:''));
      selTask=next>=0?next:null;
      if(next>=0&&(!mini||mini.i!==next))startMini(next);   // volgende taak start vanzelf
    }
    setTicks(t);if(T&&!VIEW&&!DEMO)T.tick();
  } else if(e.target.closest('.mbtn')){
    if(mini&&mini.i===i){mini=null;saveMini()}else{startMini(i);unlockAudio()}
  } else if(e.target.closest('.trow')){
    selTask=selTask===i?null:i;
  }
  renderKidList();
});
$('kCalm').addEventListener('click',()=>{calmPref=!calmPref;store.set('kt_calm',calmPref?'1':'0');render()});

/* =================== melding naar alle iPads =================== */
let curMsg=null, msgRingAt=0;
const PRESETS=['Kom terug naar de klas','Kijk naar het bord','Kom naar de kring','Opruimen','iPad dicht','Pauze'];
function msgActive(){return curMsg&&srvNow()-(curMsg.at||0)<15*60000}
function renderMsg(){
  if(role==='kid'){
    const show=msgActive()&&store.get('kt_msgseen')!==curMsg.id;
    $('kAlert').classList.toggle('hide',!show);
    if(show){
      $('kAlertTxt').textContent=curMsg.text;
      if(Date.now()-msgRingAt>20000){msgRingAt=Date.now();chime();keepAwake()}   // herhaalt tot op Oké is getikt
    } else msgRingAt=0;
  } else if(role==='teacher'){
    const a=msgActive();$('mActive').classList.toggle('hide',!a);$('mBtn').classList.toggle('alerton',!!a);$('mBtn').textContent=a?'Melding actief':'Melding';
    if(a)$('mInfo').textContent=`Op alle iPads sinds ${clock(curMsg.at-offset)}: "${curMsg.text}"`;
  }
}
function myPresets(){return plan&&Array.isArray(plan.msgPresets)?plan.msgPresets:[]}
function renderPresets(){const box=$('mPresets');box.innerHTML='';
  [...PRESETS,...myPresets()].forEach((p,i)=>{const b=document.createElement('button');b.dataset.p=p;b.textContent=p;
    if(i>=PRESETS.length){b.className='mine';const x=document.createElement('span');x.className='mx';x.textContent='×';x.title='Knop weghalen';x.dataset.del=p;b.append(x)}box.append(b)})}
$('mPresets').addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){e.stopPropagation();plan.msgPresets=myPresets().filter(x=>x!==d.dataset.del);savePlan();renderPresets();return}
  const b=e.target.closest('button');if(b){sendMsg(b.dataset.p);closePops()}});
$('mSave').addEventListener('click',e=>{e.stopPropagation();const t=$('mText2').value.trim().slice(0,40);if(!t||!plan)return;
  if(![...PRESETS,...myPresets()].includes(t)){plan.msgPresets=[...myPresets(),t].slice(-6);savePlan()}$('mText2').value='';renderPresets()});
$('mSend').addEventListener('click',()=>{const t=$('mText2').value.trim();if(t){sendMsg(t);$('mText2').value='';closePops()}});
$('mText2').addEventListener('keydown',e=>{if(e.key==='Enter')$('mSend').click()});
$('mClear').addEventListener('click',()=>{curMsg=null;T&&T.sendMsg(null);renderMsg()});
function sendMsg(text){curMsg={id:newCode(),text:text.slice(0,80),at:srvNow()};T&&T.sendMsg(curMsg);renderMsg()}
$('kAlertOk').addEventListener('click',()=>{if(curMsg)store.set('kt_msgseen',curMsg.id);renderMsg()});

/* =================== geluid & scherm =================== */
function chime(soft){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    (soft?[880,660]:[660,880,990]).forEach((f,i)=>{const d=i*0.35,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,audioCtx.currentTime+d);g.gain.exponentialRampToValueAtTime(soft?0.14:0.3,audioCtx.currentTime+d+0.02);g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+d+0.9);
      o.connect(g).connect(audioCtx.destination);o.start(audioCtx.currentTime+d);o.stop(audioCtx.currentTime+d+1)});
  }catch(e){}
}
function unlockAudio(){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const p=audioCtx.resume&&audioCtx.resume();
  // een stil toontje speelt het geluid op iOS echt vrij
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();g.gain.value=0.0001;o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+0.05);
  if(p&&p.then)p.then(()=>renderSoundTip())}catch(e){}}
const audioOk=()=>!!audioCtx&&audioCtx.state==='running';
function renderSoundTip(){
  if(role!=='kid'||VIEW){$('kSoundTip').classList.add('hide');return}
  const need=state.sound!==false&&!(curDay&&curDay.sound===false)&&(state.status!=='idle'||!$('kMorning').classList.contains('hide'));
  $('kSoundTip').classList.toggle('hide',!need||audioOk());
}
$('kSoundTip').addEventListener('click',()=>{unlockAudio();setTimeout(()=>{if(audioOk())chime(true);renderSoundTip()},150)});
let wakeSentinel=null,wakeBusy=false;
async function keepAwake(){ // houdt het scherm aan, alleen als dat nu nodig is
  if(!('wakeLock' in navigator)||wakeBusy||wakeSentinel||document.visibilityState!=='visible')return;
  wakeBusy=true;try{wakeSentinel=await navigator.wakeLock.request('screen');wakeSentinel.addEventListener('release',()=>{wakeSentinel=null})}catch(e){}wakeBusy=false;
}
function manageWake(){
  if(role!=='kid'){return}
  const need=state.status!=='idle'||!$('kMorning').classList.contains('hide')||!$('kAlert').classList.contains('hide');
  if(need)keepAwake();else if(wakeSentinel){try{wakeSentinel.release()}catch(e){}wakeSentinel=null}
}

