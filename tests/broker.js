// Lokale MQTT-server (websocket) voor de tests
const aedes=require('aedes')();const {createServer}=require('aedes-server-factory');
const port=+process.argv[2]||8899;
createServer(aedes,{ws:true}).listen(port,()=>console.log('broker klaar op',port));
// Statische webserver voor de app (http://localhost:8898): nodig voor Safari/WebKit (beveiligde context)
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return}
  r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(f).pipe(r)}).listen(port-1);
