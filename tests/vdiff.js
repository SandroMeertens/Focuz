// Vergelijkt twee mappen met schermafbeeldingen: node vdiff.js mapA mapB
const fs=require('fs'),{PNG}=require('pngjs'),pm=require('pixelmatch');
const [a,b]=process.argv.slice(2);let bad=0;
for(const f of fs.readdirSync(a).filter(x=>x.endsWith('.png')).sort()){
  if(!fs.existsSync(b+'/'+f)){console.log('ONTBREEKT',f);bad++;continue}
  const A=PNG.sync.read(fs.readFileSync(a+'/'+f)),B=PNG.sync.read(fs.readFileSync(b+'/'+f));
  if(A.width!==B.width||A.height!==B.height){console.log('MAAT',f);bad++;continue}
  const n=pm(A.data,B.data,null,A.width,A.height,{threshold:0.1});
  if(n>0){console.log('VERSCHIL',f,n);bad++}
}
console.log(bad?bad+' verschillen':'alles gelijk');
