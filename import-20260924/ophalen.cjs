const fs=require('fs'),path=require('path');
const dir=__dirname;
async function main(){
 const links=fs.readFileSync(path.join(dir,'links.txt'),'utf8').trim().split(/\r?\n/);
 const results=[];
 for(let offset=0;offset<links.length;offset+=4){
  const batch=await Promise.all(links.slice(offset,offset+4).map(async slug=>{
   const id=slug.match(/\d+$/)[0],url='https://polvobv.nl/nl-nl/assortiment-1/'+slug;
   const res=await fetch(url);if(!res.ok)throw Error(id+' HTTP '+res.status);
   const html=await res.text();fs.writeFileSync(path.join(dir,id+'.html'),html);
   const objects=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
   const p=objects.find(o=>o['@type']==='Product'&&o.sku===id);if(!p)return {id,url,error:'Geen product',title:html.match(/<title>(.*?)<\/title>/)?.[1]};
   const image=p.image[0].replace('/small/','/mediumlarge/');
   const img=await fetch(image);if(!img.ok)throw Error('Foto '+id);
   fs.writeFileSync(path.join(dir,id+'.jpg'),Buffer.from(await img.arrayBuffer()));
   return {id,url,name:p.name,description:p.description,category:p.category,image,offers:p.offers||null};
  }));results.push(...batch);console.log(batch.map(p=>p.id+' '+p.name).join('\n'));
 }
 fs.writeFileSync(path.join(dir,'producten.json'),JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
