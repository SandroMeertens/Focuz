/* Focuz – app */
{
/* =================== basis =================== */
const FBCFG = window.KLASTIMER_FIREBASE;
const USE_FB = !!(FBCFG && FBCFG.apiKey && FBCFG.databaseURL);
const BROKER = new URLSearchParams(location.search).get('broker') || 'wss://broker.emqx.io:8084/mqtt';
const PREFIX = 'focuz/v2/';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAGEN = ['','Ma','Di','Wo','Do','Vr'];
const $ = id => document.getElementById(id);
const store = {get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>ALPH[b%ALPH.length]).join('');
const validCode = c => /^[A-HJ-NP-Z2-9]{6}$/.test(c);
const myId = store.get('kt_id') || (()=>{const i=newCode()+newCode();store.set('kt_id',i);return i})();
const pad = n => String(n).padStart(2,'0');
const fmt = ms => {const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return h?`${h}:${pad(m)}:${pad(r)}`:`${pad(m)}:${pad(r)}`};
const clock = t => {const d=new Date(t);return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
const minTxt = m => m===1?'1 minuut':m+' minuten';
const today = () => {const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const CIRC = 552.92;
const loadScript = src => new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.append(s)});

let code=null, role=null, state={status:'idle'}, audioCtx=null, rang=false;
let T=null;               // verbinding (MQTT of Firebase)
let offset=0;             // klokverschil (ms) met de leerkracht/server
const srvNow = () => Date.now()+offset;

function ask({title,text='',input=null,ok='OK'}){
  return new Promise(res=>{
    $('mTitle').textContent=title;$('mText').textContent=text;$('mOk').textContent=ok;
    $('mInput').classList.toggle('hide',input===null);$('mInput').value=input||'';
    $('modal').classList.remove('hide');if(input!==null)setTimeout(()=>$('mInput').focus(),50);
    const done=v=>{$('modal').classList.add('hide');$('mOk').onclick=$('mCancel').onclick=$('mInput').onkeydown=null;res(v)};
    $('mOk').onclick=()=>done(input===null?true:$('mInput').value.trim());
    $('mCancel').onclick=()=>done(input===null?false:null);
    $('mInput').onkeydown=e=>{if(e.key==='Enter')$('mOk').onclick()};
  });
}

/* =================== verbinding =================== */
let connected=false, everConnected=false, offSince=Date.now();
function setConn(ok,txt){
  if(typeof DEMO!=='undefined'&&DEMO){ok=true;txt='Oefenstand'}
  $('dot').className='dot '+(ok?'on':'off');$('conn').textContent=txt;
  if(ok){everConnected=true;offSince=0}else if(connected||!offSince)offSince=Date.now();
  connected=ok;renderOffline();
}
function renderOffline(){
  const showIt = role==='kid' && !connected && offSince && Date.now()-offSince>3000;
  $('kOff').classList.toggle('hide',!showIt);
  if(showIt) $('kOff').textContent = everConnected&&state.status==='running'
    ? 'Verbinding even weg. De timer loopt gewoon door.'
    : everConnected?'Verbinding even weg. Even geduld…':'Nog geen verbinding. Staat de wifi aan?';
}

/* ---- MQTT (gratis openbare server) ---- */
/* Op de openbare server is alles versleuteld met de klascode (AES-GCM).
   Het onderwerp is een hash, dus wie meeluistert ziet geen klascodes, roosters of lesdoelen
   en kan zonder de klascode geen geldige berichten sturen. */
const TE=new TextEncoder(),TD=new TextDecoder();
const b64=u=>{let s='';u.forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function classKeys(c){
  const h=new Uint8Array(await crypto.subtle.digest('SHA-256',TE.encode('focuz-topic|'+c)));
  const topic=[...h.slice(0,12)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const raw=await crypto.subtle.importKey('raw',TE.encode('focuz|'+c),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:TE.encode('focuz-v2-zout'),iterations:150000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  return {topic,key};
}
async function seal(key,obj){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,TE.encode(JSON.stringify(obj))));const o=new Uint8Array(12+ct.length);o.set(iv);o.set(ct,12);return b64(o)}
async function unseal(key,str){const u=unb64(str);return JSON.parse(TD.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12)},key,u.slice(12))))}
function mqttTransport(h){
  let client=null, base='', key=null; const peers={};
  const ready=classKeys(code).then(k=>{base=PREFIX+k.topic+'/';key=k.key});
  const pub=async(sub,obj,opts)=>{await ready;if(!client)return;client.publish(base+sub,obj==null?'':await seal(key,obj),opts||{})};
  const t={
    async start(){
      await ready;
      if(typeof mqtt==='undefined'){try{await loadScript('https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js')}catch(e){setConn(false,'Geen internet');return}}
      client=mqtt.connect(BROKER,{clientId:'kt_'+myId+'_'+Math.random().toString(16).slice(2,6),clean:true,reconnectPeriod:2000,connectTimeout:10000,keepalive:30});
      client.on('connect',()=>{setConn(true,'Verbonden');client.subscribe([base+'state',base+'clock',base+'ping',base+'msg',base+'day'])});
      client.on('reconnect',()=>setConn(false,'Opnieuw verbinden…'));
      client.on('offline',()=>setConn(false,'Geen verbinding'));
      client.on('close',()=>setConn(false,'Geen verbinding'));
      client.on('message',async(topic,buf)=>{
        const k=topic.slice(base.length);
        if(k==='msg'&&!buf.length){h.onMsg(null);return}
        if(!buf.length)return;
        let msg;try{msg=await unseal(key,buf.toString())}catch(e){return}   // niet te ontsleutelen: negeren
        if(!msg||typeof msg!=='object')return;
        if(k==='msg'){h.onMsg(msg);return}
        if(k==='day'){h.onDay(msg);return}
        if(k==='state')h.onState(msg);
        else if(k==='clock'&&role==='kid'&&typeof msg.now==='number')offset=msg.now-Date.now();
        else if(k==='ping'&&role==='teacher'&&msg.id){peers[msg.id]={at:Date.now(),sid:String(msg.sid||''),ticks:arr(msg.ticks).map(Number)};t.count()}
      });
    },
    publish(s){pub('state',s,{qos:1,retain:true})},
    clear(){pub('state',null,{retain:true})},
    sendMsg(m){pub('msg',m||null,{qos:1,retain:true})},
    sendDay(d){pub('day',d,{qos:1,retain:true})},
    tick(){
      if(!client||!client.connected)return;
      if(role==='teacher')pub('clock',{now:Date.now()});
      if(role==='kid'&&!VIEW)pub('ping',{id:myId,sid:state.sid||'',ticks:getTicks()});
    },
    count(){const n=Date.now();for(const k in peers)if(n-peers[k].at>50000)delete peers[k];h.onKids(Object.values(peers))},
    wake(){if(client&&!client.connected)client.reconnect()},
    stop(){try{client&&client.end(true)}catch(e){}}
  };
  return t;
}

/* ---- Firebase (eigen server) ---- */
let fb=null, fbUser=null;
async function fbInit(){
  if(fb)return fb;
  const v='10.12.2', g=`https://www.gstatic.com/firebasejs/${v}/`;
  await loadScript(g+'firebase-app-compat.js');
  await Promise.all([loadScript(g+'firebase-auth-compat.js'),loadScript(g+'firebase-database-compat.js')]);
  firebase.initializeApp(FBCFG);
  fb={auth:firebase.auth(),db:firebase.database()};
  fb.db.ref('.info/serverTimeOffset').on('value',s=>{offset=s.val()||0});
  fb.db.ref('.info/connected').on('value',s=>{if(s.val())setConn(true,'Verbonden');else setConn(false,'Geen verbinding')});
  return fb;
}
function fbTransport(h){
  const ref=p=>fb.db.ref('klassen/'+code+(p?'/'+p:''));
  let me=null, conRef=null;
  const t={
    async start(){
      await fbInit();
      if(role==='kid'&&!VIEW){
        if(!fb.auth.currentUser) await fb.auth.signInAnonymously();
        me=ref('kids/'+fb.auth.currentUser.uid);
        conRef=fb.db.ref('.info/connected');
        conRef.on('value',s=>{if(s.val()){me.onDisconnect().remove();t.tick()}});
      } else {
        ref('kids').on('value',s=>{const v=s.val()||{};h.onKids(Object.values(v).map(x=>({sid:String(x.sid||''),ticks:arr(x.ticks).map(Number)})))},()=>{});
      }
      ref('state').on('value',s=>h.onState(s.val()||{status:'idle'}),e=>setConn(false,'Geen toegang'));
      ref('msg').on('value',s=>h.onMsg(s.val()),()=>{});
      ref('day').on('value',s=>h.onDay(s.val()),()=>{});
    },
    sendDay(d){ref('day').set(JSON.parse(JSON.stringify(d))).catch(()=>{})},
    sendMsg(m){(m?ref('msg').set(m):ref('msg').remove()).catch(e=>{$('mInfo').textContent='Versturen mislukt: '+(e.code||e.message)})},
    publish(s){ref('state').set(JSON.parse(JSON.stringify(s))).catch(e=>{$('tErr').textContent='Opslaan mislukt: '+(e.code||e.message)})},
    clear(){ref('state').remove().catch(()=>{})},
    tick(){if(me)me.set({at:firebase.database.ServerValue.TIMESTAMP,sid:state.sid||'',ticks:getTicks()}).catch(()=>{})}, count(){}, wake(){},
    stop(){try{ref('state').off();ref('kids').off();ref('msg').off();ref('day').off();conRef&&conRef.off();me&&me.remove()}catch(e){}}
  };
  return t;
}

/* iPads volgen zelf de weekplanning: loopt er geen vak van de leerkracht, dan start het blok van nu vanzelf */
let tState={status:'idle'};
function localTime(hm){const [h,m]=hm.split(':').map(Number);const d=new Date();d.setHours(h,m,0,0);return d.getTime()}
function effState(){
  if(typeof DEMO!=='undefined'&&DEMO)return state;
  const t=tState||{status:'idle'};
  const tActive=(t.status==='running'&&t.endAt>srvNow())||t.status==='paused';
  if(tActive||!curDay||curDay.auto===false)return t;
  const w=curDay.week&&arr(curDay.week[today()]).length?arr(curDay.week[today()]):(curDay.date===today()?arr(curDay.blocks):[]);
  const n=Date.now();const b=w.find(x=>x&&x.at&&x.end&&n>=localTime(x.at)&&n<localTime(x.end));
  if(!b)return t;
  const start=localTime(b.at);
  if(t.stoppedAt&&t.stoppedAt-offset>=start)return t;               // juf/meester heeft dit blok gestopt
  if(t.status==='running'&&t.wordAt===b.at&&t.vak===b.vak)return t;  // al door de leerkracht gestart
  const sid='A'+today().replace(/-/g,'')+b.at.replace(':','');
  if(state&&state.sid===sid)return state;
  return {v:3,sid,status:'running',endAt:localTime(b.end)+offset,total:localTime(b.end)-start,vak:b.vak,task:b.title||'',doel:b.doel||'',
    tasks:arr(b.tasks).filter(x=>x&&x.t),extra:arr(b.extra).filter(Boolean),sound:curDay.sound!==false,wordAt:b.at,autoKid:true};
}
function connect(){
  if(T)T.stop();
  const h={onState:s=>{tState=s&&typeof s==='object'?s:{status:'idle'};state=role==='kid'?effState():tState;if(state.status!=='running'||state.endAt>srvNow())rang=false;render()},
           onKids:list=>{kidsInfo=list;renderNow()},
           onMsg:m=>{curMsg=m&&typeof m==='object'&&m.text?m:null;renderMsg()},
           onDay:d=>{if(d&&typeof d==='object'&&role==='kid'&&!VIEW)store.set('fz_day',JSON.stringify(d));curDay=d&&typeof d==='object'?{opts:d.opts&&typeof d.opts==='object'?d.opts:{},next:d.next&&d.next.date?d.next:null,date:d.date||'',blocks:arr(d.blocks),week:d.week&&typeof d.week==='object'?d.week:{},auto:d.auto,sound:d.sound,morning:d.morning&&typeof d.morning==='object'?{text:String(d.morning.text||''),tasks:arr(d.morning.tasks).map(String),vandaag:arr(d.morning.vandaag).map(String)}:null}:null;renderDay();renderWeek()}};
  daySig='';
  T=USE_FB?fbTransport(h):mqttTransport(h);
  T.start().catch(e=>{setConn(false,'Verbindingsfout');console.error(e)});
}
function publishState(s){state=s;rang=false;render();T&&T.publish(s)}

/* =================== weergave timer =================== */
const remaining = () => state.status==='running'?state.endAt-srvNow():state.status==='paused'?state.remaining:null;
let calmPref = store.get('kt_calm')==='1';
const calmAllowed = () => !(curDay&&curDay.opts&&curDay.opts.calm===false);
let calm = calmPref;
function render(){
  const rem = remaining(), total = state.total||1;
  const done = state.status==='running' && rem<=0;
  const warn = !done && rem!==null && rem<=5*60000 && rem<total;
  let big='--:--', sub='', endTxt='';
  if(state.status==='idle'){big='Even wachten';sub='De timer is nog niet gestart'}
  else if(done){big='Tijd is om!';sub='Leg je spullen neer en kijk naar voren'}
  else {big=fmt(rem);sub=state.status==='paused'?'De timer staat even stil':(warn?'Nog even! Rond je werk af':'Werk rustig door');
        if(state.status==='running') endTxt='Klaar om '+clock(state.endAt-offset)}
  if(role==='kid'){
    calm=calmPref&&calmAllowed();$('kCalm').classList.toggle('hide',!calmAllowed());
    const k=$('kid'),live=state.status!=='idle';
    const brk=live&&BREAK_RE.test(state.vak||''),gym=live&&GYM_RE.test(state.vak||'');
    const special=brk||gym;
    k.classList.toggle('warn',warn&&!special);k.classList.toggle('done',done);k.classList.toggle('idle',!live||done);k.classList.toggle('calm',calm);k.classList.toggle('brk',special&&!done);
    $('kVak').textContent=state.vak||'';$('kVak').classList.toggle('hide',!state.vak||!live||special);
    $('kTask').textContent=!live?'\u00a0':special?(state.vak||'Pauze'):kidTitle(state.task||'')||'\u00a0';
    $('kDoelTxt').textContent=state.doel||'';$('kDoel').classList.toggle('hide',!live||!state.doel||special||done);
    // wat staat er in de klok: de taak van nu, of het hele vak
    const tm=taskTimer();let arc=1,overT=false,line='';
    const nb=nextBlockKid();
    if(!live){big='Even wachten';sub='De timer is nog niet gestart'}
    else if(done){big='';sub=nb?'Straks: '+nb.vak:'Leg je spullen neer';line=nb?'Om '+nb.at+' begint '+nb.vak+'. Pak je spullen alvast.':'Leg je spullen neer en kijk naar voren.';arc=0}
    else if(special){big=fmt(rem);sub=state.status==='paused'?'Staat even stil':brk?'Pauze tot '+clock(state.endAt-offset):'Omkleden en naar de gymzaal';arc=rem/total;line=nb?'Daarna: '+nb.at+' '+nb.vak:''}
    else if(tm){const r=tm.endAt-Date.now();overT=r<=0;big=overT?'+'+fmt(-r):fmt(r);sub=tm.t;arc=overT?0:r/(tm.m*60000);
      line=(overT?'Over je tijd, rond af en ga door. ':'')+'Hele vak: nog '+minTxt(Math.max(1,Math.ceil(rem/60000)))+' · klaar om '+clock(state.endAt-offset)}
    else {arc=rem/total;line=state.status==='running'?'Klaar om '+clock(state.endAt-offset):''}
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
function kidTitle(t){t=String(t||'').trim();const i=t.indexOf(':');if(i>=3&&i<=40)return t.slice(0,i).trim();return t}
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
function renderKidList(){
  const tasks = Array.isArray(state.tasks)?state.tasks.filter(x=>x&&x.t):[];
  const extras = Array.isArray(state.extra)?state.extra.filter(Boolean):[];
  const sp=BREAK_RE.test(state.vak||'')||GYM_RE.test(state.vak||'');const dn=state.status==='running'&&state.endAt<=srvNow();
  const show = state.status!=='idle' && !sp && !dn && (tasks.length||extras.length);
  $('kid').classList.toggle('haslist',!!show);
  $('kListWrap').classList.toggle('hide',!show);
  if(!show){listSig='';return}
  if(listSid!==state.sid){listSid=state.sid;selTask=null;try{mini=JSON.parse(store.get('kt_mini_'+state.sid))}catch(e){mini=null}if(mini)selTask=mini.i;else{const t0=getTicks();const f=tasks.findIndex((x,j)=>!t0.includes(j));selTask=f>=0?f:null}}
  const sig=state.sid+JSON.stringify(tasks)+extras.join('|');
  if(sig!==listSig){
    listSig=sig;
    const ul=$('kTasks');ul.innerHTML='';
    tasks.forEach((x,i)=>{
      const li=document.createElement('li');li.dataset.i=i;
      li.innerHTML='<div class="trow"><button class="box" aria-label="Afvinken"></button><button class="tname"></button><span class="tmin"></span></div><div class="tdetail hide"><div class="say"></div><button class="mbtn"></button></div>';
      li.querySelector('.tname').textContent=(i+1)+'. '+x.t;
      li.querySelector('.tmin').textContent=x.m?x.m+' min':'';li.querySelector('.tmin').classList.toggle('hide',!x.m);
      ul.append(li);
    });
    $('kExtraList').innerHTML='';
    extras.forEach(e=>{const li=document.createElement('li');li.textContent=e;$('kExtraList').append(li)});
  }
  const ticks=getTicks();let doneCount=0;
  [...$('kTasks').children].forEach((li,i)=>{
    const x=tasks[i], ok=ticks.includes(i);if(ok)doneCount++;
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
      say.innerHTML=x.m?'Hier krijg je <b>'+minTxt(x.m)+'</b> voor.':'Voor deze taak is geen tijd ingesteld.';
      b.textContent='Start taaktimer';b.classList.toggle('hide',!x.m||ok);
    }
  });
  $('kProg').textContent=tasks.length?`${doneCount} van ${tasks.length} af`:'';
  const all=tasks.length>0&&doneCount===tasks.length;
  $('kAllDone').classList.toggle('hide',!(all&&extras.length));
  $('kExtras').classList.toggle('hide',!extras.length||(tasks.length>0&&!all));
}
$('kTasks').addEventListener('click',e=>{
  const li=e.target.closest('li');if(!li)return;const i=+li.dataset.i;
  const tasks=state.tasks||[];
  if(e.target.closest('.box')){
    let t=getTicks();
    if(t.includes(i))t=t.filter(x=>x!==i);
    else{t.push(i);if(mini&&mini.i===i){mini=null;saveMini()}
      const next=tasks.findIndex((x,j)=>j>i&&!t.includes(j));
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
const PRESETS=['Kom terug naar de klas','Kijk naar het bord','Ruim je spullen op','Pauze'];
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
$('mPresets').innerHTML=PRESETS.map(p=>`<button data-p="${p}">${p}</button>`).join('');
$('mPresets').addEventListener('click',e=>{const b=e.target.closest('button');if(b){sendMsg(b.dataset.p);closePops()}});
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

/* =================== schermen =================== */
function show(id){['home','login','kid','teacher','board'].forEach(s=>$(s).classList.toggle('hide',s!==id))}
const VIEW=new URLSearchParams(location.search).has('kijk');
/* ---- oefenstand in het leerlingbeeld ---- */
let DEMO=false, demoN=0;
const DEMO_BLOCKS=[{at:'08:30',end:'09:00',vak:'Stillezen',title:'Lezen in je eigen boek',doel:''},{at:'09:00',end:'10:00',vak:'Rekenen',title:'Blok 3 les 9',doel:'Ik kan breuken met elkaar vergelijken.',tasks:[{t:'Instructie',m:10},{t:'Werkboek opdracht 1 t/m 6',m:25},{t:'Nakijken',m:5}],extra:['Plusblad']},
  {at:'10:00',end:'10:15',vak:'Pauze',title:'',doel:''},{at:'10:15',end:'11:00',vak:'Spelling',title:'Blok 3 les 4',doel:'Ik kan woorden met -ig en -lijk goed schrijven.'},
  {at:'11:00',end:'11:45',vak:'Taal',title:'Les 7: verhaaltekst',doel:'Ik kan een verhaal opbouwen met begin, midden en eind.'},{at:'12:40',end:'13:00',vak:'BG lezen',title:'Tekst 4 lezen',doel:''}];
function demoDay(){
  if(curDay&&curDay.date===today()&&arr(curDay.blocks).length)return curDay;
  const week={};weekDates().forEach(d=>{week[ymd(d)]=DEMO_BLOCKS});return {date:today(),blocks:DEMO_BLOCKS,week};
}
function demoStart(){
  // kies een echte dag uit de weekplanning: vandaag als er nog blokken komen, anders de volgende lesdag
  const d=demoDay(),week=d.week||{},n=hmNow();
  const keys=Object.keys(week).sort().filter(k=>k>=today()&&arr(week[k]).length);
  let key=keys.find(k=>k>today()||arr(week[k]).some(b=>b.end>n))||keys[0];
  const list=key?arr(week[key]):DEMO_BLOCKS;
  const isLater=key&&key!==today();
  const real=list.filter(b=>b.vak&&!BREAK_RE.test(b.vak)&&!GYM_RE.test(b.vak));
  const b=(!isLater&&list.find(x=>n>=x.at&&n<x.end&&!BREAK_RE.test(x.vak)))||real.find(x=>arr(x.tasks).length)||real[0]||DEMO_BLOCKS[1];
  curDay={...d,date:today(),blocks:list,week};
  demoN++;
  const dur=Math.max(5,(localTime(b.end)-localTime(b.at))/60000||35);
  state={v:3,sid:'DEMO'+demoN,status:'running',endAt:srvNow()+dur*60000*0.85,total:dur*60000,vak:b.vak,task:b.title||'',doel:b.doel||'',
    tasks:arr(b.tasks).filter(x=>x&&x.t),extra:arr(b.extra).filter(Boolean),sound:true,wordAt:b.at};
  rang=false;mini=null;listSid='';render();renderWeek();
}
function demoAct(a){
  if(a==='live'){DEMO=false;state={status:'idle'};curDay=null;curMsg=null;connect();buildDemoBar();render();renderMsg();return}
  if(!DEMO){DEMO=true;if(T){T.stop();T=null}setConn(true,'Oefenstand');curDay=demoDay();renderWeek()}
  if(a==='start')demoStart();
  else if(a==='bijna'){if(state.status!=='running')demoStart();state={...state,endAt:srvNow()+4*60000+50000};store.del('kt_warned');rang=false}
  else if(a==='om'){if(state.status!=='running')demoStart();state={...state,endAt:srvNow()+3000}}
  else if(a==='pauze'){if(state.status==='running')state={...state,status:'paused',remaining:Math.max(0,state.endAt-srvNow())};else if(state.status==='paused')state={...state,status:'running',endAt:srvNow()+state.remaining}}
  else if(a==='wacht'){state={status:'idle'}}
  else if(a==='pauzeblok'){demoN++;state={v:3,sid:'DEMO'+demoN,status:'running',endAt:srvNow()+12*60000,total:15*60000,vak:'Pauze',task:'',doel:'',tasks:[],extra:[],sound:true,wordAt:''}}
  else if(a==='melding'){curMsg={id:'D'+Date.now(),text:'Kom terug naar de klas',at:srvNow()};renderMsg()}
  buildDemoBar();render();
}
function buildDemoBar(){
  document.body.classList.add('hasdemo');
  let bar=$('demoBar');if(!bar){bar=document.createElement('div');bar.id='demoBar';bar.className='demobar';document.body.append(bar);
    bar.addEventListener('click',e=>{const b=e.target.closest('button');if(b)demoAct(b.dataset.a)})}
  const btn=(a,t,on)=>`<button data-a="${a}"${on?' class="on"':''}>${t}</button>`;
  bar.innerHTML='<b>Leerlingbeeld</b>'+btn('live','Live',!DEMO)+btn('start','Oefenen',DEMO)+
    (DEMO?'<span class="dsep"></span>'+btn('start','Nieuw vak')+btn('bijna','Laatste 5 min')+btn('om','Tijd om')+btn('pauze',state.status==='paused'?'Hervat':'Pauze')+btn('wacht','Tussen vakken')+btn('pauzeblok','Pauzescherm')+btn('melding','Melding'):'');
}

function restoreDay(){try{const d=JSON.parse(store.get('fz_day')||'null');if(d&&d.week&&Object.keys(d.week).some(k=>k>=today())){curDay={opts:d.opts||{},next:d.next||null,date:d.date||'',blocks:arr(d.blocks),week:d.week,auto:d.auto,sound:d.sound,morning:d.morning||null}}}catch(e){}}
function startKid(c){role='kid';code=c;if(!VIEW)restoreDay();if(!VIEW){store.set('kt_kid_code',c);store.set('kt_role','kid')}else{if(!new URLSearchParams(location.search).has('mini'))buildDemoBar();else document.body.classList.add('minimode');$('kLeave').classList.add('hide')}$('kCode').textContent=c;show('kid');offSince=Date.now();render();connect();keepAwake()}

async function startTeacher(){
  store.set('kt_role','teacher');
  if(!USE_FB){
    role='teacher';code=store.get('kt_teacher_code');
    if(!validCode(code||'')){code=newCode();store.set('kt_teacher_code',code)}
    plan=normPlan(readLocalPlan());show('teacher');setupTeacher();connect();return;
  }
  show('login');$('loginErr').textContent='Laden…';
  try{await fbInit()}catch(e){$('loginErr').textContent='Kan de server niet bereiken. Controleer de internetverbinding.';return}
  $('loginErr').textContent='';
  try{await fb.auth.getRedirectResult()}catch(e){$('loginErr').textContent='Inloggen mislukt: '+(e.code||e.message)}
  fb.auth.onAuthStateChanged(async u=>{
    if(role==='teacher'&&fbUser&&u&&u.uid===fbUser.uid)return;
    if(!u||u.isAnonymous){fbUser=null;role=null;show('login');return}
    fbUser=u;role='teacher';
    try{
      const snap=await fb.db.ref('teachers/'+u.uid).once('value');const d=snap.val()||{};
      plan=normPlan(d.plan||readLocalPlan());
      code=d.code;
      if(!validCode(code||'')) code=await claimCode();
      $('tWho').textContent=u.email||u.displayName||'';$('tLogout').classList.remove('hide');
      show('teacher');setupTeacher();connect();
      if(!d.plan)savePlan();
    }catch(e){show('login');$('loginErr').textContent='Laden mislukt: '+(e.code||e.message)+'. Kloppen de databaseregels?'}
  });
}
async function claimCode(){
  for(let n=0;n<5;n++){
    const c=newCode();
    try{await fb.db.ref('klassen/'+c+'/owner').set(fbUser.uid);await fb.db.ref('teachers/'+fbUser.uid+'/code').set(c);return c}catch(e){}
  }
  throw new Error('Geen klascode kunnen maken');
}
$('btnGoogle').addEventListener('click',async()=>{
  $('loginErr').textContent='';
  const p=new firebase.auth.GoogleAuthProvider();
  try{await fb.auth.signInWithPopup(p)}
  catch(e){if(/popup/.test(e.code||'')){try{await fb.auth.signInWithRedirect(p)}catch(e2){$('loginErr').textContent='Inloggen mislukt: '+(e2.code||e2.message)}}
           else $('loginErr').textContent='Inloggen mislukt: '+(e.code||e.message)}
});
$('btnLoginBack').addEventListener('click',()=>{store.del('kt_role');show('home')});
$('tLogout').addEventListener('click',async()=>{if(!await ask({title:'Uitloggen?',ok:'Uitloggen'}))return;T&&T.stop();T=null;fbUser=null;role=null;store.del('kt_role');await fb.auth.signOut();show('home')});

/* =================== planning (vakken + rooster) =================== */
const DEFAULT = {
  'Rekenen':{title:'',doel:'',tasks:[{t:'Instructie aan de instructietafel',m:10},{t:'Basisopdrachten in je werkboek',m:20},{t:'Nakijken en verbeteren',m:5}],extra:'Plusblad rekenen\nRekenspel op de iPad'},
  'Spelling':{title:'',doel:'',tasks:[{t:'Dictee-woorden oefenen',m:10},{t:'Werkboek opdracht 1 t/m 4',m:15}],extra:'Woordzoeker\nLezen in je leesboek'},
  'Taal':{title:'',doel:'',tasks:[{t:'Opdrachten uit het werkboek',m:20}],extra:'Lezen in je leesboek'}
};
const arr = v => Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
const cleanName = s => String(s||'').replace(/[.#$\[\]\/]/g,'').trim().slice(0,30);
function readLocalPlan(){try{return JSON.parse(store.get('kt_plan'))}catch(e){return null}}
function normPlan(p){
  if(!p||typeof p!=='object')p={};
  if(!p.vakken){const old=p;p={vakken:{}};for(const k in old)if(old[k]&&old[k].tasks)p.vakken[cleanName(k)]=old[k]}
  if(!Object.keys(p.vakken).length)p.vakken=JSON.parse(JSON.stringify(DEFAULT));
  for(const k in p.vakken){const v=p.vakken[k]||{};p.vakken[k]={title:v.title||'',doel:v.doel||'',extra:v.extra||'',tasks:arr(v.tasks).map(x=>({t:(x&&x.t)||'',m:+(x&&x.m)||0}))}}
  const r=p.rooster||{};p.rooster={};for(let d=1;d<=5;d++)p.rooster[d]=arr(r[d]).filter(x=>x&&x.at).map(x=>({at:x.at,vak:x.vak||''}));
  p.auto=p.auto!==false;
  p.useWord=p.useWord!==false;
  const ko=p.kidOpts&&typeof p.kidOpts==='object'?p.kidOpts:{};p.kidOpts={calm:ko.calm!==false,week:ko.week!==false};
  const mo=p.morning&&typeof p.morning==='object'?p.morning:{};
  p.morning={on:mo.on!==false,auto:mo.auto!==false,text:typeof mo.text==='string'?mo.text:'Fijn dat je er bent! Begin rustig aan de dag.',
    tasks:typeof mo.tasks==='string'?(mo.v2?mo.tasks:mo.tasks.split('\n').filter(x=>!/jas ophangen/i.test(x)).join('\n')):DEFAULT_MORNING,v2:true,v3:true,v4:true};
  if(!mo.v4)p.morning.tasks=DEFAULT_MORNING; // nieuwe vaste volgorde op verzoek
  if(!mo.v3&&typeof mo.tasks==='string'&&!/ipad/i.test(p.morning.tasks))p.morning.tasks=(p.morning.tasks.trim()?p.morning.tasks.trim()+'\n':'')+'iPad pakken';
  if(p.word&&typeof p.word==='object'){const days={};const src=p.word.days||{};for(const k in src)days[k]=arr(src[k]).filter(b=>b&&b.at);p.word={file:p.word.file||'',at:+p.word.at||0,days,issues:arr(p.word.issues).filter(x=>x&&x.msg),morning:p.word.morning&&typeof p.word.morning==='object'?p.word.morning:{}}}else p.word=null;
  if(!(p.msFile&&p.msFile.id))p.msFile=null;
  return p;
}
let plan, curVak, rDay=Math.min(5,Math.max(1,new Date().getDay()||1)), cloudTimer=null;
function savePlan(){
  store.set('kt_plan',JSON.stringify(plan));store.set('kt_curvak',curVak);
  if(USE_FB&&fbUser){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>fb.db.ref('teachers/'+fbUser.uid+'/plan').set(plan).catch(()=>{}),800)}
}
const V = () => plan.vakken[curVak];
const vakTasks = v => (plan.vakken[v]||{tasks:[]}).tasks.filter(x=>x.t.trim()).map(x=>({t:x.t.trim().slice(0,80),m:Math.max(0,Math.min(240,Math.round(+x.m||0)))}));
const vakExtra = v => ((plan.vakken[v]||{}).extra||'').split('\n').map(s=>s.trim()).filter(Boolean).slice(0,12).map(s=>s.slice(0,80));
const sumMin = v => vakTasks(v).reduce((a,x)=>a+x.m,0);

function renderVakBar(){
  $('tVak').innerHTML='';Object.keys(plan.vakken).forEach(v=>{const o=document.createElement('option');o.value=o.textContent=v;$('tVak').append(o)});
  $('tVak').value=curVak;
  $('tVak2').innerHTML=$('tVak').innerHTML;$('tVak2').value=curVak;$('tTask').value=V().title;$('tDoel').value=V().doel;$('tExtra').value=V().extra;
  renderRows();renderRooster();
}
function renderRows(){
  const box=$('tRows');box.innerHTML='';
  V().tasks.forEach((x,i)=>{
    const r=document.createElement('div');r.className='tr';r.dataset.i=i;
    r.innerHTML='<span class="n"></span><input class="tt" maxlength="80" placeholder="Taak" aria-label="Taak"><div class="mwrap"><input class="tm" type="number" inputmode="numeric" min="0" max="240" aria-label="Minuten"><span>min</span></div><button class="del" aria-label="Verwijder taak">×</button>';
    r.querySelector('.n').textContent=i+1;r.querySelector('.tt').value=x.t;r.querySelector('.tm').value=x.m||'';
    box.append(r);
  });
  const s=sumMin(curVak);$('tSum').textContent=s?'Samen '+minTxt(s):'';
}
let liveTimer=null;
function pushLive(){
  savePlan();
  if(state.status!=='idle'&&state.vak===curVak){clearTimeout(liveTimer);liveTimer=setTimeout(()=>publishState({...state,task:V().title,doel:V().doel,tasks:vakTasks(curVak),extra:vakExtra(curVak)}),700)}
}
let chosenMin=null;
const MINS=[10,15,20,30,45,60];
function markChips(m){[...$('tChips').children].forEach(b=>b.classList.toggle('sel',+b.dataset.m===m))}
function renderChips(){
  const s=sumMin(curVak);const opts=[...new Set([s,...MINS].filter(Boolean))].sort((a,b)=>a-b);
  $('tChips').innerHTML=opts.map(m=>`<button data-m="${m}">${m} min${m===s?' (taken)':''}</button>`).join('');
  markChips(chosenMin!==null?chosenMin:($('tTime').value?null:s));
}

/* rooster */
function renderRooster(){
  $('rDays').innerHTML=DAGEN.slice(1).map((d,i)=>`<button data-d="${i+1}" class="${rDay===i+1?'sel':''}">${d}</button>`).join('');
  const rows=plan.rooster[rDay];rows.sort((a,b)=>a.at.localeCompare(b.at));
  const opts=Object.keys(plan.vakken);
  $('rRows').innerHTML='';
  if(!rows.length){const p=document.createElement('div');p.className='muted small';p.textContent='Nog geen blokken op '+['','maandag','dinsdag','woensdag','donderdag','vrijdag'][rDay]+'.';$('rRows').append(p)}
  rows.forEach((x,i)=>{
    const r=document.createElement('div');r.className='rr';r.dataset.i=i;
    r.innerHTML='<input type="time" class="rt" aria-label="Begintijd"><select class="rv" aria-label="Vak"></select><button class="rdel" aria-label="Verwijder blok">×</button>';
    r.querySelector('.rt').value=x.at;
    const sel=r.querySelector('.rv');opts.forEach(v=>{const o=document.createElement('option');o.value=o.textContent=v+(sumMin(v)?` (${sumMin(v)} min)`:'');o.value=v;sel.append(o)});
    if(!opts.includes(x.vak)){const o=document.createElement('option');o.value=x.vak;o.textContent=x.vak+' (verwijderd)';sel.append(o)}
    sel.value=x.vak;$('rRows').append(r);
  });
  $('rAuto').checked=plan.auto;renderNext();
}
function slotTime(at){const [h,m]=at.split(':').map(Number);const d=new Date();d.setHours(h,m,0,0);return d.getTime()}
const wordToday = () => plan&&plan.useWord&&plan.word&&plan.word.days[today()]&&plan.word.days[today()].length?plan.word.days[today()]:null;
function renderNext(){
  const d=new Date().getDay();const n=Date.now();
  let txt='';
  const w=wordToday();
  if(w){const nx=w.find(b=>slotTime(b.at)>n);txt=nx?`Vandaag volgende (uit Word): ${nx.at} ${nx.vak}`+(plan.auto?' (start vanzelf)':''):'Vandaag geen blokken meer (uit Word).'}
  else if(d>=1&&d<=5){const nx=plan.rooster[d].filter(x=>plan.vakken[x.vak]&&slotTime(x.at)>n).sort((a,b)=>a.at.localeCompare(b.at))[0];
    if(nx)txt=`Vandaag volgende: ${nx.at} ${nx.vak}`+(plan.auto?' (start vanzelf)':'');else txt='Vandaag geen blokken meer.'}
  else txt='Het is weekend.';
  $('rNext').textContent=txt;
}
function autoCheck(){
  if(role!=='teacher'||!plan)return;
  renderWordToday();publishDay();
  if(!plan.auto){renderNext();return}
  const n=Date.now();
  const w=wordToday();
  if(w){
    for(const b of w){
      const t=slotTime(b.at);if(n<t||n-t>3*60000)continue;
      const key=today()+'_w_'+b.at+'_'+b.vak;
      if(state.auto===key||store.get('kt_auto_'+key))continue;
      store.set('kt_auto_'+key,'1');startBlock(b,key,'A'+today().replace(/-/g,'')+b.at.replace(':',''));
    }
  } else {
    const d=new Date().getDay();
    if(d>=1&&d<=5) for(const x of plan.rooster[d]){
      const t=slotTime(x.at);if(n<t||n-t>3*60000||!plan.vakken[x.vak])continue;
      const key=today()+'_'+x.at+'_'+x.vak;
      if(state.auto===key||store.get('kt_auto_'+key))continue;
      store.set('kt_auto_'+key,'1');startVak(x.vak,null,key);
    }
  }
  renderNext();
}

/* =================== dagritme =================== */
let curDay=null, daySig='';
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function weekDates(){ // ma t/m vr van deze week; in het weekend de volgende week
  const d=new Date();let wd=d.getDay();if(wd===6)d.setDate(d.getDate()+2);else if(wd===0)d.setDate(d.getDate()+1);
  wd=d.getDay();d.setDate(d.getDate()-(wd-1));
  return [0,1,2,3,4].map(i=>{const x=new Date(d);x.setDate(d.getDate()+i);return x});
}
function blocksFor(dt){
  const key=ymd(dt);
  if(plan.useWord&&plan.word&&plan.word.days[key]&&plan.word.days[key].length)
    return plan.word.days[key].map(b=>({at:b.at,end:b.end,vak:b.vak,title:b.title||'',doel:(b.doel||'').slice(0,220),tasks:blockTasks(b),extra:blockExtra(b)}));
  const wd=dt.getDay();if(wd<1||wd>5)return [];
  const rows=plan.rooster[wd].filter(x=>x.vak&&x.at).slice().sort((a,b)=>a.at.localeCompare(b.at));
  return rows.map((x,i)=>{let end=addMin(x.at,sumMin(x.vak)||30);if(rows[i+1]&&rows[i+1].at>x.at&&rows[i+1].at<end)end=rows[i+1].at;
    const v=plan.vakken[x.vak]||{};return {at:x.at,end,vak:x.vak,title:v.title||'',doel:(v.doel||'').slice(0,220),tasks:vakTasks(x.vak),extra:vakExtra(x.vak)}});
}
function weekBlocks(){const w={};weekDates().forEach(d=>{w[ymd(d)]=blocksFor(d)});return w}
function todayBlocks(){
  const w=wordToday();
  if(w)return w.map(b=>({at:b.at,end:b.end,vak:b.vak,title:b.title||''}));
  const d=new Date().getDay();if(d<1||d>5)return [];
  const rows=plan.rooster[d].filter(x=>x.vak&&x.at).slice().sort((a,b)=>a.at.localeCompare(b.at));
  return rows.map((x,i)=>{let end=addMin(x.at,sumMin(x.vak)||30);if(rows[i+1]&&rows[i+1].at>x.at&&rows[i+1].at<end)end=rows[i+1].at;
    return {at:x.at,end,vak:x.vak,title:(plan.vakken[x.vak]||{}).title||''}});
}
function nextLessonDay(){ // eerstvolgende dag met lessen na vandaag (tot 3 weken vooruit)
  const d=new Date();for(let i=1;i<=28;i++){d.setDate(d.getDate()+1);const b=blocksFor(d);if(b.length)return {date:ymd(d),at:b[0].at,vak:b[0].vak}}return null}
// ochtendscherm: rij 'Ochtend' uit de dagklapper + vaste taken + taken afgeleid uit de dag
const DEFAULT_MORNING='Huiswerk klaarleggen\niPad pakken\nWerkboeken klaarleggen';
const NOWORKBOOK_RE=/^(hw|huiswerk|stillezen|lezen|bg lezen|kring|spel|bieb|bibliotheek|karakter|seo|dagopening|weekopening|vieren|muziek|tekenen|handvaardigheid)\b/i;
function morningFor(dt){
  const mo=plan.morning;if(!mo.on)return null;
  const key=ymd(dt), wm=plan.word&&plan.useWord&&plan.word.morning&&plan.word.morning[key];
  const bl=blocksFor(dt);
  const les0=bl.find(b=>!BREAK_RE.test(b.vak)&&!GYM_RE.test(b.vak)&&!NOWORKBOOK_RE.test(b.vak));
  const fixed=mo.tasks.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>/^werkboeken klaarleggen$/i.test(x)&&les0?x+' voor '+les0.vak.toLowerCase():x);
  const list=[...(wm?arr(wm.tasks):[]),...fixed];
  const has=re=>list.some(x=>re.test(x));
  if(mo.auto&&bl.length){
    const all=bl.map(b=>(b.vak||'')+' '+(b.title||'')+' '+(b.doel||'')).join(' ');
    if(/huiswerk/i.test(all)&&!has(/huiswerk/i))list.push('Huiswerk op je tafel leggen');
    if(bl.some(b=>GYM_RE.test(b.vak))&&!has(/gym/i))list.push('Gymspullen klaarzetten');
    const f=bl.find(b=>!BREAK_RE.test(b.vak));
    if(f&&/lezen|bookflix/i.test(f.vak+' '+(f.title||''))&&!has(/leesboek/i))list.push('Leesboek op je tafel');
    const les=bl.find(b=>!BREAK_RE.test(b.vak)&&!GYM_RE.test(b.vak)&&!NOWORKBOOK_RE.test(b.vak));
    if(les&&!has(/werkboek/i))list.push('Werkboeken klaarleggen voor '+les.vak.toLowerCase());
  }
  const seen=new Set();const tasks=list.filter(x=>{const k=x.toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,10).map(x=>x.slice(0,80));
  const vandaag=[...new Set(bl.filter(b=>!BREAK_RE.test(b.vak)).map(b=>b.vak))].slice(0,10);
  return {text:((wm&&wm.text)||mo.text||'').slice(0,120),tasks,vandaag};
}
function publishDay(){
  if(role!=='teacher'||!plan||!T)return;
  const mo=morningFor(new Date());
  const nl=nextLessonDay();
  const d={date:today(),blocks:todayBlocks(),week:weekBlocks(),auto:!!plan.auto,sound:$('tSound').checked,next:nl,opts:plan.kidOpts,
    morning:mo};const sig=JSON.stringify(d);
  if(sig===daySig)return;daySig=sig;curDay=d;T.sendDay(d);renderBoardDay();
}
const hmNow = () => {const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
function fillDay(ul,blocks,showTitle=true){
  const n=hmNow();ul.innerHTML='';
  blocks.forEach(b=>{
    const li=document.createElement('li');li.className=n>=b.end?'past':(n>=b.at?'now':'');
    li.innerHTML='<span class="dt"></span><span class="dv"><span></span><small></small></span>';
    li.querySelector('.dt').textContent=b.at;li.querySelector('.dv span').textContent=b.vak;
    const sm=li.querySelector('small');if(showTitle&&b.title)sm.textContent=kidTitle(b.title);else sm.remove();
    ul.append(li);
  });
}
const dayBlocks = () => curDay&&curDay.date===today()?curDay.blocks.filter(b=>b&&b.at):[];
let dayRendered='';
function renderDay(){
  if(role!=='kid')return;
  const blocks=dayBlocks(), live=state.status!=='idle';
  const mo=curDay&&curDay.morning, first=blocks[0];
  const showMorning=!live&&!!mo&&!!first&&hmNow()<first.at;
  const lastB=blocks[blocks.length-1];
  const showEnd=!live&&!!lastB&&hmNow()>=lastB.end;
  const showIdle=!live&&blocks.length>0&&!showMorning&&!(lastB&&hmNow()>=lastB.end);
  const showFree=(!live&&!blocks.length&&!!curDay)||showEnd;
  $('kMorning').classList.toggle('hide',!showMorning);$('kFree').classList.toggle('hide',!showFree);
  $('kDayIdle').classList.toggle('hide',!showIdle);$('kRingWrap').classList.toggle('hide',showIdle||showMorning||showFree);
  if(showFree)renderFree(showEnd);
  $('kid').classList.toggle('ismorning',showMorning);
  if(showMorning)renderMorning(mo,first);
  const key=hmNow()+JSON.stringify(blocks);
  if(key!==dayRendered){dayRendered=key;fillDay($('kDayIdleList'),blocks);fillDay($('kDayList'),blocks)}
  // "Straks"-balk tijdens een vak
  const n=hmNow();const next=blocks.find(b=>b.at>n&&!(state.wordAt&&b.at===state.wordAt));
  const nb=$('kNext');
  const spc=BREAK_RE.test(state.vak||'')||GYM_RE.test(state.vak||'')||(state.status==='running'&&state.endAt<=srvNow());
  if(live&&blocks.length&&!spc){nb.classList.remove('hide');nb.innerHTML='';
    if(next){nb.append('Straks: ');const b=document.createElement('b');b.textContent=next.at+' '+next.vak;nb.append(b)}else nb.textContent='Dit is het laatste blok van vandaag';
  } else nb.classList.add('hide');
  if(!blocks.length)$('kDayOver').classList.add('hide');
}
let morningKey='',mPop=-1;
const fKey = () => 'fz_mfirst_'+today();
const getFTicks = () => {try{return JSON.parse(store.get(fKey())||'[]')}catch(e){return []}};
function renderFree(endOfDay){
  const nx=curDay&&curDay.next;const now=new Date();const wd=now.getDay();
  let title='Vandaag geen lessen',text='';
  if(nx){const [y,m,dd]=nx.date.split('-').map(Number);const dt=new Date(y,m-1,dd);
    const days=Math.round((dt-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/864e5);
    const schoolDaysOff=(()=>{let c=0;const t=new Date(now);for(let i=0;i<days;i++){if(t.getDay()>0&&t.getDay()<6)c++;t.setDate(t.getDate()+1)}return c})();
    const wanneer=days===1?'morgen':DAG[dt.getDay()]+' '+dd+' '+MAAND[m-1];
    if(schoolDaysOff>=3){title='Fijne vakantie!';text='We zien je '+wanneer+' weer. Om '+nx.at+' beginnen we met '+nx.vak+'.'}
    else if(wd===0||wd===6){title='Fijn weekend!';text='We zien je '+wanneer+' weer. Om '+nx.at+' beginnen we met '+nx.vak+'.'}
    else {title='Vandaag geen lessen';text='We zien je '+wanneer+' weer. Om '+nx.at+' beginnen we met '+nx.vak+'.'}
  } else if(wd===0||wd===6){title='Fijn weekend!'}
  if(endOfDay){ // na het laatste blok van vandaag
    const h=now.getHours();title=wd===5?'Fijn weekend!':h<18?'Fijne middag!':'Fijne avond!';
    if(nx){const [y,m,dd]=nx.date.split('-').map(Number);const dt=new Date(y,m-1,dd);const days=Math.round((dt-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/864e5);
      const wanneer=days===1?'Morgen':DAG[dt.getDay()][0].toUpperCase()+DAG[dt.getDay()].slice(1);
      text=wanneer+' beginnen we om '+nx.at+' met '+nx.vak+'.';
      const nb=curDay&&curDay.week&&arr(curDay.week[nx.date]);
      if(nb&&nb.some(b=>/huiswerk/i.test((b.vak||'')+' '+(b.title||'')+' '+(b.doel||''))))text+=' Vergeet je huiswerk niet!';
    } else text='Tot de volgende keer!';
  }
  $('kFreeTitle').textContent=title;$('kFreeText').textContent=text;
}
const mKey = () => 'fz_morning_'+today();
const getMTicks = () => {try{return JSON.parse(store.get(mKey())||'[]')}catch(e){return []}};
function renderMorning(mo,first){
  const vd=arr(mo.vandaag);const vk=vd.join('|');
  if($('kMToday').dataset.k!==vk){$('kMToday').dataset.k=vk;$('kMToday').innerHTML='';
    if(vd.length){const h=document.createElement('span');h.className='mtl';h.textContent='Vandaag:';$('kMToday').append(h);
      vd.forEach(v=>{const c=document.createElement('span');c.className='mtc';c.textContent=v;$('kMToday').append(c)})}}
  $('kMToday').classList.add('hide'); // rustiger: vakken van vandaag staan in de weekplanning
  const h=new Date().getHours();
  $('kMHello').textContent=h<12?'Goedemorgen!':h<18?'Goedemiddag!':'Goedenavond!';
  $('kMText').textContent=mo.text||'';$('kMText').classList.toggle('hide',!mo.text);
  $('kMPrepSec').classList.toggle('hide',!mo.tasks.length);
  $('kMFirstSec').classList.add('hide'); // alleen 'Klaar voor de start?'
  {const d=new Date();$('kMDate').textContent=DAG[d.getDay()]+' '+d.getDate()+' '+MAAND_LANG[d.getMonth()];
   const tk=getMTicks().filter(i=>i<mo.tasks.length).length;$('kMCount').textContent=mo.tasks.length?tk+' van '+mo.tasks.length:'';$('kMCount').classList.toggle('done',tk>=mo.tasks.length&&mo.tasks.length>0)}
  const ticks=getMTicks();
  const key=JSON.stringify(mo.tasks)+ticks.join(',');
  if(key!==morningKey){morningKey=key;const ul=$('kMTasks');ul.innerHTML='';
    mo.tasks.forEach((t,i)=>{const li=document.createElement('li');li.dataset.i=i;li.className=(ticks.includes(i)?'ok':'')+(i===mPop?' popped':'');
      li.innerHTML='<span class="box"></span><span class="mt"></span>';li.querySelector('.box').textContent=ticks.includes(i)?'✓':'';li.querySelector('.mt').textContent=t;ul.append(li)});
    if(mo.tasks.length&&mo.tasks.every((t,i)=>ticks.includes(i))){const li=document.createElement('li');li.className='alldone';li.textContent='Alles klaar. Lekker bezig!';ul.append(li)}
  }
  // het eerste blok uit de dagklapper (bijv. 8:30) groot: waar de dag mee begint
  const wk=curDay&&curDay.week&&arr(curDay.week[today()]);const f=(wk&&wk.find(x=>x.at===first.at))||first;
  const mins=Math.max(0,Math.ceil((localTime(f.at)-Date.now())/60000));
  const fk=JSON.stringify([f.at,f.vak,f.title,f.doel,mins<=90?mins:-1,getFTicks()]);
  if($('kMFirst').dataset.k!==fk){$('kMFirst').dataset.k=fk;const box=$('kMFirst');box.innerHTML='';
    const hd=document.createElement('div');hd.className='mfh';
    const n2=document.createElement('span');n2.className='msn';n2.textContent=$('kMPrepSec').classList.contains('hide')?'1':'2';
    const tm=document.createElement('span');tm.className='mft';tm.textContent='Om '+f.at;const vk=document.createElement('b');vk.textContent=f.vak;hd.append(n2,vk,tm);
    if(mins<=90){const c=document.createElement('span');c.className='mmin';c.textContent=mins<=1?'bijna!':'nog '+mins+' min';hd.append(c)}
    box.append(hd);
    const ti=kidTitle(f.title||'');
    const parts=ti.split(/\s*(?:\+|;|\s&\s)\s*/).map(x=>x.trim()).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1));
    if(parts.length){const ft=getFTicks();const ul=document.createElement('ul');ul.className='mtasks mfrows';ul.id='kMFRows';
      parts.forEach((x,i)=>{const li=document.createElement('li');li.dataset.i=i;li.className=ft.includes(i)?'ok':'';
        li.innerHTML='<span class="box"></span><span class="mt"></span>';li.querySelector('.box').textContent=ft.includes(i)?'✓':'';li.querySelector('.mt').textContent=x;ul.append(li)});box.append(ul)}
    box.classList.toggle('rich',!!(ti||f.doel));
  }
}
$('kMTasks').addEventListener('click',e=>{const li=e.target.closest('li[data-i]');if(!li)return;const i=+li.dataset.i;let t=getMTicks();t=t.includes(i)?t.filter(x=>x!==i):[...t,i];store.set(mKey(),JSON.stringify(t));
  mPop=t.includes(i)?i:-1;renderDay()});
$('kMFirst').addEventListener('click',e=>{const li=e.target.closest('#kMFRows li[data-i]');if(!li)return;const i=+li.dataset.i;let t=getFTicks();t=t.includes(i)?t.filter(x=>x!==i):[...t,i];store.set(fKey(),JSON.stringify(t));renderDay()});
$('kNext').addEventListener('click',()=>{$('kDayOver').classList.remove('hide')});
$('kDayClose').addEventListener('click',()=>$('kDayOver').classList.add('hide'));
/* weekplanning voor de leerling */
const DAGNAAM=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
let weekSel=null;
function renderWeek(){
  if(role!=='kid')return;
  const w=curDay&&curDay.week?curDay.week:{};const keys=Object.keys(w).sort();
  const allowW=!(curDay&&curDay.opts&&curDay.opts.week===false);
  const has=keys.some(k=>arr(w[k]).length)&&allowW;$('kWeekBtn').classList.toggle('hide',!has);
  if(!has){$('kWeekOver').classList.add('hide');return}
  if(!weekSel||!keys.includes(weekSel))weekSel=keys.includes(today())?today():keys[0];
  $('kWeekTabs').innerHTML='';
  keys.forEach(k=>{const [y,m,d]=k.split('-').map(Number);const dt=new Date(y,m-1,d);
    const b=document.createElement('button');b.dataset.k=k;b.className=(k===weekSel?'sel':'')+(k===today()?' today':'');
    b.innerHTML='<span></span><small></small>';b.querySelector('span').textContent=DAGNAAM[dt.getDay()].slice(0,2);b.querySelector('small').textContent=d;
    b.setAttribute('aria-label',DAGNAAM[dt.getDay()]+' '+d);$('kWeekTabs').append(b)});
  const ul=$('kWeekList');ul.innerHTML='';const blocks=arr(w[weekSel]);
  ul.style.setProperty('--rows',Math.max(1,Math.ceil(blocks.length/2)));
  const isToday=weekSel===today(),n=hmNow();
  if(!blocks.length){ul.innerHTML='<li><span class="dt"></span><span class="dv">Nog geen planning</span></li>';return}
  blocks.forEach(b=>{const li=document.createElement('li');li.className=isToday?(n>=b.end?'past':n>=b.at?'now':''):(weekSel<today()?'past':'');
    li.innerHTML='<span class="dt"></span><span class="dv"><span></span><small class="t"></small><small class="d"></small></span>';
    li.querySelector('.dt').textContent=b.at;li.querySelector('.dv span').textContent=b.vak;
    const t=li.querySelector('.t'),d=li.querySelector('.d');if(b.title)t.textContent=b.title;else t.remove();
    if(b.doel)d.textContent='Ik-doel: '+b.doel;else d.remove();ul.append(li)});
}
$('kWeekBtn').addEventListener('click',()=>{weekSel=null;renderWeek();$('kWeekOver').classList.remove('hide')});
$('kWeekTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;weekSel=b.dataset.k;renderWeek()});
$('kWeekClose').addEventListener('click',()=>$('kWeekOver').classList.add('hide'));
$('kWeekOver').addEventListener('click',e=>{if(e.target===$('kWeekOver'))$('kWeekOver').classList.add('hide')});
$('kDayOver').addEventListener('click',e=>{if(e.target===$('kDayOver'))$('kDayOver').classList.add('hide')});

/* =================== dashboard: tabblad Nu =================== */
let kidsInfo=[];
const MAAND=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const DAG=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const n=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-n);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/864e5+1)/7)}
function nextSchoolDay(from){const d=new Date(from||Date.now());do{d.setDate(d.getDate()+1)}while(d.getDay()===0||d.getDay()===6);return d}
const dayName = d => {const t=new Date();const tm=new Date();tm.setDate(t.getDate()+1);
  if(ymd(d)===ymd(t))return 'Vandaag';if(ymd(d)===ymd(tm))return 'Morgen, '+DAG[d.getDay()]+' '+d.getDate()+' '+MAAND[d.getMonth()];return DAG[d.getDay()][0].toUpperCase()+DAG[d.getDay()].slice(1)+' '+d.getDate()+' '+MAAND[d.getMonth()]};
// welk vak loopt er nu (door de leerkracht gestart, of vanzelf volgens het rooster)?
function currentView(){
  const t=state,n=srvNow();
  if((t.status==='running'&&t.endAt>n)||t.status==='paused')return {src:'teacher',s:t};
  if(plan&&plan.auto){
    const b=todayBlocks().find(x=>Date.now()>=localTime(x.at)&&Date.now()<localTime(x.end));
    if(b&&!(t.stoppedAt&&t.stoppedAt-offset>=localTime(b.at))){
      const w=wordToday(),wb=w&&w.find(x=>x.at===b.at&&x.vak===b.vak);
      const sid='A'+today().replace(/-/g,'')+b.at.replace(':','');
      return {src:'auto',s:{v:3,sid,status:'running',endAt:localTime(b.end)+offset,total:localTime(b.end)-localTime(b.at),vak:b.vak,task:b.title||'',
        doel:wb?wb.doel:((plan.vakken[b.vak]||{}).doel||''),tasks:wb?blockTasks(wb):vakTasks(b.vak),extra:wb?blockExtra(wb):vakExtra(b.vak),sound:$('tSound').checked,wordAt:b.at}};
    }
  }
  if(t.status==='running'&&t.endAt<=n&&n-t.endAt<10*60000)return {src:'done',s:t};
  return {src:'none',s:t};
}
function takeOver(){const v=currentView();if(v.src==='auto')publishState(v.s)}
function nextBlock(){
  const n=hmNow();const tb=todayBlocks();const nx=tb.find(b=>b.at>n);
  if(nx)return {b:nx,label:'Straks'};
  const d=nextSchoolDay();const bl=blocksFor(d);
  return bl.length?{b:bl[0],label:dayName(d).split(',')[0]}:null;
}
function renderNow(){
  if(role!=='teacher'||!plan)return;
  const now=new Date();
  $('tClock').textContent=hmNow();
  $('tDate').textContent=DAG[now.getDay()]+' '+now.getDate()+' '+MAAND[now.getMonth()]+' · week '+isoWeek(now);
  const v=currentView(),s=v.s,n=srvNow();
  const active=v.src==='teacher'||v.src==='auto';
  const rem=s.status==='paused'?s.remaining:(s.endAt||0)-n,total=s.total||1;
  const warn=active&&rem<=5*60000&&rem<total;
  const card=$('nCard');card.classList.toggle('warn',warn);card.classList.toggle('done',v.src==='done');card.classList.toggle('paused',s.status==='paused'&&active);
  $('nActive').classList.toggle('hide',!(active||v.src==='done'));$('nIdle').classList.toggle('hide',active||v.src==='done');
  $('nLabel').textContent=v.src==='done'?'Tijd is om':s.status==='paused'&&active?'Gepauzeerd':'Nu';$('nLabel').classList.toggle('hide',!(active||v.src==='done'));
  $('nSrc').textContent=v.src==='auto'?'Gestart volgens rooster':v.src==='teacher'?(s.auto||s.wordAt?'Gestart volgens rooster':'Zelf gestart'):'';
  const nb=nextBlock();
  if(active||v.src==='done'){
    $('nVak').textContent=s.vak||'';$('nTitle').textContent=s.task||'';$('nTitle').classList.toggle('hide',!s.task);
    $('nDoelTxt').textContent=s.doel||'';$('nDoel').classList.toggle('hide',!s.doel);
    $('nBig').textContent=v.src==='done'?'00:00':fmt(rem);
    $('nEnd').textContent=s.status==='paused'?'staat stil':v.src==='done'?'':'tot '+clock(s.endAt-offset);
    $('nBar').style.width=(v.src==='done'?0:Math.max(0,Math.min(1,rem/total))*100)+'%';
    $('nCtl').classList.toggle('hide',v.src==='done');$('tPause').textContent=s.status==='paused'?'Hervat':'Pauze';$('tMin').disabled=s.status==='running'&&rem<6*60000;
    // voortgang van de klas
    const tasks=arr(s.tasks).filter(x=>x&&x.t);const here=kidsInfo.filter(k=>k.sid===s.sid);
    const pr=$('nProg');pr.innerHTML='';
    if(tasks.length){
      const h=document.createElement('div');h.className='nph';h.textContent=here.length?`Voortgang van ${here.length} iPad${here.length===1?'':'s'}`:'Voortgang verschijnt zodra iPads afvinken';pr.append(h);
      tasks.slice(0,6).forEach((x,i)=>{const c=here.filter(k=>k.ticks.includes(i)).length;const pct=here.length?c/here.length*100:0;
        const r=document.createElement('div');r.className='npr';r.innerHTML='<span class="t"></span><span class="b"><i></i></span><span class="c"></span>';
        r.querySelector('.t').textContent=(i+1)+'. '+x.t;r.querySelector('i').style.width=pct+'%';r.querySelector('.c').textContent=here.length?c+'/'+here.length:'';pr.append(r)});
    }
  } else {
    const tb=todayBlocks(),hm=hmNow();
    $('nIdleTxt').textContent=!tb.length?'Geen lessen vandaag':hm<tb[0].at?'Goedemorgen':hm>=tb[tb.length-1].end?'Klaar voor vandaag':'Geen vak actief';
  }
  // na dit vak / straks
  if(nb){$('nAfter').innerHTML='';const sp=document.createElement('span');sp.textContent=nb.label+': ';const b=document.createElement('b');b.textContent=nb.b.at+' '+nb.b.vak;
    $('nAfter').append(sp,b);if(nb.b.title){const t=document.createElement('span');t.className='muted';t.textContent=' · '+nb.b.title;$('nAfter').append(t)}
    $('nNext').textContent=plan.auto?'Het volgende blok start vanzelf op de iPads.':'Automatisch starten staat uit. Start het volgende blok zelf.';}
  else {$('nAfter').textContent='Geen rooster gevonden voor de komende dagen.';$('nNext').textContent='Koppel je dagklapper bij Word & rooster.'}
  renderStatus();renderDayCard();
  renderBoardFrom(v);
}
function ago(ms){const m=Math.round(ms/60000);if(m<1)return 'net';if(m<60)return m+' min geleden';const h=Math.round(m/60);if(h<24)return h+' uur geleden';const d=Math.round(h/24);return d===1?'gisteren':d+' dagen geleden'}
let statKey='';
function renderStatus(){
  const items=[],warns=[];
  const nk=kidsInfo.length;
  items.push([nk?'ok':'off',nk===1?'1 iPad verbonden':nk+' iPads verbonden']);
  if(!connected)items.push(['bad','Geen verbinding met de server']);
  if(plan.word){const age=Date.now()-plan.word.at;const auto=(fileHandle&&filePerm==='granted')||plan.msFile;
    items.push([age>2*864e5?'warn':'ok',`Dagklapper ${ago(age)} ingelezen`+(auto?' · automatisch':'')]);
    if(age>2*864e5)warns.push('Je dagklapper is al '+ago(age).replace(' geleden','')+' niet ingelezen. Klopt de planning nog?');
    else if(!auto&&todayBlocks().length&&new Date(plan.word.at).toDateString()!==new Date().toDateString())warns.push('Je dagklapper is vandaag nog niet ingelezen en wordt niet automatisch bijgewerkt. Lees hem in bij Rooster.');
    const soon=plan.word.issues.filter(x=>x.date===today()||x.date===ymd(nextSchoolDay()));if(soon.length)warns.push('Je dagklapper heeft '+(soon.length===1?'een punt':soon.length+' punten')+' om te controleren voor vandaag of morgen (zie Rooster).');
    if(fileHandle&&filePerm!=='granted')warns.push('Klik bij Word & rooster op "Toegang geven" om automatisch bijwerken weer aan te zetten.');
    const nd=nextSchoolDay();if(!plan.word.days[ymd(nd)]&&!(plan.rooster[nd.getDay()]||[]).length)warns.push(dayName(nd).split(',')[0]+' ('+DAG[nd.getDay()]+' '+nd.getDate()+' '+MAAND[nd.getMonth()]+') staat niet in je dagklapper.');
  } else {items.push(['warn','Geen dagklapper gekoppeld']);warns.push('Koppel je dagklapper bij Word & rooster, dan starten de vakken vanzelf.')}
  const wd=weekDates();const has=wd.filter(d=>blocksFor(d).length);
  if(daySig&&has.length)items.push(['ok','Weekplanning op de iPads t/m '+DAG[has[has.length-1].getDay()].slice(0,2)+' '+has[has.length-1].getDate()+' '+MAAND[has[has.length-1].getMonth()]]);
  if(!plan.auto)items.push(['warn','Automatisch starten staat uit']);
  const key=JSON.stringify([items,warns]);if(key===statKey)return;statKey=key;
  const lvl=items.some(x=>x[0]==='bad')?'bad':(warns.length||items.some(x=>x[0]==='warn'))?'warn':nk?'ok':'off';
  const nw=warns.length+items.filter(x=>x[0]==='bad').length;
  $('sPill').className='spill '+lvl;
  $('sPillTxt').textContent=(nk===1?'1 iPad':nk+' iPads')+' · '+(nw?(nw===1?'1 aandachtspunt':nw+' aandachtspunten'):'alles in orde');
  $('sList').innerHTML='';items.forEach(([c,t])=>{const li=document.createElement('li');li.className=c;li.textContent=t;$('sList').append(li)});
  $('sWarn').innerHTML='';warns.forEach(t=>{const d=document.createElement('div');d.textContent=t;$('sWarn').append(d)});
}
let dayKey='';
function renderDayCard(){
  let d=new Date();let bl=todayBlocks();const n=hmNow();
  if(!bl.length||n>=bl[bl.length-1].end){d=nextSchoolDay();bl=blocksFor(d)}
  const isToday=ymd(d)===today();const v=currentView();
  const key=ymd(d)+n+JSON.stringify(bl)+v.src+(v.s.wordAt||'')+v.s.vak+showPast;if(key===dayKey)return;dayKey=key;
  const nPast=isToday?bl.filter(b=>n>=b.end).length:0;
  $('dPast').textContent=nPast?(showPast?'Verberg eerdere blokken':'Eerdere blokken ('+nPast+')'):'';$('dPast').classList.toggle('hide',!nPast);
  $('dHead').textContent=dayName(d);
  const ul=$('dList');ul.innerHTML='';
  if(!bl.length){ul.innerHTML='<li class="empty">Geen rooster. Koppel je dagklapper of vul het weekrooster in.</li>';return}
  const nextI=isToday?bl.findIndex(b=>b.at>n):0;
  bl.forEach((b,i)=>{
    const li=document.createElement('li');
    const isNow=isToday&&n>=b.at&&n<b.end, past=isToday&&n>=b.end, isNext=i===nextI&&!isNow;
    li.className=isNow?'now':past?'past':isNext?'next':'';if(past&&!showPast)return;
    li.innerHTML='<span class="dt"></span><span class="dv"><b></b><small></small></span><span class="dx"></span>';
    li.querySelector('.dt').textContent=b.at;li.querySelector('b').textContent=b.vak;
    const sm=li.querySelector('small');if(b.title)sm.textContent=b.title;else sm.remove();
    const x=li.querySelector('.dx');
    if(isNow){x.innerHTML='<span class="tag">nu</span>'}
    else if(isNext&&isToday){const bt=document.createElement('button');bt.textContent='Nu starten';bt.onclick=()=>{const w=wordToday(),wb=w&&w.find(y=>y.at===b.at&&y.vak===b.vak);
      if(wb)startBlock(wb);else{curVak=plan.vakken[b.vak]?b.vak:curVak;startVak(b.vak,null)}};x.append(bt)}
    else if(isNext){x.innerHTML='<span class="tag soft">eerste</span>'}
    ul.append(li);
  });
  const nw=ul.querySelector('.now')||ul.querySelector('.next'),pp=ul.closest('.grow');if(nw&&pp)pp.scrollTop=Math.max(0,nw.offsetTop-pp.offsetTop-110);
}
// mini leerlingbeeld
let miniOn=false;
function startMiniView(){
  if(miniOn||!code)return;miniOn=true;
  const f=document.createElement('iframe');f.src=location.origin+location.pathname+'?klas='+code+'&kijk=1&mini=1';f.title='Klein leerlingbeeld';f.tabIndex=-1;
  $('sMiniFrame').append(f);
}
function closePops(){['sPop','mPop'].forEach(id=>$(id).classList.add('hide'));$('sPill').setAttribute('aria-expanded','false')}
function togglePop(id,btn){const open=$(id).classList.contains('hide');closePops();if(open){$(id).classList.remove('hide');btn.setAttribute('aria-expanded','true');
  const r=btn.getBoundingClientRect();$(id).style.top=(r.bottom+8)+'px';$(id).style.right=Math.max(12,innerWidth-r.right)+'px';
  if(id==='mPop')setTimeout(()=>$('mText2').focus(),50)}}
$('sPill').addEventListener('click',e=>{e.stopPropagation();togglePop('sPop',$('sPill'))});
$('mBtn').addEventListener('click',e=>{e.stopPropagation();togglePop('mPop',$('mBtn'))});
document.addEventListener('click',e=>{if(!e.target.closest('.pop'))closePops()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePops()});
let showPast=false;
$('dPast').addEventListener('click',()=>{showPast=!showPast;dayKey='';renderDayCard()});
$('qToggle').addEventListener('click',()=>{const h=$('qBox').classList.toggle('hide');$('qToggle').setAttribute('aria-expanded',String(!h));$('qToggle').textContent=h?'Zelf een timer starten':'Sluiten'});

/* =================== digibord =================== */
let boardDayKey='';
function renderBoardDay(){
  if($('board').classList.contains('hide'))return;
  const blocks=curDay&&curDay.date===today()?curDay.blocks:todayBlocks();
  const key=hmNow()+JSON.stringify(blocks);if(key===boardDayKey)return;boardDayKey=key;
  fillDay($('bDay'),blocks);
  if(!blocks.length)$('bDay').innerHTML='<li><span class="dt"></span><span class="dv">Geen rooster voor vandaag</span></li>';
}
function renderBoardFrom(v){
  const s=v.s,n=srvNow(),active=v.src==='teacher'||v.src==='auto';
  const rem=s.status==='paused'?s.remaining:(s.endAt||0)-n,total=s.total||1,done=v.src==='done';
  const warn=active&&rem<=5*60000&&rem<total;
  const big=done?'Tijd is om!':active?fmt(rem):'Even wachten';
  const sub=done?'Leg je spullen neer en kijk naar voren':s.status==='paused'?'De timer staat even stil':warn?'Nog even! Rond je werk af':active?'Werk rustig door':'';
  const save=state;state=active||done?s:{status:'idle'};
  renderBoard(rem,total,done,warn,big,sub,active&&s.status==='running'?'Klaar om '+clock(s.endAt-offset):'');
  state=save;
}
function renderBoard(rem,total,done,warn,big,sub,endTxt){
  if($('board').classList.contains('hide'))return;
  const b=$('board'),live=state.status!=='idle';
  b.classList.toggle('warn',warn);b.classList.toggle('done',done);b.classList.toggle('idle',!live||done);
  $('bVak').textContent=state.vak||'';$('bVak').classList.toggle('hide',!live||!state.vak);
  $('bTask').textContent=live?(state.task||''):'';
  $('bDoelTxt').textContent=state.doel||'';$('bDoel').classList.toggle('hide',!live||!state.doel);
  $('bBig').textContent=!live?'Even wachten':big;
  $('bSub').textContent=!live?'':[sub,endTxt].filter(Boolean).join(' · ');
  $('bBar').style.width=(!live?0:done?0:Math.max(0,Math.min(1,rem/total))*100)+'%';
  // tussen de vakken: grote QR-code zodat kinderen zelf hun iPad koppelen
  // voor het eerste blok: ochtendscherm groot op het digibord
  const tb=todayBlocks(),mo=plan&&tb.length&&!live&&hmNow()<tb[0].at?morningFor(new Date()):null;
  $('bMorning').classList.toggle('hide',!mo);
  if(mo){$('bMText').textContent=mo.text||'';const k=JSON.stringify(mo.tasks);if($('bMList').dataset.k!==k){$('bMList').dataset.k=k;$('bMList').innerHTML='';
      mo.tasks.forEach(t=>{const li=document.createElement('li');li.textContent=t;$('bMList').append(li)})}
    const ms=Math.max(0,localTime(tb[0].at)-Date.now()),m=Math.ceil(ms/60000);
    $('bMFirst').textContent='Om '+tb[0].at+' begint '+tb[0].vak;$('bMMin').textContent=m<=1?'bijna!':'nog '+m+' min';
    $('bMBar').style.width=(Math.max(0,Math.min(1,1-ms/(30*60000)))*100)+'%';   // vult zich in het laatste halfuur
    const nw=new Date();$('bMClock').textContent=hmNow();$('bMDate').textContent=DAG[nw.getDay()]+' '+nw.getDate()+' '+MAAND_LANG[nw.getMonth()];
    $('bVak').classList.add('hide');$('bTask').textContent='';$('bDoel').classList.add('hide');}
  const between=(!live||done)&&!mo;$('bJoin').classList.toggle('hide',!between);$('bFJoin').classList.toggle('hide',between);$('bBig').classList.toggle('hide',!live);$('bBar').parentElement.classList.toggle('hide',between);
  if(!live&&!mo){const nb=nextBlock();$('bTask').textContent=nb?nb.label+': '+nb.b.at+' '+nb.b.vak:'';}
  if(mo)$('bBar').parentElement.classList.add('hide');
  renderBoardDay();
}
$('tBoard').addEventListener('click',()=>{
  show('board');$('bCode').textContent=code;
  try{const q=qrcode(0,'M');q.addData(location.origin+location.pathname+'?klas='+code);q.make();const svg=q.createSvgTag({cellSize:3,margin:1,scalable:true});$('bQr').innerHTML=svg;$('bJoinQr').innerHTML=svg}catch(e){}
  $('bJoinCode').textContent=code;
  boardDayKey='';render();
  try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{})}catch(e){}
});
$('bBack').addEventListener('click',()=>{try{document.fullscreenElement&&document.exitFullscreen()}catch(e){}show('teacher');render()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('board').classList.contains('hide'))$('bBack').click()});

/* =================== Word (dagklapper) =================== */
const MAANDEN=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const W_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function wText(el){ // tekst van een cel, zonder geneste tabellen
  let out='';
  (function walk(n){for(const c of n.childNodes){if(c.nodeType!==1)continue;const ln=c.localName;
    if(ln==='tbl')continue;
    if(ln==='t')out+=c.textContent;else if(ln==='tab')out+=' ';else if(ln==='br'||ln==='cr')out+='\n';
    else{walk(c);if(ln==='p')out+='\n'}}})(el);
  return out.replace(/ /g,' ').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n+/g,'\n').trim();
}
const kids = (el,name) => [...el.childNodes].filter(c=>c.nodeType===1&&c.localName===name);
function dateFromHeader(txt,ref){
  const m=txt.toLowerCase().match(new RegExp('(\\d{1,2})\\s+('+MAANDEN.join('|')+')'));if(!m)return null;
  const day=+m[1], mon=MAANDEN.indexOf(m[2]);
  const r=ref||new Date(); const start=r.getMonth()>=7?r.getFullYear():r.getFullYear()-1; // schooljaar start in augustus
  const y=mon>=7?start:start+1;
  return `${y}-${pad(mon+1)}-${pad(day)}`;
}
const toHM = s => {const m=String(s).match(/(\d{1,2})[.:](\d{2})/);return m?`${pad(+m[1])}:${m[2]}`:null};
const addMin = (hm,mins) => {const [h,m]=hm.split(':').map(Number);const t=h*60+m+mins;return `${pad(Math.floor(t/60)%24)}:${pad(t%60)}`};
// "Instructie (10 min); Werkboek opdr. 1-4 (15 min)" -> taken met minuten
const MIN_RE=/\(?\s*(\d{1,3})\s*(?:min(?:uten|uut)?|m)\.?\s*\)?\s*$/i;
function splitTasks(txt){
  const parts=txt.split(/\s*(?:;|\n|\s•\s)\s*/).map(x=>x.replace(/^[-–•*]\s*/,'').trim()).filter(Boolean);
  if(!parts.some(x=>MIN_RE.test(x)&&x.replace(MIN_RE,'').trim()))return {title:txt,tasks:[]};
  const tasks=[],rest=[];
  parts.forEach(x=>{const m=x.match(MIN_RE);const t=x.replace(MIN_RE,'').replace(/[\s,:–-]+$/,'').trim();
    if(m&&t)tasks.push({t:t.slice(0,80),m:Math.min(240,+m[1])});else if(tasks.length)tasks.push({t:x.slice(0,80),m:0});else rest.push(x)});
  return {title:rest.join(' · '),tasks:tasks.slice(0,15)};
}
function shortTitle(s){
  s=s.replace(/\n/g,' ').trim();if(s.length<=90)return s;
  const dot=s.indexOf('. ');if(dot>10&&dot<=90)return s.slice(0,dot+1);
  return s.slice(0,87).replace(/\s+\S*$/,'')+'…';
}
let parseIssues=[],parseMorning={};
const MAAND_LANG=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const MORNING_RE=/^(ochtend|ochtendtaken|inloop|binnenkomst|welkom|dagstart)$/i;
async function parseDocx(buf){
  if(typeof JSZip==='undefined')await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
  const zip=await JSZip.loadAsync(buf);
  const f=zip.file('word/document.xml');if(!f)throw new Error('Dit lijkt geen Word-bestand (.docx).');
  const xml=new DOMParser().parseFromString(await f.async('string'),'application/xml');
  const days={};parseIssues=[];parseMorning={};
  for(const tbl of xml.getElementsByTagNameNS(W_NS,'tbl')){
    const rows=kids(tbl,'tr');if(rows.length<3)continue;
    const cellsOf=tr=>kids(tr,'tc').map(wText);
    const head=cellsOf(rows[0]).join(' '), hdr=cellsOf(rows[1]).map(s=>s.toLowerCase());
    if(!/tijd/.test(hdr[0]||'')||!hdr.some(h=>/vak/.test(h)))continue;
    const date=dateFromHeader(head);if(!date)continue;
    const iV=hdr.findIndex(h=>/vak/.test(h)), iL=hdr.findIndex(h=>/leerstof/.test(h)), iD=hdr.findIndex(h=>/lesdoel|doel/.test(h));
    const blocks=[];
    for(const tr of rows.slice(2)){
      const c=cellsOf(tr);const at=toHM(c[0]||'');const vak=cleanName((c[iV]||'').split('\n')[0]);
      if(MORNING_RE.test(vak)){ // geen timerblok: dit zijn de ochtendtaken van die dag
        const tasks=(iL>=0?(c[iL]||''):'').split(/\s*(?:;|\n)\s*/).map(x=>x.replace(/^[-–•*]\s*/,'').trim()).filter(Boolean).slice(0,10).map(x=>x.slice(0,80));
        parseMorning[date]={tasks,text:(iD>=0?(c[iD]||''):'').replace(/\n/g,' ').slice(0,120)};continue;}
      if(!at&&vak&&!/^tijd$/i.test(vak))parseIssues.push({date,msg:vak+': geen begintijd gevonden'});
      if(!at||!vak)continue;
      let leer=iL>=0?(c[iL]||''):'', klaar='';
      const km=leer.match(/^(.*?)\s*[–—-]?\s*klaar\s*:\s*(.+)$/is);if(km){leer=km[1].replace(/[\s–—-]+$/,'');klaar=km[2].trim()}
      if(blocks.length&&blocks[blocks.length-1].at===at&&blocks[blocks.length-1].vak===vak)continue; // dubbele rij
      const lt=splitTasks(leer);
      blocks.push({at,vak,title:shortTitle(lt.title),doel:(iD>=0?(c[iD]||''):'').replace(/\n/g,' ').slice(0,220),klaar:klaar.slice(0,200),tasks:lt.tasks});
    }
    blocks.sort((a,b)=>a.at.localeCompare(b.at));
    blocks.forEach((b,i)=>{b.end=blocks[i+1]&&blocks[i+1].at>b.at?blocks[i+1].at:addMin(b.at,45)});
    blocks.forEach(b=>{const sm=b.tasks.reduce((a,x)=>a+x.m,0);const dur=(localTime(b.end)-localTime(b.at))/60000;
      if(sm>dur)parseIssues.push({date,msg:`${b.at} ${b.vak}: taken samen ${sm} min, het blok duurt ${Math.round(dur)} min`})});
    if(blocks.length)days[date]=blocks;else parseIssues.push({date,msg:'geen blokken gevonden in de tabel'});
  }
  return days;
}
function keepDays(days){ // bewaar gisteren t/m 3 weken vooruit
  const lo=new Date();lo.setDate(lo.getDate()-1);const hi=new Date();hi.setDate(hi.getDate()+21);
  const f=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;const a=f(lo),b=f(hi);
  const out={};for(const k in days)if(k>=a&&k<=b)out[k]=days[k];return out;
}
async function importWord(buf,fileName){
  const all=await parseDocx(buf);
  const n=Object.keys(all).length;if(!n)throw new Error('Geen dagtabellen gevonden (kolommen Tijd, Vak, Leerstof, Lesdoel).');
  const kd=keepDays(all),last=Object.keys(kd).sort().pop()||today();
  const km={};for(const k in parseMorning)if(kd[k]||(k>=today()&&k<=last))km[k]=parseMorning[k];
  plan.word={file:fileName||'Word-bestand',at:Date.now(),days:kd,morning:km,issues:parseIssues.filter(x=>x.date>=today()&&x.date<=last).slice(0,20)};
  savePlan();renderWordToday();renderNext();renderMorningPrev();
  // lopend vak bijwerken als de leerstof of het doel is veranderd
  const w=wordToday();if(w&&state.status!=='idle'&&state.wordAt){const b=w.find(x=>x.at===state.wordAt&&x.vak===state.vak);
    if(b&&(b.title!==state.task||b.doel!==state.doel||JSON.stringify(blockTasks(b))!==JSON.stringify(state.tasks||[])))publishState({...state,task:b.title,doel:b.doel,tasks:blockTasks(b),extra:blockExtra(b)})}
  return n;
}
const blockExtra = b => [...(b.klaar?b.klaar.split(/\s*;\s*/).filter(Boolean).map(x=>x.slice(0,80)):[]),...vakExtra(b.vak)].slice(0,12);
const blockTasks = b => {const t=arr(b.tasks).filter(x=>x&&x.t);return t.length?t:vakTasks(b.vak)};
function startBlock(b,autoKey,sid){
  const t=srvNow();let endAt=slotTime(b.end)+offset;
  if(endAt<=t+60000)endAt=t+(sumMin(b.vak)||30)*60000;
  publishState({v:3,sid:sid||newCode(),status:'running',endAt,total:endAt-Math.min(t,slotTime(b.at)+offset),vak:b.vak,task:b.title||'',doel:b.doel||'',
    tasks:blockTasks(b),extra:blockExtra(b),sound:$('tSound').checked,auto:autoKey||'',wordAt:b.at});
}
let checkKey='';
function renderCheck(){
  if(!plan||!plan.word){$('wCheck').innerHTML='';checkKey='';return}
  const fmtD=k=>{const [y,m,d]=k.split('-').map(Number);const dt=new Date(y,m-1,d);return DAG[dt.getDay()].slice(0,2)+' '+d+' '+MAAND[m-1]};
  const up=Object.keys(plan.word.days).filter(k=>k>=today()).sort();
  const iss=plan.word.issues.filter(x=>x.date>=today());
  const key=JSON.stringify([up,iss]);if(key===checkKey)return;checkKey=key;
  const box=$('wCheck');box.innerHTML='';
  const head=document.createElement('div');head.className='wcok'+(iss.length?' warn':'');
  head.textContent=iss.length?`Gelezen: ${up.length} lesdagen. Controleer ${iss.length===1?'dit punt':'deze '+iss.length+' punten'}:`:`Alles goed gelezen: ${up.length} lesdagen${up.length?' (t/m '+fmtD(up[up.length-1])+')':''}.`;
  box.append(head);
  if(iss.length){const ul=document.createElement('ul');iss.slice(0,6).forEach(x=>{const li=document.createElement('li');const b=document.createElement('b');b.textContent=fmtD(x.date)+' · ';li.append(b,x.msg);ul.append(li)});box.append(ul)}
}
function renderWordToday(){
  if(!plan)return;renderCheck();
  $('wUse').checked=plan.useWord;
  const st=plan.word?`Ingelezen om ${clock(plan.word.at)} uit "${plan.word.file}"`+(plan.msFile?' · werkt elke 10 minuten bij':(fileHandle&&filePerm==='granted'?' · werkt automatisch bij':'')):'Nog geen Word-bestand ingelezen.';
  $('wStatus').textContent=st;
  const box=$('wToday');box.innerHTML='';
  if(!plan.word)return;
  const w=plan.word.days[today()];
  if(!w||!w.length){const p=document.createElement('div');p.className='muted small';p.textContent='Voor vandaag staat er geen dag in je Word-bestand.';box.append(p);return}
  const n=Date.now();
  w.forEach((b,i)=>{
    const r=document.createElement('div');const s=slotTime(b.at),e=slotTime(b.end);
    r.className='wb'+(n>=s&&n<e?' now':n>=e?' past':'');
    r.innerHTML='<span class="wt"></span><span class="wv"><span></span><small></small></span><button data-i="'+i+'">Start</button>';
    r.querySelector('.wt').textContent=b.at+'–'+b.end;r.querySelector('.wv span').textContent=b.vak;r.querySelector('.wv small').textContent=b.title||'';
    box.append(r);
  });
  const nw=box.querySelector('.now'),pp=box.closest('.grow');if(nw&&pp&&!pp.dataset.scrolled){pp.dataset.scrolled='1';pp.scrollTop=Math.max(0,nw.offsetTop-pp.offsetTop-90)}
}
$('wToday').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const w=plan.word&&plan.word.days[today()];if(w&&w[+b.dataset.i])startBlock(w[+b.dataset.i])});
$('wUse').addEventListener('change',()=>{plan.useWord=$('wUse').checked;savePlan();renderNext()});
$('wPick').addEventListener('click',()=>$('wFile').click());
$('wFile').addEventListener('change',async()=>{
  const f=$('wFile').files[0];if(!f)return;$('wStatus').textContent='Inlezen…';
  try{const n=await importWord(await f.arrayBuffer(),f.name);$('wStatus').textContent+=` · ${n} dagen gevonden`}
  catch(e){$('wStatus').textContent='Inlezen mislukt: '+e.message}
  $('wFile').value='';
});

/* ---- automatisch via OneDrive (Microsoft Graph) ---- */
const MS_SCOPES=['Files.Read','User.Read'];
let msal=null, msAccount=null, msLastMod='';
const msClientId = () => window.FOCUZ_MS_CLIENT_ID || store.get('fz_ms_client') || '';
async function msInit(){
  if(msal)return msal;
  if(!msClientId())return null;
  if(typeof window.msal==='undefined')await loadScript('https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.39.0/lib/msal-browser.min.js');
  msal=new window.msal.PublicClientApplication({auth:{clientId:msClientId(),authority:'https://login.microsoftonline.com/common',redirectUri:location.origin+location.pathname},cache:{cacheLocation:'localStorage'}});
  try{const r=await msal.handleRedirectPromise();if(r&&r.account)msAccount=r.account}catch(e){}
  msAccount=msAccount||msal.getAllAccounts()[0]||null;
  return msal;
}
async function msToken(){
  await msInit();if(!msal||!msAccount)throw new Error('Niet ingelogd bij Microsoft');
  try{return (await msal.acquireTokenSilent({scopes:MS_SCOPES,account:msAccount})).accessToken}
  catch(e){return (await msal.acquireTokenPopup({scopes:MS_SCOPES,account:msAccount})).accessToken}
}
async function graph(path){
  const r=await fetch('https://graph.microsoft.com/v1.0'+path,{headers:{Authorization:'Bearer '+await msToken()}});
  if(!r.ok)throw new Error('Microsoft gaf fout '+r.status);return r.json();
}
async function msRefresh(force){
  if(!plan||!plan.msFile)return;
  try{
    await msInit();if(!msAccount){renderMs();return}
    const f=plan.msFile;const p=f.driveId?`/drives/${f.driveId}/items/${f.id}`:`/me/drive/items/${f.id}`;
    const it=await graph(p);
    if(!force&&it.lastModifiedDateTime===msLastMod&&plan.word)return;
    const url=it['@microsoft.graph.downloadUrl'];if(!url)throw new Error('Geen downloadlink');
    const buf=await (await fetch(url)).arrayBuffer();
    await importWord(buf,it.name);msLastMod=it.lastModifiedDateTime;
  }catch(e){$('wStatus').textContent='Bijwerken uit OneDrive mislukt: '+e.message}
}
async function renderMs(){
  const box=$('wMsBox');box.innerHTML='';
  const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt)e.textContent=txt;if(cls)e.className=cls;box.append(e);return e};
  if(!msClientId()){
    el('div','Om je Word-bestand automatisch uit OneDrive te halen, heeft Focuz eenmalig een app-registratie bij Microsoft nodig. Volg de stappen in de README en plak hier de Client-ID.','small');
    const i=el('input');i.placeholder='Application (client) ID';i.style.marginTop='10px';
    const b=el('button','Opslaan','primary');b.style.marginTop='10px';
    b.onclick=()=>{const v=i.value.trim();if(!/^[0-9a-f-]{36}$/i.test(v)){i.style.borderColor='var(--stop)';return}store.set('fz_ms_client',v);renderMs()};
    return;
  }
  try{await msInit()}catch(e){el('div','Microsoft-login kon niet laden.','err');return}
  if(!msAccount){
    el('div','Log in met het Microsoft-account waar je dagklapper in OneDrive staat.','small');
    const b=el('button','Inloggen met Microsoft','primary');b.style.marginTop='10px';
    b.onclick=async()=>{try{const r=await msal.loginPopup({scopes:MS_SCOPES});msAccount=r.account;renderMs();msRefresh(true)}
      catch(e){if(/popup/i.test(e.errorCode||e.message||''))msal.loginRedirect({scopes:MS_SCOPES});else el('div','Inloggen mislukt: '+(e.errorMessage||e.message),'err')}};
    return;
  }
  el('div','Ingelogd als '+(msAccount.username||msAccount.name),'small');
  if(plan.msFile){
    el('div','Bestand: '+plan.msFile.name+'. Focuz haalt het elke 10 minuten op zolang dit scherm open staat.','small');
    const row=el('div','','row');
    const b1=document.createElement('button');b1.textContent='Nu bijwerken';b1.onclick=()=>{$('wStatus').textContent='Bijwerken…';msRefresh(true)};
    const b2=document.createElement('button');b2.textContent='Ander bestand';b2.onclick=()=>{plan.msFile=null;savePlan();renderMs()};
    const b3=document.createElement('button');b3.textContent='Uitloggen';b3.className='link';b3.onclick=async()=>{const a=msAccount;msAccount=null;plan.msFile=null;savePlan();try{await msal.logoutPopup({account:a})}catch(e){}renderMs();renderWordToday()};
    row.append(b1,b2,b3);return;
  }
  const i=el('input');i.value='Planning dagklapper';i.style.marginTop='10px';i.setAttribute('aria-label','Zoek je bestand');
  const b=el('button','Zoek in OneDrive','primary');b.style.marginTop='10px';
  const res=el('div','','res');
  b.onclick=async()=>{res.textContent='Zoeken…';
    try{const q=i.value.trim().replace(/'/g,"''");const d=await graph(`/me/drive/root/search(q='${encodeURIComponent(q)}')?$top=25`);
      const items=(d.value||[]).filter(x=>/\.docx$/i.test(x.name||''));res.innerHTML='';
      if(!items.length){res.textContent='Niets gevonden. Probeer een ander deel van de bestandsnaam.';return}
      items.forEach(x=>{const btn=document.createElement('button');btn.textContent=x.name+(x.parentReference&&x.parentReference.path?'  ·  '+decodeURIComponent(x.parentReference.path.split('root:')[1]||'/'):'');
        btn.onclick=()=>{plan.msFile={id:x.id,driveId:(x.parentReference&&x.parentReference.driveId)||'',name:x.name};savePlan();renderMs();$('wStatus').textContent='Inlezen…';msRefresh(true)};res.append(btn)});
    }catch(e){res.textContent='Zoeken mislukt: '+e.message}};
}
$('wMsBtn').addEventListener('click',()=>{const h=$('wMsBox').classList.toggle('hide');if(!h)renderMs()});
setInterval(()=>{if(role==='teacher'&&plan&&plan.msFile)msRefresh(false)},10*60000);
if(window.FOCUZ_MS_CLIENT_ID||store.get('fz_ms_client'))$('wMsBtn').classList.remove('hide');

/* ---- automatisch via de OneDrive-map op deze computer (zonder Microsoft-login) ---- */
const CAN_WATCH = 'showOpenFilePicker' in window;
let fileHandle=null, fileLastMod=0, filePerm='';
const idb = (mode,fn) => new Promise((ok,no)=>{try{const r=indexedDB.open('focuz',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>{const tx=r.result.transaction('kv',mode);const q=fn(tx.objectStore('kv'));tx.oncomplete=()=>ok(q&&q.result);tx.onerror=()=>no(tx.error)};r.onerror=()=>no(r.error)}catch(e){no(e)}});
const saveHandle = h => idb('readwrite',s=>h?s.put(h,'wordfile'):s.delete('wordfile'));
const loadHandle = () => idb('readonly',s=>s.get('wordfile')).catch(()=>null);
async function readHandle(force){
  if(!fileHandle)return;
  try{
    filePerm=await fileHandle.queryPermission({mode:'read'});
    if(filePerm!=='granted'){renderAuto();return}
    const f=await fileHandle.getFile();
    if(!force&&f.lastModified===fileLastMod&&plan.word)return;
    await importWord(await f.arrayBuffer(),f.name);fileLastMod=f.lastModified;renderAuto();
  }catch(e){$('wStatus').textContent='Bijwerken mislukt: '+e.message+'. Staat het bestand nog op dezelfde plek?'}
}
function renderAuto(){ // één regel met de koppeling, en alleen de knop die nu nodig is
  const box=$('wAutoBox');box.innerHTML='';
  const line=(cls,txt)=>{const d=document.createElement('div');d.className='wl '+cls;const i=document.createElement('i');const t=document.createElement('span');t.textContent=txt;d.append(i,t);box.append(d);return d};
  const btn=(txt,cls,fn)=>{const b=document.createElement('button');b.textContent=txt;if(cls)b.className=cls;b.onclick=fn;return b};
  const once=btn('Eenmalig inlezen','link',()=>$('wFile').click());
  const pick=async()=>{try{const [hd]=await showOpenFilePicker({types:[{description:'Word',accept:{'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx']}}],multiple:false});
      fileHandle=hd;await saveHandle(hd);fileLastMod=0;filePerm='granted';$('wStatus').textContent='Inlezen…';await readHandle(true);renderAuto()}catch(e){if(e.name!=='AbortError')line('bad','Kiezen mislukt: '+e.message)}};
  if(!CAN_WATCH){line('off','Automatisch bijwerken kan alleen in Chrome of Edge op een computer.');const r=document.createElement('div');r.className='wbtns';r.append(btn('Dagklapper inlezen','primary',()=>$('wFile').click()));box.append(r);return}
  if(!fileHandle){
    line('off','Nog niet automatisch gekoppeld');
    const r=document.createElement('div');r.className='wbtns';r.append(btn('Dagklapper koppelen','primary',pick),once);box.append(r);return;
  }
  if(filePerm!=='granted'){
    line('warn','Automatisch bijwerken staat even stil');
    const r=document.createElement('div');r.className='wbtns';r.append(btn('Toegang geven','primary',async()=>{try{filePerm=await fileHandle.requestPermission({mode:'read'})}catch(e){}if(filePerm==='granted')await readHandle(true);renderAuto();statKey=''}),
      btn('Ander bestand','link',async()=>{fileHandle=null;await saveHandle(null);pick()}));box.append(r);return;
  }
  line('ok','Automatisch gekoppeld aan "'+fileHandle.name+'"');
  const r=document.createElement('div');r.className='wbtns';r.append(btn('Ander bestand','link',async()=>{fileHandle=null;await saveHandle(null);pick()}));box.append(r);
}

async function initAuto(){
  if(!CAN_WATCH){renderAuto();return}
  fileHandle=await loadHandle();if(!fileHandle){renderAuto();return}
  try{filePerm=await fileHandle.queryPermission({mode:'read'})}catch(e){filePerm=''}
  renderAuto();if(filePerm==='granted')readHandle(false);
}
setInterval(()=>{if(role==='teacher'&&fileHandle&&filePerm==='granted')readHandle(false)},60000);
function startVak(v,endAt,autoKey){
  const t=srvNow();
  if(!endAt){const m=sumMin(v)||30;endAt=t+m*60000}
  const pv=plan.vakken[v];
  publishState({v:3,sid:newCode(),status:'running',endAt,total:endAt-t,vak:v,task:pv.title||'',doel:pv.doel||'',tasks:vakTasks(v),extra:vakExtra(v),sound:$('tSound').checked,auto:autoKey||''});
}

function setupTeacher(){
  curVak=store.get('kt_curvak');if(!plan.vakken[curVak])curVak=Object.keys(plan.vakken)[0];
  renderVakBar();renderChips();
  $('tCode').textContent=code;
  const url=location.origin+location.pathname+'?klas='+code;$('tLink').value=url;
  try{const q=qrcode(0,'M');q.addData(url);q.make();$('tQr').innerHTML=q.createSvgTag({cellSize:4,margin:2,scalable:true});$('tQr').classList.remove('hide')}catch(e){$('tQr').classList.add('hide')}
  if(!/^https?:$/.test(location.protocol))$('tQrNote').textContent='Let op: de QR-code werkt pas als Focuz online staat. De klascode intypen werkt wel.';
  $('tSound').checked=store.get('kt_sound')!=='0';
  renderWordToday();initAuto();bindMorning();
  if(plan.msFile){$('wMsBox').classList.remove('hide');renderMs();msRefresh(false)}
  else if(msClientId()&&/code=|state=/.test(location.hash)){$('wMsBox').classList.remove('hide');renderMs()}
  $('tMode').textContent=USE_FB?'Eigen server · alleen jij kunt de timer besturen':'Openbare server · planning staat op dit apparaat';
}

function bindKidOpts(){$('oCalm').checked=plan.kidOpts.calm;$('oWeek').checked=plan.kidOpts.week}
$('oCalm').addEventListener('change',()=>{plan.kidOpts.calm=$('oCalm').checked;savePlan();publishDay()});
$('oWeek').addEventListener('change',()=>{plan.kidOpts.week=$('oWeek').checked;savePlan();publishDay()});
function bindMorning(){bindKidOpts();
  $('oText').value=plan.morning.text;$('oTasks').value=plan.morning.tasks;$('oOn').checked=plan.morning.on;$('oAuto').checked=plan.morning.auto;renderMorningPrev();
}
function renderMorningPrev(){ // voorbeeld van wat de iPads morgenochtend (of vandaag) tonen
  if(!plan)return;const now=new Date();let d=now;const bl=blocksFor(now);
  if(!bl.length||hmNow()>=bl[0].at)d=nextSchoolDay();
  const m=morningFor(d);const box=$('oPrev');box.innerHTML='';
  if(!m){box.textContent='Het ochtendscherm staat uit.';return}
  const h=document.createElement('b');h.textContent=dayName(d).split(',')[0]+(ymd(d)===today()?'':', '+DAG[d.getDay()]+' '+d.getDate()+' '+MAAND[d.getMonth()])+' op de iPads:';box.append(h);
  const p=document.createElement('div');p.className='small';p.textContent=m.text;box.append(p);
  const ul=document.createElement('ul');(m.tasks.length?m.tasks:['(geen taken)']).forEach(t=>{const li=document.createElement('li');li.textContent=t;ul.append(li)});box.append(ul);
}
function bindTeacher(){
  $('oText').addEventListener('input',()=>{plan.morning.text=$('oText').value;savePlan();renderMorningPrev()});
  $('oTasks').addEventListener('input',()=>{plan.morning.tasks=$('oTasks').value;savePlan();renderMorningPrev()});
  $('oOn').addEventListener('change',()=>{plan.morning.on=$('oOn').checked;savePlan();renderMorningPrev()});
  $('oAuto').addEventListener('change',()=>{plan.morning.auto=$('oAuto').checked;savePlan();renderMorningPrev()});
  // tabbladen
  const setTab=t=>{document.querySelectorAll('#tTabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
    document.querySelectorAll('#teacher .tab').forEach(x=>x.classList.toggle('on',x.dataset.tab===t));store.set('fz_tab',t)};
  $('tTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.tab)});
  if(['nu','rooster','klas'].includes(store.get('fz_tab')))setTab(store.get('fz_tab'));
  $('tVak2').addEventListener('change',()=>{curVak=$('tVak2').value;chosenMin=null;$('tTime').value='';savePlan();renderVakBar();renderChips()});
  // leerlingbeeld: schermvullend, op ware grootte, zelf rondklikken
  const kvClose=()=>{try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}$('kvModal').classList.add('hide');$('kvFrame').innerHTML='';document.body.classList.remove('kvopen')};
  $('tKidView').addEventListener('click',()=>{
    const url=location.origin+location.pathname+'?klas='+code+'&kijk=1';$('kvOpen').href=url;
    $('kvFrame').innerHTML='';const i=document.createElement('iframe');i.src=url;i.title='Leerlingbeeld';i.allow='fullscreen';$('kvFrame').append(i);
    $('kvModal').classList.remove('hide');document.body.classList.add('kvopen');
    try{const el=$('kvModal');(el.requestFullscreen||el.webkitRequestFullscreen||(()=>{})).call(el)}catch(e){}
    setTimeout(()=>{try{i.focus()}catch(e){}},300);
  });
  $('kvClose').addEventListener('click',kvClose);
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!$('kvModal').classList.contains('hide')){/* blijft open als venster */}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('kvModal').classList.contains('hide'))kvClose()});
  $('tVak').addEventListener('change',()=>{curVak=$('tVak').value;chosenMin=null;$('tTime').value='';savePlan();renderVakBar();renderChips()});
  $('tVakAdd').addEventListener('click',async()=>{const n=cleanName(await ask({title:'Nieuw vak',text:'Hoe heet het vak?',input:''}));if(!n)return;if(!plan.vakken[n])plan.vakken[n]={title:'',doel:'',tasks:[{t:'',m:15}],extra:''};curVak=n;savePlan();renderVakBar();renderChips()});
  $('tVakRen').addEventListener('click',async()=>{const n=cleanName(await ask({title:'Vak hernoemen',input:curVak}));if(!n||n===curVak||plan.vakken[n])return;
    const nv={};for(const k in plan.vakken)nv[k===curVak?n:k]=plan.vakken[k];plan.vakken=nv;
    for(let d=1;d<=5;d++)plan.rooster[d].forEach(x=>{if(x.vak===curVak)x.vak=n});curVak=n;savePlan();renderVakBar()});
  $('tVakDel').addEventListener('click',async()=>{if(Object.keys(plan.vakken).length<2)return;if(!await ask({title:'Vak verwijderen?',text:`"${curVak}", de takenlijst en de blokken in het rooster worden verwijderd.`,ok:'Verwijder'}))return;
    delete plan.vakken[curVak];for(let d=1;d<=5;d++)plan.rooster[d]=plan.rooster[d].filter(x=>x.vak!==curVak);curVak=Object.keys(plan.vakken)[0];savePlan();renderVakBar();renderChips()});
  $('tRows').addEventListener('input',e=>{const r=e.target.closest('.tr');if(!r)return;const x=V().tasks[+r.dataset.i];
    if(e.target.classList.contains('tt'))x.t=e.target.value;else x.m=Math.max(0,Math.round(+e.target.value||0));
    const s=sumMin(curVak);$('tSum').textContent=s?'Samen '+minTxt(s):'';pushLive()});
  $('tRows').addEventListener('change',()=>{renderChips();renderRooster()});
  $('tRows').addEventListener('click',e=>{if(!e.target.classList.contains('del'))return;V().tasks.splice(+e.target.closest('.tr').dataset.i,1);renderRows();renderChips();pushLive()});
  $('tAddRow').addEventListener('click',()=>{if(V().tasks.length>=15)return;V().tasks.push({t:'',m:10});renderRows();const all=$('tRows').querySelectorAll('.tt');all[all.length-1].focus();savePlan()});
  $('tTask').addEventListener('input',()=>{V().title=$('tTask').value;pushLive()});
  $('tDoel').addEventListener('input',()=>{V().doel=$('tDoel').value;pushLive()});
  $('tExtra').addEventListener('input',()=>{V().extra=$('tExtra').value;pushLive()});
  $('tChips').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;chosenMin=+b.dataset.m;$('tTime').value='';markChips(chosenMin);$('tErr').textContent=''});
  $('tTime').addEventListener('input',()=>{chosenMin=null;markChips(null);$('tErr').textContent=''});
  $('tSound').addEventListener('change',()=>{store.set('kt_sound',$('tSound').checked?'1':'0');if(state.status!=='idle')publishState({...state,sound:$('tSound').checked})});
  $('tStart').addEventListener('click',()=>{
    let endAt=null;
    if($('tTime').value){const e=slotTime($('tTime').value);if(e<=Date.now()+30000){$('tErr').textContent='Die eindtijd is al voorbij. Kies een latere tijd.';return}endAt=e+offset}
    else{const m=chosenMin!==null?chosenMin:sumMin(curVak);if(!m){$('tErr').textContent='Vul minuten in bij de taken, of kies een totale tijd.';return}endAt=srvNow()+m*60000}
    $('tErr').textContent='';startVak(curVak,endAt);
  });
  $('tPause').addEventListener('click',()=>{takeOver();
    if(state.status==='running')publishState({...state,status:'paused',remaining:Math.max(0,state.endAt-srvNow())});
    else if(state.status==='paused')publishState({...state,status:'running',endAt:srvNow()+state.remaining});
  });
  const shift=ms=>{const n=srvNow();
    if(state.status==='running'){const e=Math.max(n+1000,Math.max(state.endAt,n)+ms);publishState({...state,endAt:e,total:Math.max(state.total,e-n)})}
    else if(state.status==='paused'){const r=Math.max(1000,state.remaining+ms);publishState({...state,remaining:r,total:Math.max(state.total,r)})}
  };
  $('tPlus').addEventListener('click',()=>{takeOver();shift(5*60000)});
  $('tMin').addEventListener('click',()=>{takeOver();shift(-5*60000)});
  $('tStop').addEventListener('click',async()=>{if(!await ask({title:'Vak stoppen?',text:'De timer stopt op alle iPads. Het volgende blok start weer gewoon op tijd.',ok:'Stop'}))return;publishState({v:3,status:'idle',sound:$('tSound').checked,auto:state.auto||'',stoppedAt:srvNow()})});
  $('tCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('tLink').value);$('tCopy').textContent='Gekopieerd'}catch(e){$('tLink').select()}setTimeout(()=>$('tCopy').textContent='Kopieer',1500)});
  $('tNewCode').addEventListener('click',async()=>{
    if(!await ask({title:'Nieuwe klascode?',text:'Alle iPads moeten dan opnieuw koppelen.',ok:'Nieuwe code'}))return;
    T&&T.clear();T&&T.stop();T=null;state={status:'idle'};
    if(USE_FB){try{code=await claimCode()}catch(e){$('tErr').textContent='Nieuwe code maken mislukt.';return}}
    else{code=newCode();store.set('kt_teacher_code',code)}
    kidsInfo=[];setupTeacher();connect();render();
  });
  // rooster
  $('rDays').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;rDay=+b.dataset.d;renderRooster()});
  $('rAdd').addEventListener('click',()=>{const rows=plan.rooster[rDay];const last=rows.length?rows[rows.length-1].at:'08:30';
    const [h,m]=last.split(':').map(Number);const nt=`${pad(Math.min(23,h+1))}:${pad(m)}`;rows.push({at:rows.length?nt:'08:45',vak:curVak});savePlan();renderRooster()});
  $('rRows').addEventListener('change',e=>{const r=e.target.closest('.rr');if(!r)return;const x=plan.rooster[rDay][+r.dataset.i];
    if(e.target.classList.contains('rt')&&e.target.value)x.at=e.target.value;if(e.target.classList.contains('rv'))x.vak=e.target.value;savePlan();renderRooster()});
  $('rRows').addEventListener('click',e=>{if(!e.target.classList.contains('rdel'))return;plan.rooster[rDay].splice(+e.target.closest('.rr').dataset.i,1);savePlan();renderRooster()});
  $('rAuto').addEventListener('change',()=>{plan.auto=$('rAuto').checked;savePlan();renderNext()});
}

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
const urlCode=(qs.get('klas')||'').toUpperCase();
if(validCode(urlCode))startKid(urlCode);
else if(qs.has('leerkracht'))startTeacher();
else if(store.get('kt_role')==='kid'&&validCode(store.get('kt_kid_code')||''))startKid(store.get('kt_kid_code'));
else if(store.get('kt_role')==='teacher')startTeacher();
else{show('home');setConn(false,'Niet verbonden')}
}
