/* =================== schermen =================== */
function show(id){['home','login','kid','teacher','board','thuis'].forEach(s=>$(s).classList.toggle('hide',s!==id))}
// Kijk-/oefenstand alleen voor de leerkracht: in het leerlingbeeld van de leerkrachtmodule,
// of op een apparaat waar de leerkrachtmodule is gebruikt. Op een leerling-iPad wordt ?kijk=1 genegeerd.
const VIEW=(()=>{if(!new URLSearchParams(location.search).has('kijk'))return false;
  let framed=false;try{framed=window.top!==window.self}catch(e){framed=true}
  const ok=framed||!!store.get('kt_teacher_code')||store.get('kt_role')==='teacher';
  if(!ok){try{const u=new URL(location.href);u.searchParams.delete('kijk');u.searchParams.delete('mini');history.replaceState(null,'',u)}catch(e){}}
  return ok})();
const HOME=new URLSearchParams(location.search).has('thuis');
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

function startThuis(c){role='kid';code=c;document.title='Huiswerk en toetsen · Focuz';
  try{const d=JSON.parse(store.get('fz_day_thuis')||'null');if(d&&typeof d==='object')curDay={hw:arr(d.hw)}}catch(e){}
  show('thuis');renderThuis();connect()}
function demoPlan(){ // voorbeeldweek rond vandaag, zodat er altijd iets te zien is
  const days={},base=new Date();base.setHours(0,0,0,0);const dow=base.getDay()||7;base.setDate(base.getDate()-(dow-1));
  const L=[['08:30','Rekenen','Les 4 – breuken vergelijken',[['Instructie',10],['Werkboek opdrachten',25],['Nakijken',5]],'Ik kan breuken vergelijken.','Weektaak Gynzy'],
    ['09:30','Spelling','Les 3 – woorden met -heid',[['Instructie',10],['Werkboek',20],['Nakijken',5]],'Ik kan woorden met -heid goed schrijven.','Woorden oefenen'],
    ['10:15','Pauze','',[],'',''],
    ['10:30','Lezen','Stillezen',[['Lezen in je eigen boek',25]],'Ik kan geconcentreerd lezen.',''],
    ['11:00','Taal','Les 5 – zinsdelen',[['Instructie',10],['Opdrachten',20]],'Ik kan een zin ontleden.','Woordenschat oefenen'],
    ['12:00','Pauze','',[],'',''],
    ['12:45','Wereldoriëntatie','Thema water',[['Tekst lezen',20],['Vragen maken',20]],'Ik kan uitleggen hoe een dijk werkt.',''],
    ['13:45','Creatief','Tekenen: een landschap',[['Schetsen',15],['Inkleuren',25]],'Ik kan perspectief gebruiken.','']];
  for(let i=0;i<14;i++){const d=new Date(base);d.setDate(base.getDate()+i);if(d.getDay()===0||d.getDay()===6)continue;
    days[ymd(d)]=L.map(([at,vak,title,t,doel,klaar],i)=>({at,end:L[i+1]?L[i+1][0]:'14:30',vak,title,doel,klaar,tasks:t.map(([x,m])=>({t:x,m}))}))}
  const dd=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d)};
  const hw=[{vak:'Toets topografie',wat:'Kaart C oefenen',date:dd(2),rep:''},{vak:'Toets Engels',wat:'Woorden en zinnen leren',date:dd(4),rep:''},
    {vak:'Huiswerk werkwoorden',wat:'Maak 3 bladen werkwoordspelling',date:'',rep:5},{vak:'Lezen',wat:'Lees elke dag 15 minuten',date:'',rep:'week'}].map(x=>({...x,id:hwHash(x.vak+'|'+x.wat+'|'+x.date+'|'+x.rep)}));
  return {vakken:{},word:{file:'Voorbeeldrooster',at:Date.now(),days,morning:{},hw,issues:[]},groep:8};
}
function startProbeer(){
  store.set('kt_role','teacher');role='teacher';code=store.get('kt_teacher_code');
  if(!validCode(code||'')){code=newCode();store.set('kt_teacher_code',code)}
  plan=normPlan(readLocalPlan()||demoPlan());if(!plan.word||!Object.keys(plan.word.days).some(k=>k>=today()))plan.word=normPlan(demoPlan()).word;
  savePlan();document.body.classList.add('probeer');show('teacher');setupTeacher();connect();
}
async function startTeacher(){
  store.set('kt_role','teacher');
  if(!USE_FB){
    role='teacher';code=store.get('kt_teacher_code');
    if(!validCode(code||'')){ // nieuw apparaat: eerst vragen of er al een klas is
      const v=await ask({title:'Heb je al een klas in Focuz?',text:'Gebruik je Focuz al op een ander apparaat? Typ dan je klascode, zodat de iPads gekoppeld blijven. Laat leeg voor een nieuwe klas.',input:'',ok:'Verder'});
      const c=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      code=validCode(c)?c:newCode();store.set('kt_teacher_code',code)}
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

