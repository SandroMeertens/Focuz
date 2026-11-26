// ===== Huiswerk & toetsen =====
function hwList(){return plan&&plan.word&&plan.useWord!==false?arr(plan.word.hw).filter(x=>!x.date||x.date>=today()):[]}
const hwKey = x => x.date?x.id:x.id+'@'+isoWeek(new Date());   // terugkerend: elke week opnieuw afvinken
function hwStore(){try{return JSON.parse(store.get('fz_hw_'+code)||'{}')||{}}catch(e){return {}}}
function hwDoneNow(){const st=hwStore();return arr(curDay&&curDay.hw).map(hwKey).filter(k=>st[k])}
function hwDays(date){const [y,m,d]=date.split('-').map(Number);const a=new Date(y,m-1,d),n=new Date();return Math.round((a-new Date(n.getFullYear(),n.getMonth(),n.getDate()))/864e5)}
function hwWhen(x){
  if(x.date){const n=hwDays(x.date);const [y,m,d]=x.date.split('-').map(Number);const dt=new Date(y,m-1,d);
    const lab=DAG[dt.getDay()].slice(0,2)+' '+d+' '+MAAND[m-1];
    return {txt:n<=0?'vandaag':n===1?'morgen':lab,sub:n>1?'nog '+n+' dagen':'',hot:n<=1}}
  if(x.rep==='week')return {txt:'',sub:'',hot:false};
  const wd=+x.rep;const n=(wd-new Date().getDay()+7)%7;return {txt:DAG[wd],sub:n===0?'vandaag':n===1?'morgen':'',hot:n<=1&&new Date().getDay()>0&&new Date().getDay()<6};
}
function hwSorted(list){
  const dated=list.filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date));
  const days=list.filter(x=>!x.date&&x.rep!=='week').sort((a,b)=>((+a.rep-new Date().getDay()+7)%7)-((+b.rep-new Date().getDay()+7)%7));
  const week=list.filter(x=>!x.date&&x.rep==='week');
  return [['Toetsen en deadlines',dated],['Elke week op een vaste dag',days],['Elke week',week]].filter(g=>g[1].length);
}
function renderHw(box,list,{tick=true,counts=null}={}){
  box.innerHTML='';const st=hwStore();
  if(!list.length){box.innerHTML='<p class="hwempty">Er staat nu geen huiswerk of toets gepland.</p>';return}
  hwSorted(list).forEach(([title,items])=>{
    const h=document.createElement('h4');h.textContent=title;box.append(h);
    const ul=document.createElement('ul');ul.className='hwlist';
    items.forEach(x=>{const k=hwKey(x),done=!!st[k],w=hwWhen(x);
      const li=document.createElement('li');li.className=(done?'ok ':'')+(w.hot&&!done?'hot':'');
      li.innerHTML='<span class="hwc" aria-hidden="true"></span><span class="hwt"><b></b><small></small></span><span class="hww"><b></b><small></small></span>';
      li.querySelector('.hwt b').textContent=x.vak;li.querySelector('.hwt small').textContent=x.wat;
      li.querySelector('.hww b').textContent=w.txt;li.querySelector('.hww small').textContent=counts?counts(x):w.sub;
      if(tick){li.tabIndex=0;li.setAttribute('role','checkbox');li.setAttribute('aria-checked',done);
        const flip=()=>{const s2=hwStore();if(s2[k])delete s2[k];else s2[k]=Date.now();store.set('fz_hw_'+code,JSON.stringify(s2));renderHwAll();if(T&&!HOME&&!VIEW&&!DEMO)T.tick()};
        li.addEventListener('click',flip);li.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();flip()}})}
      else li.querySelector('.hwc').remove();
      ul.append(li)});
    box.append(ul)});
}
function hwSoon(list){ // korte regel voor ochtendscherm en digibord
  const up=list.filter(x=>x.date&&hwDays(x.date)>=0&&hwDays(x.date)<=6).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  return up.map(x=>{const w=hwWhen(x);return x.vak.replace(/^toets\s+/i,'Toets ')+' ('+w.txt+')'}).join(' · ');
}
function renderHwAll(){
  const list=arr(curDay&&curDay.hw);
  if(role==='kid'){
    $('kHwBtn').classList.toggle('hide',!list.length);
    const n=list.filter(x=>{const w=hwWhen(x);return w.hot&&!hwStore()[hwKey(x)]}).length;$('kHwBtn').classList.toggle('hasdot',n>0);
    if(!$('kHwOver').classList.contains('hide'))renderHw($('kHwList'),list);
    const soon=hwSoon(list);$('kMHw').textContent=soon?'Deze week: '+soon:'';$('kMHw').classList.toggle('hide',!soon);
    if(HOME)renderThuis();
  }
}
function renderThuis(){
  const list=arr(curDay&&curDay.hw);renderHw($('hList'),list);
  $('hUpd').textContent=curDay?'Je vinkjes worden alleen op dit apparaat bewaard.':'Planning laden…';
}
// ===== reflectie en dagoverzicht (leerkracht) =====
function logStore(){try{return JSON.parse(store.get('kt_log')||'{}')||{}}catch(e){return {}}}
function logSave(l){const ks=Object.keys(l).sort();while(ks.length>21)delete l[ks.shift()];store.set('kt_log',JSON.stringify(l))}
let logTimer=null;const kidErrSeen={};
function logKids(list){
  list.forEach(k=>{if(k.err&&!kidErrSeen[k.id+k.err]){kidErrSeen[k.id+k.err]=1;logError('iPad '+String(k.id).slice(0,4)+': '+k.err,'leerling')}}); // bewaart per les: hoeveel iPads alles af hadden en de reflecties
  const l=logStore();const d=today();const day=l[d]||(l[d]={});let ch=false;
  const cv=currentView(),cs=cv&&cv.s;
  const lessonInfo=sid=>{if(cs&&cs.sid===sid&&cs.status&&cs.status!=='idle')return {vak:cs.vak||'',at:cs.wordAt||(cs.startAt?clock(cs.startAt-offset):clock(Date.now())),t:arr(cs.tasks).filter(x=>x&&x.t).map(x=>x.t)};return null};
  list.forEach(k=>{if(!k.id)return;
    if(k.sid){let e=day[k.sid];const inf=lessonInfo(k.sid);if(!e&&inf){e=day[k.sid]={vak:inf.vak,at:inf.at,kids:{}};ch=true}
      if(e&&inf){const mine=inf.t.map((x,i)=>i).filter(i=>{const g=taskTags(inf.t[i]).g;return !g.length||g.includes(k.grp)});
        const all=mine.length>0&&mine.every(i=>k.ticks.includes(i));const o=e.kids[k.id]||{};if(o.a!==all||o.n!==mine.length){e.kids[k.id]={...o,a:all,n:mine.length,d:mine.filter(i=>k.ticks.includes(i)).length};ch=true}}}
    for(const sid in (k.refl||{})){const e=day[sid];const v=+k.refl[sid];if(e&&v>=1&&v<=3){const o=e.kids[k.id]||{};if(o.r!==v){e.kids[k.id]={...o,r:v};ch=true}}}});
  if(ch){clearTimeout(logTimer);logTimer=setTimeout(()=>logSave(l),300);logCache=l}
}
let logCache=null;
function reflCounts(sid,date){const l=logCache||logStore();const e=(l[date||today()]||{})[sid];const c={3:0,2:0,1:0,n:0};
  kidsInfo.forEach(k=>{const v=+(k.refl||{})[sid];if(v>=1&&v<=3&&!(e&&e.kids[k.id]&&e.kids[k.id].r))c[v]++});
  if(e)for(const id in e.kids){const v=e.kids[id].r;if(v)c[v]++}c.n=c[3]+c[2]+c[1];return c}
function reflHtml(c){return `<span class="rl">Doel gehaald?</span><span class="r3">😀 ${c[3]}</span><span class="r2">🙂 ${c[2]}</span><span class="r1">😕 ${c[1]}</span>`}
function renderDayLog(date){
  const l=logCache||logStore();const keys=Object.keys(l).filter(k=>Object.keys(l[k]).length).sort().reverse();
  date=date||keys[0]||today();const sel=$('dlDate');sel.innerHTML='';
  (keys.length?keys:[today()]).forEach(k=>{const [y,m,d]=k.split('-').map(Number);const dt=new Date(y,m-1,d);const o=document.createElement('option');o.value=k;o.textContent=(k===today()?'Vandaag · ':'')+DAG[dt.getDay()]+' '+d+' '+MAAND[m-1];sel.append(o)});sel.value=date;
  const box=$('dlList');box.innerHTML='';const day=l[date]||{};
  const rows=Object.entries(day).sort((a,b)=>String(a[1].at).localeCompare(String(b[1].at)));
  if(!rows.length){box.innerHTML='<p class="muted">Nog niets bijgehouden voor deze dag. Focuz houdt het overzicht bij zolang dit scherm open staat tijdens de les.</p>';return}
  rows.forEach(([sid,e])=>{const ks=Object.values(e.kids);const all=ks.filter(k=>k.a).length,tot=ks.filter(k=>k.n).length;const c={3:0,2:0,1:0};ks.forEach(k=>{if(k.r)c[k.r]++});const rn=c[3]+c[2]+c[1];
    const r=document.createElement('div');r.className='dlrow';
    r.innerHTML=`<span class="dlt"></span><b class="dlv"></b><span class="dla"></span><span class="dlr"></span>`;
    r.querySelector('.dlt').textContent=e.at||'';r.querySelector('.dlv').textContent=e.vak||'';
    r.querySelector('.dla').innerHTML=tot?`<i style="--p:${Math.round(all/tot*100)}%"></i><small>${all} van ${tot} alles af</small>`:'<small class="muted">geen taken bijgehouden</small>';
    r.querySelector('.dlr').innerHTML=rn?reflHtml(c).replace('<span class="rl">Doel gehaald?</span>',''):'<small class="muted">geen reflectie</small>';
    box.append(r)});
}
function renderHwTeacher(){
  const box=$('hwT');if(!box)return;const list=hwList();
  const here=kidsInfo.length;
  renderHw(box,list,{tick:false,counts:x=>here?kidsInfo.filter(k=>arr(k.hw).includes(hwKey(x))).length+' van '+here+' klaar':hwWhen(x).sub});
  $('hwSum').textContent=list.length?list.length+(list.length===1?' item':' items')+' uit je dagklapper':'Nog geen tabel gevonden';
}
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
$('kHwBtn').addEventListener('click',()=>{renderHw($('kHwList'),arr(curDay&&curDay.hw));$('kHwOver').classList.remove('hide')});
$('kHwClose').addEventListener('click',()=>$('kHwOver').classList.add('hide'));
$('kHwOver').addEventListener('click',e=>{if(e.target===$('kHwOver'))$('kHwOver').classList.add('hide')});
$('kWeekBtn').addEventListener('click',()=>{weekSel=null;renderWeek();$('kWeekOver').classList.remove('hide')});
$('kWeekTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;weekSel=b.dataset.k;renderWeek()});
$('kWeekClose').addEventListener('click',()=>$('kWeekOver').classList.add('hide'));
$('kWeekOver').addEventListener('click',e=>{if(e.target===$('kWeekOver'))$('kWeekOver').classList.add('hide')});
$('kDayOver').addEventListener('click',e=>{if(e.target===$('kDayOver'))$('kDayOver').classList.add('hide')});

