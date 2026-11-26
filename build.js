// Bouwt app.js uit de onderdelen in src/ (in volgorde). Gebruik: node build.js   (of: node build.js --check)
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'src');
const parts=fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort();
const out='/* Focuz – app (gebouwd uit src/ met build.js; niet hier bewerken) */\n{\n'+parts.map(f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\n+$/,'')).join('\n')+'\n}\n';
const target=path.join(__dirname,'app.js');
if(process.argv.includes('--check')){const cur=fs.readFileSync(target,'utf8');if(cur!==out){console.error('app.js is niet bijgewerkt: draai node build.js');process.exit(1)}console.log('app.js klopt');}
else{fs.writeFileSync(target,out);console.log('app.js gebouwd uit',parts.length,'onderdelen')}
