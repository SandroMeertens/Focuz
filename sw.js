/* Focuz service worker: app opent ook zonder internet */
const CACHE='focuz-v31';
const CORE=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/favicon-64.png'];
const LIBS=['https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js','https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js','https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(CORE);
  await Promise.all(LIBS.map(u=>fetch(u,{mode:'no-cors'}).then(r=>c.put(u,r)).catch(()=>{})));self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})())});
const SKIP=/firebaseio|firebasedatabase|googleapis\.com\/identitytoolkit|securetoken|graph\.microsoft|login\.microsoftonline|emqx|hivemq/;
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET'||SKIP.test(r.url))return;
  const u=new URL(r.url);
  if(r.mode==='navigate'||u.origin===location.origin){
    // eigen bestanden: eerst internet (nieuwste versie), anders de bewaarde versie
    e.respondWith((async()=>{const c=await caches.open(CACHE);
      try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),4000);const res=await fetch(r,{signal:ctl.signal});clearTimeout(t);
        if(res.ok)c.put(r.mode==='navigate'?'./index.html':r,res.clone());return res}
      catch(err){return (await c.match(r.mode==='navigate'?'./index.html':r,{ignoreSearch:true}))||(await c.match('./'))||Response.error()}})());
    return;
  }
  // bibliotheken en lettertypen: bewaarde versie, en op de achtergrond bijwerken
  e.respondWith((async()=>{const c=await caches.open(CACHE);const hit=await c.match(r,{ignoreSearch:u.origin===location.origin});
    const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res}).catch(()=>null);
    return hit||(await net)||Response.error()})());
});
