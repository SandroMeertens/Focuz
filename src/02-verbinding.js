/* =================== verbinding =================== */
let connected=false, everConnected=false, offSince=Date.now();
function setConn(ok,txt){
  if(typeof DEMO!=='undefined'&&DEMO){ok=true;txt='Oefenstand'}
  $('dot').className='dot '+(ok?'on':'off');$('conn').textContent=txt;$('conn').classList.toggle('sronly',!!ok);
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
      if(typeof mqtt==='undefined'){try{await loadScript('vendor/mqtt.min.js')}catch(e){setConn(false,'Geen internet');return}}
      client=mqtt.connect(BROKER,{clientId:'kt_'+myId+'_'+Math.random().toString(16).slice(2,6),clean:true,reconnectPeriod:2000,connectTimeout:10000,keepalive:30});
      client.on('connect',()=>{setConn(true,'Verbonden');client.subscribe([base+'state',base+'clock',base+'ping',base+'msg',base+'day']);setTimeout(()=>{try{t.tick()}catch(e){}},400)});
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
        else if(k==='ping'&&role==='teacher'&&msg.id){peers[msg.id]={id:String(msg.id),at:Date.now(),sid:String(msg.sid||''),ticks:arr(msg.ticks).map(Number),hw:arr(msg.hw).map(String),grp:String(msg.grp||''),refl:msg.refl&&typeof msg.refl==='object'?msg.refl:{},err:String(msg.err||'').slice(0,120)};t.count()}
      });
    },
    publish(s){pub('state',s,{qos:1,retain:true})},
    clear(){pub('state',null,{retain:true})},
    sendMsg(m){pub('msg',m||null,{qos:1,retain:true})},
    sendDay(d){pub('day',d,{qos:1,retain:true})},
    tick(){
      if(!client||!client.connected)return;
      if(role==='teacher')pub('clock',{now:Date.now()});
      if(role==='kid'&&!VIEW&&!HOME){const er=recentErrors(600000).pop();pub('ping',{id:myId,sid:state.sid||'',ticks:getTicks(),hw:hwDoneNow(),grp:myGroup(),refl:reflRecent(),err:er?er.m.slice(0,120):''})}
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
        ref('kids').on('value',s=>{const v=s.val()||{};h.onKids(Object.entries(v).map(([id,x])=>({id,sid:String(x.sid||''),ticks:arr(x.ticks).map(Number),hw:arr(x.hw).map(String),grp:String(x.grp||''),refl:x.refl&&typeof x.refl==='object'?x.refl:{}})))},()=>{});
      }
      ref('state').on('value',s=>h.onState(s.val()||{status:'idle'}),e=>setConn(false,'Geen toegang'));
      ref('msg').on('value',s=>h.onMsg(s.val()),()=>{});
      ref('day').on('value',s=>h.onDay(s.val()),()=>{});
    },
    sendDay(d){ref('day').set(JSON.parse(JSON.stringify(d))).catch(()=>{})},
    sendMsg(m){(m?ref('msg').set(m):ref('msg').remove()).catch(e=>{$('mInfo').textContent='Versturen mislukt: '+(e.code||e.message)})},
    publish(s){ref('state').set(JSON.parse(JSON.stringify(s))).catch(e=>{$('tErr').textContent='Opslaan mislukt: '+(e.code||e.message)})},
    clear(){ref('state').remove().catch(()=>{})},
    tick(){if(me&&!HOME)me.set({at:firebase.database.ServerValue.TIMESTAMP,sid:state.sid||'',ticks:getTicks(),hw:hwDoneNow(),grp:myGroup(),refl:reflRecent()}).catch(()=>{})}, count(){}, wake(){},
    stop(){try{ref('state').off();ref('kids').off();ref('msg').off();ref('day').off();conRef&&conRef.off();me&&me.remove()}catch(e){}}
  };
  return t;
}

/* iPads volgen zelf de weekplanning: loopt er geen vak van de leerkracht, dan start het blok van nu vanzelf */
let tState={status:'idle'};
function localTime(hm){const [h,m]=hm.split(':').map(Number);const d=new Date();d.setHours(h,m,0,0);return d.getTime()}
function effState(){
  if(typeof DEMO!=='undefined'&&DEMO)return state;
  let t=tState||{status:'idle'};
  // 'Tijd is om' blijft 10 minuten staan; daarna gewoon terug naar het dagritme/afsluiting
  if(t.status==='running'&&t.endAt<=srvNow()-10*60000)t={status:'idle',stoppedAt:t.stoppedAt};
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
           onKids:list=>{kidsInfo=list;logKids(list);renderNow();renderJoin();renderHwTeacher();$('kSum').textContent='Klascode '+code+' · '+(list.length===1?'1 iPad':list.length+' iPads')+' verbonden'},
           onMsg:m=>{if(HOME)return;curMsg=m&&typeof m==='object'&&m.text?m:null;renderMsg()},
           onDay:d=>{if(d&&typeof d==='object'&&role==='kid'&&!VIEW)store.set(HOME?'fz_day_thuis':'fz_day',JSON.stringify(d));curDay=d&&typeof d==='object'?{opts:d.opts&&typeof d.opts==='object'?d.opts:{},next:d.next&&d.next.date?d.next:null,date:d.date||'',blocks:arr(d.blocks),week:d.week&&typeof d.week==='object'?d.week:{},auto:d.auto,sound:d.sound,morning:d.morning&&typeof d.morning==='object'?{text:String(d.morning.text||''),tasks:arr(d.morning.tasks).map(String),vandaag:arr(d.morning.vandaag).map(String)}:null,hw:arr(d.hw).filter(x=>x&&x.id&&x.vak).map(x=>({id:String(x.id),vak:String(x.vak),wat:String(x.wat||''),date:String(x.date||''),rep:x.rep===''||x.rep==null?'':x.rep}))}:null;renderDay();renderWeek();renderHwAll();document.body.classList.toggle('kidbig',!!(curDay&&curDay.opts&&curDay.opts.big))}};
  daySig='';
  T=USE_FB?fbTransport(h):mqttTransport(h);
  T.start().catch(e=>{setConn(false,'Verbindingsfout');console.error(e)});
}
function publishState(s){state=s;rang=false;render();T&&T.publish(s)}

