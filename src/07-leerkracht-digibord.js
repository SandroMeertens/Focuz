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
  $('nLabel').textContent=v.src==='done'?'Tijd is om':s.status==='paused'&&active?'Gepauzeerd':'Nu';$('nLabel').classList.toggle('hide',!(v.src==='done'||(active&&s.status==='paused')));
  $('nSrc').textContent=v.src==='auto'?'Gestart volgens rooster':v.src==='teacher'?(s.auto||s.wordAt?'Gestart volgens rooster':'Zelf gestart'):'';
  const nb=nextBlock();
  if(active||v.src==='done'){
    $('nVak').textContent=s.vak||'';$('nTitle').textContent=s.task||'';$('nTitle').classList.toggle('hide',!s.task);
    {const dm=splitDoel(s.doel)[0];$('nDoelTxt').textContent=dm;$('nDoel').classList.toggle('hide',!dm)}
    $('nBig').textContent=v.src==='done'?'00:00':fmt(rem);
    $('nEnd').textContent=s.status==='paused'?'staat stil':v.src==='done'?'':'tot '+clock(s.endAt-offset);
    $('nBar').style.width=(v.src==='done'?0:Math.max(0,Math.min(1,rem/total))*100)+'%';
    $('nCtl').classList.toggle('hide',v.src==='done');$('tPause').textContent=s.status==='paused'?'Hervat':'Pauze';$('tMin').disabled=s.status==='running'&&rem<6*60000;
    // voortgang van de klas
    const tasks=arr(s.tasks).filter(x=>x&&x.t);const here=kidsInfo.filter(k=>k.sid===s.sid);
    const pr=$('nProg');pr.innerHTML='';
    if(tasks.length){
      const mineOf=k=>tasks.map((x,i)=>i).filter(i=>{const g=taskTags(tasks[i].t).g;return !g.length||g.includes(k.grp)});
      const h=document.createElement('div');h.className='nph';const fin=here.filter(k=>mineOf(k).every(i=>k.ticks.includes(i))).length;
      h.textContent=here.length?`${fin} van ${here.length} klaar`:'Taken';pr.append(h);pr.classList.toggle('noprog',!here.length);
      tasks.slice(0,8).forEach((x,i)=>{const tt=taskTags(x.t);const hh=tt.g.length?here.filter(k=>tt.g.includes(k.grp)):here;const c=hh.filter(k=>k.ticks.includes(i)).length;const pct=hh.length?c/hh.length*100:0;
        const r=document.createElement('div');r.className='npr';r.innerHTML='<span class="t"></span><span class="b"><i></i></span><span class="c"></span>';
        r.querySelector('.t').innerHTML='<em></em><span></span>';r.querySelector('.t em').textContent=i+1;r.querySelector('.t span').textContent=tt.text;if(tt.g.length){const gb=document.createElement('b');gb.className='ngrp'+(isTable(x)?' tafel':'');gb.textContent=(isTable(x)?'Tafel · ':'')+tt.g.map(grpLabel).join(', ');r.querySelector('.t').append(gb)}
        r.querySelector('i').style.width=pct+'%';r.querySelector('.c').textContent=here.length?(hh.length?c+'/'+hh.length:'–'):(x.m?x.m+' min':'');pr.append(r)});
    }
    // reflectie van deze les
    {const rs=reflCounts(s.sid);$('nRefl').classList.toggle('hide',!rs.n);if(rs.n)$('nRefl').innerHTML=reflHtml(rs)}
  } else {
    const tb=todayBlocks(),hm=hmNow();
    $('nIdleTxt').textContent=!tb.length?'Geen lessen vandaag':hm<tb[0].at?'Goedemorgen':hm>=tb[tb.length-1].end?'Klaar voor vandaag':'Geen vak actief';
  }
  // na dit vak / straks
  if(nb){$('nAfter').innerHTML='';const sp=document.createElement('span');sp.textContent=nb.label+': ';const b=document.createElement('b');b.textContent=nb.b.at+' '+nb.b.vak;
    $('nAfter').append(sp,b);if(nb.b.title){const t=document.createElement('span');t.className='muted';t.textContent=' · '+nb.b.title;$('nAfter').append(t)}
    $('nNext').textContent=plan.auto?'De volgende les start vanzelf op de iPads.':'Automatisch starten staat uit. Start de volgende les zelf.';}
  else {$('nAfter').textContent='Geen rooster gevonden voor de komende dagen.';$('nNext').textContent='Lees je dagklapper in bij Instellingen, of zet je rooster in Focuz.'}
  // buiten lestijd: wat komt er, en welke toetsen
  if(nb&&!(active||v.src==='done')){$('nUp').classList.remove('hide');$('nUpLbl').textContent=nb.label;$('nUpVak').textContent=nb.b.at+'  '+nb.b.vak;$('nUpSub').textContent=nb.b.title?kidTitle(nb.b.title):''}
  else $('nUp').classList.add('hide');
  {const soon=hwSoon(hwList());$('nUpHw').textContent=soon?'Deze week: '+soon:'';$('nUpHw').classList.toggle('hide',!soon||active||v.src==='done')}
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
  {const ne=kidsInfo.filter(k=>k.err).length;if(ne)items.push(['warn',(ne===1?'1 iPad meldt':ne+' iPads melden')+' een fout · stuur hem mee via Hulp en uitleg'])}
  if(plan.word){const age=Date.now()-plan.word.at;const auto=(fileHandle&&filePerm==='granted')||plan.msFile;
    items.push([age>2*864e5?'warn':'ok',`Dagklapper ${ago(age)} ingelezen`+(auto?' · automatisch':'')]);
    if(age>2*864e5)warns.push('Je dagklapper is al '+ago(age).replace(' geleden','')+' niet ingelezen. Klopt de planning nog?');
    else if(!auto&&todayBlocks().length&&new Date(plan.word.at).toDateString()!==new Date().toDateString())warns.push('Je dagklapper is vandaag nog niet ingelezen en wordt niet automatisch bijgewerkt. Lees hem in bij Rooster.');
    const soon=plan.word.issues.filter(x=>x.date===today()||x.date===ymd(nextSchoolDay()));if(soon.length)warns.push('Je dagklapper heeft '+(soon.length===1?'een punt':soon.length+' punten')+' om te controleren voor vandaag of morgen (zie Rooster).');
    if(fileHandle&&filePerm!=='granted')warns.push('Ga naar Instellingen → Dagklapper en klik op "Toegang geven" om automatisch bijwerken weer aan te zetten.');
    const nd=nextSchoolDay();if(!plan.word.days[ymd(nd)]&&!(plan.rooster[nd.getDay()]||[]).length)warns.push(dayName(nd).split(',')[0]+' ('+DAG[nd.getDay()]+' '+nd.getDate()+' '+MAAND[nd.getMonth()]+') staat niet in je dagklapper.');
  } else {items.push(['warn','Geen dagklapper gekoppeld']);warns.push('Lees je dagklapper in bij Instellingen, dan starten de lessen vanzelf.')}
  const wd=weekDates();const has=wd.filter(d=>blocksFor(d).length);
  if(daySig&&has.length)items.push(['ok','Weekplanning op de iPads t/m '+DAG[has[has.length-1].getDay()].slice(0,2)+' '+has[has.length-1].getDate()+' '+MAAND[has[has.length-1].getMonth()]]);
  if(!plan.auto)items.push(['warn','Automatisch starten staat uit']);
  const key=JSON.stringify([items,warns]);if(key===statKey)return;statKey=key;
  const lvl=items.some(x=>x[0]==='bad')?'bad':(warns.length||items.some(x=>x[0]==='warn'))?'warn':nk?'ok':'off';
  const nw=warns.length+items.filter(x=>x[0]==='bad').length;
  $('sPill').className='spill '+lvl;
  $('sPillTxt').textContent=(nk===1?'1 iPad':nk+' iPads');$('sPill').title=nw?(nw===1?'1 aandachtspunt':nw+' aandachtspunten'):'Alles in orde';
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
  $('dPast').textContent=nPast?(showPast?'Verberg eerdere lessen':'Eerdere lessen ('+nPast+')'):'';$('dPast').classList.toggle('hide',!nPast);
  $('dHead').textContent=dayName(d);
  const ul=$('dList');ul.innerHTML='';
  if(!bl.length){ul.innerHTML='<li class="empty">Geen rooster. Koppel je dagklapper of vul het weekrooster in.</li>';return}
  const nextI=isToday?bl.findIndex(b=>b.at>n):0;
  bl.forEach((b,i)=>{
    const li=document.createElement('li');
    const isNow=isToday&&n>=b.at&&n<b.end, past=isToday&&n>=b.end, isNext=i===nextI&&!isNow;
    li.className=isNow?'now':past?'past':isNext?'next':'';if(past&&!showPast)return;if(isNow&&(v.src==='auto'||v.src==='teacher'))return;
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
function closePops(){['sPop','mPop','vPop'].forEach(id=>$(id).classList.add('hide'));$('sPill').setAttribute('aria-expanded','false')}
function togglePop(id,btn){const open=$(id).classList.contains('hide');closePops();if(open){$(id).classList.remove('hide');btn.setAttribute('aria-expanded','true');
  const r=btn.getBoundingClientRect();$(id).style.top=(r.bottom+8)+'px';$(id).style.right=Math.max(12,innerWidth-r.right)+'px';
  if(id==='mPop')setTimeout(()=>$('mText2').focus(),50)}}
$('sPill').addEventListener('click',e=>{e.stopPropagation();togglePop('sPop',$('sPill'))});
$('mBtn').addEventListener('click',e=>{e.stopPropagation();togglePop('mPop',$('mBtn'))});
$('vBtn').addEventListener('click',e=>{e.stopPropagation();togglePop('vPop',$('vBtn'))});
$('vPop').addEventListener('click',e=>{if(e.target.closest('button'))closePops()});
document.addEventListener('click',e=>{if(!e.target.closest('.pop'))closePops()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePops()});
let showPast=false;
$('dPast').addEventListener('click',()=>{showPast=!showPast;dayKey='';renderDayCard()});
$('qToggle').addEventListener('click',()=>{const h=$('qBox').classList.toggle('hide');$('qToggle').setAttribute('aria-expanded',String(!h));$('qToggle').textContent=h?'+ Losse timer':'Sluiten'});

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
  renderBoard(rem,total,done,warn,big,sub,active&&s.status==='running'?'Klaar om '+clock(Math.round((s.endAt-offset)/60000)*60000):'');
  state=save;
}
function renderBoard(rem,total,done,warn,big,sub,endTxt){
  if($('board').classList.contains('hide'))return;
  const b=$('board'),live=state.status!=='idle';
  b.classList.toggle('warn',warn);b.classList.toggle('done',done);b.classList.toggle('idle',!live||done);
  $('bVak').textContent=state.vak||'';$('bVak').classList.toggle('hide',!live||!state.vak);
  $('bTask').textContent=live?kidTitle(state.task||''):'';
  {const dm=splitDoel(state.doel)[0];$('bDoelTxt').textContent=dm;$('bDoel').classList.toggle('hide',!live||!dm)}
  $('bBig').textContent=!live?'Even wachten':big;
  $('bSub').textContent=!live?'':[sub,endTxt].filter(Boolean).join(' · ');
  $('bBar').style.width=(!live?0:done?0:Math.max(0,Math.min(1,rem/total))*100)+'%';
  // tussen de vakken: grote QR-code zodat kinderen zelf hun iPad koppelen
  // voor het eerste blok: ochtendscherm groot op het digibord
  const tb=todayBlocks(),mo=plan&&tb.length&&!live&&hmNow()<tb[0].at?morningFor(new Date()):null;
  $('bMorning').classList.toggle('hide',!mo);
  {const soon=hwSoon(hwList());$('bMHw').textContent=soon?'Deze week: '+soon:'';$('bMHw').classList.toggle('hide',!soon)}
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

