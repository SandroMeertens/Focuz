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
  const ko=p.kidOpts&&typeof p.kidOpts==='object'?p.kidOpts:{};p.kidOpts={calm:ko.calm!==false,week:ko.week!==false,big:ko.big===true};
  p.groep=+p.groep>=1&&+p.groep<=8?+p.groep:0;
  const mo=p.morning&&typeof p.morning==='object'?p.morning:{};
  p.morning={on:mo.on!==false,auto:mo.auto!==false,text:typeof mo.text==='string'?mo.text:'Fijn dat je er bent! Begin rustig aan de dag.',
    tasks:typeof mo.tasks==='string'?(mo.v2?mo.tasks:mo.tasks.split('\n').filter(x=>!/jas ophangen/i.test(x)).join('\n')):DEFAULT_MORNING,v2:true,v3:true,v4:true};
  if(!mo.v4)p.morning.tasks=DEFAULT_MORNING; // nieuwe vaste volgorde op verzoek
  if(!mo.v3&&typeof mo.tasks==='string'&&!/ipad/i.test(p.morning.tasks))p.morning.tasks=(p.morning.tasks.trim()?p.morning.tasks.trim()+'\n':'')+'iPad pakken';
  if(p.word&&typeof p.word==='object'){const days={};const src=p.word.days||{};for(const k in src)days[k]=arr(src[k]).filter(b=>b&&b.at);p.word={file:p.word.file||'',at:+p.word.at||0,days,issues:arr(p.word.issues).filter(x=>x&&x.msg),morning:p.word.morning&&typeof p.word.morning==='object'?p.word.morning:{},hw:arr(p.word.hw).filter(x=>x&&x.id&&x.vak)}}else p.word=null;
  p.msgPresets=arr(p.msgPresets).filter(x=>typeof x==='string'&&x.trim()).slice(-6);
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
  $('tVak2').innerHTML=$('tVak').innerHTML;$('tVak2').value=curVak;$('tTask').value=V().title;$('tDoel').value=V().doel;$('tExtra').value=V().extra;fitTa($('tExtra'));
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
  if(!rows.length){const p=document.createElement('div');p.className='muted small';p.textContent='Nog geen lessen op '+['','maandag','dinsdag','woensdag','donderdag','vrijdag'][rDay]+'.';$('rRows').append(p)}
  rows.forEach((x,i)=>{
    const r=document.createElement('div');r.className='rr';r.dataset.i=i;
    r.innerHTML='<input type="time" class="rt" aria-label="Begintijd"><select class="rv" aria-label="Vak"></select><button class="rdel" aria-label="Verwijder les">×</button>';
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
  if(w){const nx=w.find(b=>slotTime(b.at)>n);txt=nx?`Vandaag volgende (uit Word): ${nx.at} ${nx.vak}`+(plan.auto?' (start vanzelf)':''):'Vandaag geen lessen meer.'}
  else if(d>=1&&d<=5){const nx=plan.rooster[d].filter(x=>plan.vakken[x.vak]&&slotTime(x.at)>n).sort((a,b)=>a.at.localeCompare(b.at))[0];
    if(nx)txt=`Vandaag volgende: ${nx.at} ${nx.vak}`+(plan.auto?' (start vanzelf)':'');else txt='Vandaag geen lessen meer.'}
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
  const suffix=x=>/^werkboeken klaarleggen$/i.test(x)&&les0?x+' voor '+les0.vak.toLowerCase():x;
  // taken uit de Ochtend-rij komen eerst; dubbele taken (ook 'Werkboeken klaarleggen') maar één keer
  const list=[...(wm?arr(wm.tasks).map(suffix):[]),...fixed];
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
    morning:mo,hw:hwList()};const sig=JSON.stringify(d);
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
    if(next){nb.append('Straks: ');const b=document.createElement('b');b.textContent=next.at+' '+next.vak;nb.append(b)}else nb.textContent='Dit is de laatste les van vandaag';
  } else nb.classList.add('hide');
  if(!blocks.length)$('kDayOver').classList.add('hide');
}
let morningKey='',mPop=-1;
const fKey = () => 'fz_mfirst_'+today();
const getFTicks = () => {try{return JSON.parse(store.get(fKey())||'[]')}catch(e){return []}};
function renderFree(endOfDay){
  const nx0=curDay&&curDay.next;const nx=nx0&&nx0.date>today()?nx0:null;const now=new Date();const wd=now.getDay(); // verouderde 'volgende dag' negeren
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
      const tm=arr(curDay&&curDay.hw).filter(x=>x.date===nx.date).map(x=>x.vak);if(tm.length)text+=' Denk aan: '+tm.slice(0,3).join(', ')+'.';
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
