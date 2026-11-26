/* =================== Word (dagklapper) =================== */
const MAAND_RE='jan|feb|mrt|maa|apr|mei|jun|jul|aug|sep|okt|nov|dec';
function hwHash(t){let h=0;for(const c of t)h=(h*31+c.charCodeAt(0))|0;return (h>>>0).toString(36)}
function schoolYear(mon,ref){const r=ref||new Date();const start=r.getMonth()>=7?r.getFullYear():r.getFullYear()-1;return mon>=7?start:start+1}
function parseWhen(txt,cell){ // "25 nov 2026", "25-11", "Elke vrijdag", "Elke week" of een Word-datumveld
  const t=String(txt||'').toLowerCase().trim();
  if(cell){const de=cell.getElementsByTagNameNS(W_NS,'date')[0];const fd=de&&de.getAttributeNS(W_NS,'fullDate');if(fd&&/^\d{4}-\d{2}-\d{2}/.test(fd))return {date:fd.slice(0,10)}}
  let m=t.match(/elke\s+(maandag|dinsdag|woensdag|donderdag|vrijdag)/);if(m)return {rep:DAG.indexOf(m[1])};
  if(/elke\s+week|wekelijks|iedere\s+week/.test(t))return {rep:'week'};
  m=t.match(new RegExp('(\\d{1,2})\\s*('+MAAND_RE+')[a-z]*\\.?(?:\\s+(\\d{4}))?'));
  if(m){const mon=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'].indexOf(m[2]==='maa'?'mrt':m[2]);const y=m[3]?+m[3]:schoolYear(mon);return {date:`${y}-${pad(mon+1)}-${pad(+m[1])}`}}
  m=t.match(/(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?/);
  if(m){const mon=+m[2]-1;if(mon<0||mon>11)return null;let y=m[3]?+m[3]:schoolYear(mon);if(y<100)y+=2000;return {date:`${y}-${pad(mon+1)}-${pad(+m[1])}`}}
  return null;
}
let parseHW=[];
function hwRows(rows,h0){
  const iV=h0.findIndex(h=>/^vak/.test(h)),iW=h0.findIndex(h=>/wat|doen|opdracht|leerstof/.test(h)),iD=h0.findIndex(h=>/wanneer|datum|deadline|inleveren/.test(h));
  for(const tr of rows.slice(1)){
    const cells=kids(tr,'tc');const c=cells.map(wText);const vak=(c[iV]||'').replace(/\n/g,' ').trim();if(!vak)continue;
    const wat=iW>=0?(c[iW]||'').replace(/\n/g,' ').trim():'';const whenTxt=(c[iD]||'').replace(/\n/g,' ').trim();
    const w=parseWhen(whenTxt,cells[iD]);
    if(!w){parseIssues.push({date:today(),msg:`Huiswerk/toetsen: bij "${vak}" staat geen datum of "Elke week"`});continue}
    const it={vak:vak.slice(0,60),wat:wat.slice(0,160),date:w.date||'',rep:w.rep===undefined?'':w.rep};
    it.id=hwHash(it.vak+'|'+it.wat+'|'+it.date+'|'+it.rep);parseHW.push(it);
  }
}
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
function textBefore(tbl){ // tekst van de alinea's vlak boven een tabel (bijv. een kop 'Maandag 30 november')
  let out='',n=tbl.previousSibling,k=0;
  while(n&&k<4){if(n.nodeType===1){if(n.localName==='tbl')break;if(n.localName==='p'){const t=Array.from(n.getElementsByTagNameNS(W_NS,'t')).map(x=>x.textContent).join('');if(t.trim()){out=t;break}}k++}n=n.previousSibling}
  return out;
}
function dateFromHeader(txt,ref){ // "Maandag 30 november", "ma 30 nov", "30-11", "30/11/2026"
  const t=String(txt||'').toLowerCase();let day,mon,yr=0;
  const MK=['jan','feb','maa','apr','mei','jun','jul','aug','sep','okt','nov','dec'];let m=null;
  for(const x of t.matchAll(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sept?|okt|nov|dec)\b\.?/g)){
    if(+x[1]>=1&&+x[1]<=31){m=x;break}}
  if(m){day=+m[1];const k=m[2]==='mrt'?'maa':m[2].slice(0,3);mon=MK.indexOf(k)}
  else{m=t.match(/(?:^|[^\d])(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?(?![\d:])/);if(!m||/\d[.:]\d{2}\s*$/.test(m[0]))return null;day=+m[1];mon=+m[2]-1;if(m[3])yr=+m[3]<100?2000+(+m[3]):+m[3]}
  if(!(mon>=0&&mon<=11&&day>=1&&day<=31))return null;
  if(yr)return `${yr}-${pad(mon+1)}-${pad(day)}`;
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
  const noTag=x=>x.replace(/\s*\[[^\]]{1,30}\]/g,'').trim();
  if(!parts.some(x=>MIN_RE.test(noTag(x))&&noTag(x).replace(MIN_RE,'').trim()))return {title:txt,tasks:[]};
  const tasks=[],rest=[];
  parts.forEach(x0=>{let tg='';const x=x0.replace(/\s*\[[^\]]{1,30}\]/g,q=>{tg+=' '+q.trim();return ''}).trim(); // [basis] [plus]: instructiegroep
    const m=x.match(MIN_RE);const t=x.replace(MIN_RE,'').replace(/[\s,:–-]+$/,'').trim();
    if(m&&t)tasks.push({t:(t+tg).slice(0,100),m:Math.min(240,+m[1])});else if(tasks.length)tasks.push({t:(x+tg).slice(0,100),m:0});else rest.push(x0)});
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
  if(typeof JSZip==='undefined')await loadScript('vendor/jszip.min.js');
  const zip=await JSZip.loadAsync(buf);
  const f=zip.file('word/document.xml');if(!f)throw new Error('Dit lijkt geen Word-bestand (.docx).');
  const xml=new DOMParser().parseFromString(await f.async('string'),'application/xml');
  const days={};parseIssues=[];parseMorning={};parseHW=[];
  for(const tbl of xml.getElementsByTagNameNS(W_NS,'tbl')){
    const rows=kids(tbl,'tr');
    const cellsOf=tr=>kids(tr,'tc').map(wText);
    if(rows.length>=2){const h0=cellsOf(rows[0]).map(x=>x.toLowerCase().trim());
      if(h0.some(h=>/^vak/.test(h))&&h0.some(h=>/wanneer|datum|deadline|inleveren/.test(h))){hwRows(rows,h0);continue}}
    if(rows.length<2)continue;
    // kopregel zoeken: 'Tijd' + 'Vak' (of Les/Activiteit), in rij 1 of 2
    const isT=h=>/^(tijd|time|uur|tijdstip|wanneer)\b/.test(h), isV=h=>/^(vak|les\b|activiteit|onderdeel|vakgebied)/.test(h);
    let hi=-1;for(let r=0;r<Math.min(2,rows.length);r++){const h=cellsOf(rows[r]).map(x=>x.toLowerCase().trim());if(isT(h[0]||'')&&h.some(isV)){hi=r;break}}
    if(hi<0)continue;
    const hdr=cellsOf(rows[hi]).map(x=>x.toLowerCase().trim());
    const head=hi===1?cellsOf(rows[0]).join(' '):textBefore(tbl);
    const date=dateFromHeader(head);
    if(!date)continue; // tabel zonder dag en datum: overslaan
    const iV=hdr.findIndex(isV), iL=hdr.findIndex(h=>/leerstof|lesstof|inhoud|taken|opdracht|^wat/.test(h)), iD=hdr.findIndex(h=>/lesdoel|leerdoel|ik-doel|doel/.test(h));
    const blocks=[];
    for(const tr of rows.slice(hi+1)){
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
    if(blocks.length)days[date]=blocks;else parseIssues.push({date,msg:'geen lessen gevonden in de tabel'});
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
  const n=Object.keys(all).length;if(!n)throw new Error('Geen dagen gevonden. Focuz zoekt tabellen met de kolommen Tijd en Vak, met erboven een dag en datum zoals "Maandag 30 november". Download het sjabloon voor een voorbeeld.');
  const kd=keepDays(all),last=Object.keys(kd).sort().pop()||today();
  const km={};for(const k in parseMorning)if(kd[k]||(k>=today()&&k<=last))km[k]=parseMorning[k];
  plan.word={file:fileName||'Word-bestand',at:Date.now(),days:kd,morning:km,hw:parseHW.filter(x=>!x.date||x.date>=today()).slice(0,40),issues:parseIssues.filter(x=>x.date>=today()&&x.date<=last).slice(0,20)};
  savePlan();renderWordToday();renderNext();renderMorningPrev();renderHwTeacher();
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
  const key=JSON.stringify([up,iss]);updReady();if(key===checkKey)return;checkKey=key;
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
  try{const n=await importWord(await f.arrayBuffer(),f.name);void n}
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
let wShowAll=false;
async function updateDagklapper(btn){ // knop 'Dagklapper bijwerken'
  const lab=btn.textContent;const done=(t,ok=true)=>{btn.textContent=t;btn.classList.toggle('okflash',ok);setTimeout(()=>{btn.textContent=lab;btn.classList.remove('okflash')},2500)};
  if(fileHandle){
    try{let p=await fileHandle.queryPermission({mode:'read'});if(p!=='granted')p=await fileHandle.requestPermission({mode:'read'});filePerm=p;
      if(p!=='granted'){done('Geen toegang',false);renderAuto();return}
      btn.textContent='Bijwerken…';await readHandle(true);done('Bijgewerkt ✓')}catch(e){done('Mislukt',false)}
    return}
  if(plan&&plan.msFile&&typeof msRefresh==='function'){btn.textContent='Bijwerken…';try{await msRefresh(true);done('Bijgewerkt ✓')}catch(e){done('Mislukt',false)}return}
  $('wFile').click(); // geen koppeling (bijv. iPad): kies het bestand
}
if(/[?&]fztest\b/.test(location.search))window.__fz={link:n=>{fileHandle={name:n};filePerm='granted';if(plan&&plan.word)plan.word.issues=[];renderAuto()}};
let wAutoOpened=false,wAutoNow=false;
function updReady(){ // samenvatting van de dagklapper in de optielijst; bij een probleem klapt hij open
  const sum=$('wSum');if(!sum)return;
  const iss=plan&&plan.word?plan.word.issues.filter(x=>x.date>=today()):[];
  const auto=!!(fileHandle&&filePerm==='granted');
  let t,warn=false;
  if(!plan||!plan.word){t='Nog niet ingelezen · tik om je dagklapper te kiezen';warn=true}
  else{const up=Object.keys(plan.word.days).filter(k=>k>=today()).sort();const last=up[up.length-1];
    const at=new Date(plan.word.at||Date.now());const atTxt=(ymd(at)===today()?'vandaag':DAG[at.getDay()].slice(0,2)+' '+at.getDate()+' '+MAAND[at.getMonth()])+' '+clock(at.getTime());
    t=(auto?'Gekoppeld, werkt automatisch bij':'Ingelezen '+atTxt)+' · '+up.length+' lesdagen';
    if(last){const [y,mo,d]=last.split('-').map(Number);const dt=new Date(y,mo-1,d);t+=' t/m '+DAG[dt.getDay()].slice(0,2)+' '+d+' '+MAAND[mo-1]}
    if(iss.length){t=iss.length+(iss.length===1?' punt':' punten')+' om na te kijken · '+t;warn=true}
    if(fileHandle&&filePerm!=='granted'){t='Klik om de koppeling weer toegang te geven · '+t;warn=true}}
  sum.textContent=t;sum.classList.toggle('warn',warn);
  if(warn&&!wAutoOpened&&$('wOpt')&&!document.querySelector('details.opt[open]')){wAutoOpened=true;wAutoNow=true;$('wOpt').open=true}
  else if(!warn&&wAutoNow&&$('wOpt').open){wAutoNow=false;$('wOpt').open=false} // ingelezen: weer inklappen
}
function renderAuto(){renderAuto0();updReady()}
function renderAuto0(){ // één regel met de koppeling, en alleen de knop die nu nodig is
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
  renderPresets();
  if(!store.get('kt_wizard')&&!PROBEER&&!(plan&&plan.word&&Object.keys(plan.word.days).length))$('wiz').classList.remove('hide');
  curVak=store.get('kt_curvak');if(!plan.vakken[curVak])curVak=Object.keys(plan.vakken)[0];
  renderVakBar();renderChips();
  $('tCode').textContent=code;$('kSum').textContent='Klascode '+code;
  const url=location.origin+location.pathname+'?klas='+code;$('tLink').value=url;
  try{const q=qrcode(0,'M');q.addData(url);q.make();$('tQr').innerHTML=q.createSvgTag({cellSize:4,margin:2,scalable:true});$('tQr').classList.remove('hide')}catch(e){$('tQr').classList.add('hide')}
  if(!/^https?:$/.test(location.protocol))$('tQrNote').textContent='Let op: de QR-code werkt pas als Focuz online staat. De klascode intypen werkt wel.';
  $('tSound').checked=store.get('kt_sound')!=='0';
  renderWordToday();initAuto();bindMorning();
  if(plan.msFile){$('wMsBox').classList.remove('hide');renderMs();msRefresh(false)}
  else if(msClientId()&&/code=|state=/.test(location.hash)){$('wMsBox').classList.remove('hide');renderMs()}
  $('tMode').textContent=USE_FB?'Eigen server · alleen jij kunt de timer besturen':'Openbare server · planning staat op dit apparaat';
}

function bindKidOpts(){$('oCalm').checked=plan.kidOpts.calm;$('oWeek').checked=plan.kidOpts.week;$('oBig').checked=plan.kidOpts.big;$('tGroep').value=plan.groep?String(plan.groep):''}
$('oCalm').addEventListener('change',()=>{plan.kidOpts.calm=$('oCalm').checked;savePlan();publishDay()});
$('oWeek').addEventListener('change',()=>{plan.kidOpts.week=$('oWeek').checked;savePlan();publishDay()});
$('oBig').addEventListener('change',()=>{plan.kidOpts.big=$('oBig').checked;savePlan();publishDay()});
$('tGroep').addEventListener('change',()=>{const g=+$('tGroep').value||0;plan.groep=g;
  if(g){plan.kidOpts.big=g<=4;$('oBig').checked=plan.kidOpts.big;
    if(g<=4&&plan.morning.text==='Fijn dat je er bent! Begin rustig aan de dag.')plan.morning.text='Goedemorgen! Fijn dat je er bent.'}
  savePlan();publishDay();renderMorningPrev&&renderMorningPrev()});
function bindMorning(){bindKidOpts();
  $('oText').value=plan.morning.text;$('oTasks').value=plan.morning.tasks;$('oOn').checked=plan.morning.on;$('oAuto').checked=plan.morning.auto;fitTa($('oTasks'));renderMorningPrev();
}
function renderMorningPrev(){ // voorbeeld van wat de iPads morgenochtend (of vandaag) tonen
  if(!plan)return;const now=new Date();let d=now;const bl=blocksFor(now);
  if(!bl.length||hmNow()>=bl[0].at)d=nextSchoolDay();
  const m=morningFor(d);const box=$('oPrev');box.innerHTML='';
  if(!m){box.textContent='Het ochtendscherm staat uit.';return}
  const h=document.createElement('b');h.textContent=(ymd(d)===today()?'Vandaag':DAG[d.getDay()].replace(/^./,c=>c.toUpperCase())+' '+d.getDate()+' '+MAAND[d.getMonth()])+' op de iPads:';box.append(h);
  const p=document.createElement('div');p.className='small';p.textContent=m.text;box.append(p);
  const ul=document.createElement('ul');(m.tasks.length?m.tasks:['(geen taken)']).forEach(t=>{const li=document.createElement('li');li.textContent=t;ul.append(li)});box.append(ul);
}
function fitTa(el){if(!el||!el.offsetParent)return;el.style.height='auto';el.style.height=(el.scrollHeight+4)+'px'}
function fitAllTa(){document.querySelectorAll('textarea.auto').forEach(fitTa)}
document.addEventListener('input',e=>{if(e.target.matches&&e.target.matches('textarea.auto'))fitTa(e.target)});
document.addEventListener('toggle',e=>{if(e.target.matches&&e.target.matches('details.opt'))fitAllTa()},true);
function closeWiz(){$('wiz').classList.add('hide');store.set('kt_wizard','1')}
function renderBackup(){const at=+store.get('kt_backup_at')||0;const el=$('bkInfo');if(!el)return;
  el.textContent=at?'Laatste reservekopie: '+new Date(at).toLocaleDateString('nl-NL',{day:'numeric',month:'long'})+' om '+clock(at)+'.':'Nog geen reservekopie gemaakt.'}
function renderJoin(){
  const el=$('jScreen');if(!el||el.classList.contains('hide'))return;
  const n=kidsInfo.length;const c=$('jCount');c.classList.toggle('on',n>0);
  c.querySelector('span').textContent=n?(n===1?'1 iPad gekoppeld':n+' iPads gekoppeld'):'Nog geen iPads gekoppeld';
}
function openJoin(){
  const url=location.origin+location.pathname+'?klas='+code;
  try{const q=qrcode(0,'M');q.addData(url);q.make();$('jQr').innerHTML=q.createSvgTag({cellSize:6,margin:1,scalable:true})}catch(e){$('jQr').textContent=''}
  $('jUrl').textContent=(location.host+location.pathname).replace(/\/(index\.html)?$/,'')||'sandromeertens.github.io/Focuz';
  const box=$('jCode');box.innerHTML='';String(code).split('').forEach(ch=>{const b=document.createElement('span');b.textContent=ch;box.append(b)});
  $('jScreen').classList.remove('hide');document.body.classList.add('kvopen');
  try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{})}catch(e){}
  renderJoin();
}
function closeJoin(){$('jScreen').classList.add('hide');document.body.classList.remove('kvopen');try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}}
function bindTeacher(){
  $('oText').addEventListener('input',()=>{plan.morning.text=$('oText').value;savePlan();renderMorningPrev()});
  $('oTasks').addEventListener('input',()=>{plan.morning.tasks=$('oTasks').value;savePlan();renderMorningPrev()});
  $('oOn').addEventListener('change',()=>{plan.morning.on=$('oOn').checked;savePlan();renderMorningPrev()});
  $('oAuto').addEventListener('change',()=>{plan.morning.auto=$('oAuto').checked;savePlan();renderMorningPrev()});
  // tabbladen
  const setTab=t=>{document.querySelectorAll('#tTabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
    document.querySelectorAll('#teacher .tab').forEach(x=>x.classList.toggle('on',x.dataset.tab===t));store.set('fz_tab',t)};
  $('tTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.tab)});
  {const ft=store.get('fz_tab');if(ft==='klas')setTab('rooster');else if(['nu','rooster'].includes(ft))setTab(ft)}
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
  $('tKidBtn').addEventListener('click',()=>$('tKidView').click());$('tKidView2').addEventListener('click',()=>$('tKidView').click());
  $('wUpd').addEventListener('click',e=>updateDagklapper(e.currentTarget));$('dUpd').addEventListener('click',e=>updateDagklapper(e.currentTarget));
  $('hwCopy').addEventListener('click',async()=>{const url=location.origin+location.pathname+'?thuis='+code;
    try{await navigator.clipboard.writeText(url);$('hwCopy').textContent='Gekopieerd'}catch(e){prompt('Kopieer deze link:',url)}
    setTimeout(()=>$('hwCopy').textContent='Kopieer link',1500)});
  renderHwTeacher();
  $('tJoin').addEventListener('click',openJoin);$('tJoinBtn').addEventListener('click',openJoin);$('jClose').addEventListener('click',closeJoin);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('jScreen').classList.contains('hide'))closeJoin()});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!$('kvModal').classList.contains('hide')){/* blijft open als venster */}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('kvModal').classList.contains('hide'))kvClose()});
  $('tVak').addEventListener('change',()=>{curVak=$('tVak').value;chosenMin=null;$('tTime').value='';savePlan();renderVakBar();renderChips()});
  $('tVakPreset').addEventListener('click',async()=>{
    const P={Rekenen:{tasks:[{t:'Instructie aan de instructietafel',m:15},{t:'Opdrachten in je werkboek',m:30},{t:'Nakijken met een andere kleur',m:5}],extra:'Weektaak Gynzy maken\nRedactiesommen.nl oefenen\nAutomatiseren op Gynzy'},
      Spelling:{tasks:[{t:'Instructie',m:10},{t:'Opdrachten in je werkboek',m:25},{t:'Nakijken',m:5}],extra:'Spelling peiltaken op Basispoort\nWerkwoordspelling oefenen'},
      Taal:{tasks:[{t:'Instructie',m:10},{t:'Opdrachten in je werkboek',m:15},{t:'Nakijken',m:5}],extra:'Woorden van de week oefenen\nLezen in je leesboek'}};
    const done=[],skip=[];
    for(const v in P){const cur=plan.vakken[v];const has=cur&&(cur.tasks.some(x=>x.t.trim())||String(cur.extra||'').trim());
      if(has){skip.push(v);continue}
      plan.vakken[v]={title:cur?cur.title:'',doel:cur?cur.doel:'',tasks:P[v].tasks.map(x=>({...x})),extra:P[v].extra};done.push(v)}
    if(done.length){curVak=done[0];savePlan();renderVakBar();renderChips()}
    await ask({title:'Voorstel ingevuld',text:(done.length?'Ingevuld: '+done.join(', ')+'. ':'')+(skip.length?'Niet aangepast, want je had al iets ingesteld: '+skip.join(', ')+'. ':'')+'Je kunt alles hieronder nog aanpassen.'});
  });
  $('tVakAdd').addEventListener('click',async()=>{const n=cleanName(await ask({title:'Nieuw vak',text:'Hoe heet het vak?',input:''}));if(!n)return;if(!plan.vakken[n])plan.vakken[n]={title:'',doel:'',tasks:[{t:'',m:15}],extra:''};curVak=n;savePlan();renderVakBar();renderChips()});
  $('tVakRen').addEventListener('click',async()=>{const n=cleanName(await ask({title:'Vak hernoemen',input:curVak}));if(!n||n===curVak||plan.vakken[n])return;
    const nv={};for(const k in plan.vakken)nv[k===curVak?n:k]=plan.vakken[k];plan.vakken=nv;
    for(let d=1;d<=5;d++)plan.rooster[d].forEach(x=>{if(x.vak===curVak)x.vak=n});curVak=n;savePlan();renderVakBar()});
  $('tVakDel').addEventListener('click',async()=>{if(Object.keys(plan.vakken).length<2)return;if(!await ask({title:'Vak verwijderen?',text:`"${curVak}", de vaste taken en de lessen in het rooster worden verwijderd.`,ok:'Verwijder'}))return;
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
  $('tStop').addEventListener('click',async()=>{if(!await ask({title:'Vak stoppen?',text:'De timer stopt op alle iPads. De volgende les start weer gewoon op tijd.',ok:'Stop'}))return;publishState({v:3,status:'idle',sound:$('tSound').checked,auto:state.auto||'',stoppedAt:srvNow()})});
  $('tCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('tLink').value);$('tCopy').textContent='Gekopieerd'}catch(e){$('tLink').select()}setTimeout(()=>$('tCopy').textContent='Kopieer link',1500)});
  const openOpt=id=>{document.querySelector('#tTabs [data-tab=rooster]').click();document.querySelectorAll('details.opt').forEach(d=>d.open=d.id===id)};
  $('wiz').addEventListener('click',e=>{const b=e.target.closest('[data-wiz]');if(!b)return;const a=b.dataset.wiz;
    if(a==='done'){closeWiz();return}
    if(a==='word'){closeWiz();openOpt('wOpt');setTimeout(()=>$('wUpd').click(),50)}
    if(a==='rooster'){closeWiz();openOpt('rOpt')}
    if(a==='join'){openJoin()}
    if(a==='kid'){closeWiz();$('tKidView').click()}});
  const refreshVer=()=>{const n=recentErrors(7*864e5).length;$('hVer').textContent='Focuz versie '+VERSION+' · '+(n?n+(n===1?' foutmelding':' foutmeldingen')+' in de afgelopen week (gaan mee met je vraag)':'geen foutmeldingen')};
  refreshVer();$('hOpt').addEventListener('toggle',refreshVer);
  $('hWiz').addEventListener('click',()=>$('wiz').classList.remove('hide'));
  $('hFeedback').addEventListener('click',()=>{const to=window.FOCUZ_FEEDBACK_EMAIL||'';
    const errs=recentErrors(7*864e5).slice(-10).map(x=>new Date(x.t).toLocaleString('nl-NL')+(x.n>1?' ('+x.n+'x)':'')+' · '+x.m+(x.s?' ['+x.s+']':'')).join('\n');
    const body='Mijn vraag of probleem:\n\n\n---\nFocuz '+VERSION+'\nApparaat: '+navigator.userAgent+'\nKlascode: '+code+'\nDatum: '+new Date().toLocaleString('nl-NL')+'\n\nFoutmeldingen (laatste 7 dagen):\n'+(errs||'geen');
    location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent('Focuz: vraag of probleem')+'&body='+encodeURIComponent(body)});
  $('dLog').addEventListener('click',()=>{renderDayLog();$('dlModal').classList.remove('hide')});
  $('dlClose').addEventListener('click',()=>$('dlModal').classList.add('hide'));
  $('dlDate').addEventListener('change',()=>renderDayLog($('dlDate').value));
  $('tUseCode').addEventListener('click',async()=>{
    const v=await ask({title:'Klascode van een ander apparaat',text:'Typ de klascode die je op je andere apparaat ziet. De iPads blijven dan gekoppeld.',input:'',ok:'Gebruiken'});
    const c=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!c)return;
    if(!validCode(c)){await ask({title:'Dat is geen geldige klascode',text:'Een klascode bestaat uit 6 letters en cijfers.'});return}
    T&&T.stop();T=null;state={status:'idle'};code=c;store.set('kt_teacher_code',code);kidsInfo=[];setupTeacher();connect();render();
  });
  $('bkSave').addEventListener('click',()=>{
    const data={app:'Focuz',v:1,at:new Date().toISOString(),code,plan};
    const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='Focuz reservekopie '+today()+'.json';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
    store.set('kt_backup_at',String(Date.now()));renderBackup()});
  $('bkLoad').addEventListener('click',()=>$('bkFile').click());
  $('bkFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
    try{const d=JSON.parse(await f.text());if(!d||d.app!=='Focuz'||!d.plan)throw 0;
      if(!await ask({title:'Reservekopie terugzetten?',text:'Je huidige instellingen worden vervangen door die van '+String(d.at||'').slice(0,10)+(d.code?'. Klascode wordt '+d.code+'.':'.'),ok:'Terugzetten'}))return;
      plan=normPlan(d.plan);savePlan();
      if(validCode(String(d.code||''))&&d.code!==code){T&&T.stop();T=null;state={status:'idle'};code=d.code;store.set('kt_teacher_code',code);kidsInfo=[];setupTeacher();connect()}
      else setupTeacher();
      render();await ask({title:'Teruggezet',text:'Je instellingen zijn teruggezet.'})}
    catch(err){await ask({title:'Dit bestand kan ik niet gebruiken',text:'Kies een reservekopie die Focuz heeft gemaakt.'})}});
  renderBackup();
  $('tNewCode').addEventListener('click',async()=>{
    if(!await ask({title:'Nieuwe klascode?',text:'Alle iPads moeten dan opnieuw koppelen.',ok:'Nieuwe code'}))return;
    T&&T.clear();T&&T.stop();T=null;state={status:'idle'};
    if(USE_FB){try{code=await claimCode()}catch(e){$('tErr').textContent='Nieuwe code maken mislukt.';return}}
    else{code=newCode();store.set('kt_teacher_code',code)}
    kidsInfo=[];setupTeacher();connect();render();
  });
  // rooster
  $('rDays').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;rDay=+b.dataset.d;renderRooster()});
  $('rCopy').addEventListener('click',async()=>{const src=plan.rooster[rDay];if(!src.length)return;
    if(!await ask({title:'Naar alle dagen kopiëren?',text:'De lessen van '+['','maandag','dinsdag','woensdag','donderdag','vrijdag'][rDay]+' komen ook op de andere dagen. Wat daar stond, wordt vervangen.',ok:'Kopiëren'}))return;
    for(let d=1;d<=5;d++)if(d!==rDay)plan.rooster[d]=src.map(x=>({...x}));savePlan();renderRooster();publishDay&&publishDay()});
  $('rAdd').addEventListener('click',()=>{const rows=plan.rooster[rDay];const last=rows.length?rows[rows.length-1].at:'08:30';
    const [h,m]=last.split(':').map(Number);const nt=`${pad(Math.min(23,h+1))}:${pad(m)}`;rows.push({at:rows.length?nt:'08:45',vak:curVak});savePlan();renderRooster()});
  $('rRows').addEventListener('change',e=>{const r=e.target.closest('.rr');if(!r)return;const x=plan.rooster[rDay][+r.dataset.i];
    if(e.target.classList.contains('rt')&&e.target.value)x.at=e.target.value;if(e.target.classList.contains('rv'))x.vak=e.target.value;savePlan();renderRooster()});
  $('rRows').addEventListener('click',e=>{if(!e.target.classList.contains('rdel'))return;plan.rooster[rDay].splice(+e.target.closest('.rr').dataset.i,1);savePlan();renderRooster()});
  $('rAuto').addEventListener('change',()=>{plan.auto=$('rAuto').checked;savePlan();renderNext()});
}

