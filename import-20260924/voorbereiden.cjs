const fs=require('fs'),path=require('path');const dir=__dirname;
const browser=new Map(fs.readFileSync(path.join(dir,'browser-gegevens.tsv'),'utf8').trim().split(/\r?\n/).map(l=>{const [id,pack,name]=l.split('\t');return [id,{name,pack:Number(pack)}]}));
async function main(){
 const rows=JSON.parse(fs.readFileSync(path.join(dir,'producten.json')));
 for(const p of rows){
  const b=browser.get(p.id);
  if(b){p.name=b.name;p.pack=b.pack;p.image=`https://polvobv.nl/product/image/mediumlarge/${p.id}_0.jpeg`;delete p.error;}
  else {const h=fs.readFileSync(path.join(dir,p.id+'.html'),'utf8');const dl=[...h.matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/g)].map(x=>x[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).join(' ');p.pack=Number(dl.match(/verpakt per (\d+)/)?.[1]||0);}
  if(!p.name||!p.image)throw Error('Incompleet '+p.id);
  const img=path.join(dir,p.id+'.jpg');if(!fs.existsSync(img)){const r=await fetch(p.image);if(!r.ok)throw Error('Foto '+p.id);fs.writeFileSync(img,Buffer.from(await r.arrayBuffer()));}
  p.unit='stuk';p.packaged_per=Math.max(1,p.pack);
  if(p.id==='237262') {p.unit='set';p.packaged_per=1;}
  if(p.id==='3211895'||p.url.includes('draad-nagels/')) {p.unit='pak';p.packaged_per=1;}
  if(p.id==='244003')p.unit='rol';
  p.category=p.url.includes('/schroeven/')?'Schroeven':p.url.includes('/draad-nagels/')?'Nagels':p.url.includes('/balkdragers/')?'Balkdragers':p.url.includes('/kitten/')?'Kit':p.url.includes('/smeermiddelen-')?'Smeermiddelen':p.url.includes('/verven-en-lakken/')?'Verf':p.url.includes('/kwasten/')?'Kwasten':p.url.includes('/rollers-en-bakjes/')?'Rollers en bakjes':p.url.includes('/purschuim/')?'Purschuim toebehoren':p.url.includes('/vulmiddelen/')?'Plamuur':p.url.includes('/voegbanden/')?'Afdichtingsbanden':p.url.includes('/scharnieren/')?'Scharnieren':'Poetspapier';
 }
 if(rows.length!==36||new Set(rows.map(p=>p.id)).size!==36)throw Error('Aantal');
 fs.writeFileSync(path.join(dir,'import.json'),JSON.stringify(rows,null,2));console.log('36 producten compleet, inclusief foto, bron, naam en verpakking.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
