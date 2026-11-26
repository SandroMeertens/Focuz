/* =================== basis =================== */
const FBCFG = window.KLASTIMER_FIREBASE;
const USE_FB = !!(FBCFG && FBCFG.apiKey && FBCFG.databaseURL);
const BROKER = new URLSearchParams(location.search).get('broker') || 'wss://broker.emqx.io:8084/mqtt';
const PREFIX = 'focuz/v2/';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAGEN = ['','Ma','Di','Wo','Do','Vr'];
const $ = id => document.getElementById(id);
const PROBEER = new URLSearchParams(location.search).has('probeer'); // probeerstand: eigen opslag, voorbeeldrooster
const SK = k => PROBEER?'pz_'+k:k;
const VERSION = '2026.11.26';
const store = {get(k){try{return localStorage.getItem(SK(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(SK(k),v)}catch(e){}},del(k){try{localStorage.removeItem(SK(k))}catch(e){}}};
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

// ===== foutenlog: fouten worden op het apparaat bewaard en kunnen worden meegestuurd =====
const ERRKEY='fz_errors';
function logError(msg,src){try{const l=JSON.parse(localStorage.getItem(ERRKEY)||'[]');const m=String(msg||'').slice(0,300);
  if(l.length&&l[l.length-1].m===m&&Date.now()-l[l.length-1].t<60000){l[l.length-1].n=(l[l.length-1].n||1)+1}else l.push({t:Date.now(),m,s:String(src||'').slice(0,200),v:VERSION});
  while(l.length>30)l.shift();localStorage.setItem(ERRKEY,JSON.stringify(l))}catch(e){}}
window.addEventListener('error',e=>logError(e.message,(e.filename||'').split('/').pop()+':'+e.lineno));
window.addEventListener('unhandledrejection',e=>logError('Promise: '+(e.reason&&e.reason.message||e.reason),''));
function recentErrors(ms){try{return JSON.parse(localStorage.getItem(ERRKEY)||'[]').filter(x=>Date.now()-x.t<ms)}catch(e){return []}}
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

// uitleg-vraagtekens
document.addEventListener('click',e=>{const h=e.target.closest('.help');const b=$('tipBub');
  if(h){e.preventDefault();e.stopPropagation();if(!b.classList.contains('hide')&&b.dataset.for===h.dataset.tip){b.classList.add('hide');return}
    b.textContent=h.dataset.tip;b.dataset.for=h.dataset.tip;b.classList.remove('hide');const r=h.getBoundingClientRect();
    const w=Math.min(300,innerWidth-24);b.style.width=w+'px';b.style.left=Math.max(12,Math.min(innerWidth-w-12,r.left+r.width/2-w/2))+'px';
    const top=r.bottom+8;b.style.top=(top+b.offsetHeight>innerHeight-8?r.top-b.offsetHeight-8:top)+'px';return}
  if(!b.classList.contains('hide'))b.classList.add('hide')},true);

// bestanden lezen, ook in oudere Safari (zonder File.arrayBuffer/text)
const readBuf = f => f.arrayBuffer ? f.arrayBuffer() : new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsArrayBuffer(f)});
const readText = f => f.text ? f.text() : new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsText(f)});
