const {randomUUID}=require('node:crypto');
const MAX_MODEL_BYTES=20*1024*1024;
function validateGlb(input,name){
 const b=Buffer.from(input||[]);
 if(!/\.glb$/i.test(name||'')||b.length<24||b.length>MAX_MODEL_BYTES||b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Kies een geldig GLB 2.0-bestand van maximaal 20 MB.');
 let doc,offset=12;
 while(offset<b.length){
  if(offset+8>b.length)throw Error('Het GLB-bestand is beschadigd.');
  const n=b.readUInt32LE(offset),type=b.readUInt32LE(offset+4);offset+=8;
  if(n%4||offset+n>b.length)throw Error('Het GLB-bestand is beschadigd.');
  if(offset===20){if(type!==0x4e4f534a)throw Error('GLB-modelgegevens ontbreken.');try{doc=JSON.parse(b.toString('utf8',offset,offset+n).trim());}catch{throw Error('Ongeldige GLB-modelgegevens.');}}
  offset+=n;
 }
 if(doc?.asset?.version!=='2.0'||!doc.meshes?.length)throw Error('Het bestand bevat geen 3D-productmodel.');
 function inspect(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(k==='uri'&&(typeof x!=='string'||!x.startsWith('data:')))throw Error('Exporteer als één GLB met ingesloten afbeeldingen en zonder externe bestanden.');inspect(x);}}
 inspect(doc);
 if(doc.skins?.length||(doc.extensionsRequired||[]).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))throw Error('Exporteer een statisch GLB zonder Draco-, Meshopt- of KTX2-compressie.');
 if((doc.accessors||[]).some(a=>!Number.isSafeInteger(a.count)||a.count<0||a.count>2000000))throw Error('Dit model is te groot of te complex. Exporteer een eenvoudiger model.');
 return b;
}
function createProductModelStore({supabase,projectUrl}){
 if(projectUrl!=='https://guurncfxhcxwvgnzoeyp.supabase.co')throw Error('Onjuist BinnenApp-project.');
 const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
 const id=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw Error('Kies eerst een opgeslagen product.');return n;};
 async function get(productId){return check(await supabase.rpc('binnenapp_get_product_model',{p_product_id:id(productId)}));}
 async function save(p){
  const productId=id(p.productId),dimensions=p.dimensions;
  if(!dimensions||!['width','height','depth'].every(k=>typeof dimensions[k]==='number'&&Number.isFinite(dimensions[k])&&dimensions[k]>=.1&&dimensions[k]<=500))throw Error('Vul breedte, hoogte en diepte in van 0,1 tot 500 cm.');
  const counts=['across','behind'].map(k=>dimensions[k]??1);
  if(counts.some(n=>!Number.isInteger(n)||n<1||n>50)||counts[0]*counts[1]>250)throw Error('Vul gehele aantallen van 1 tot 50 in, met maximaal 250 plaatsen per product.');
  const membership=check(await supabase.rpc('binnenapp_membership_status'));
  if(!membership?.active||membership.role!=='admin')throw Error('Alleen de beheerder kan een productmodel opslaan.');
  const before=await get(productId);
  if(before.sceneRevision!==p.sceneRevision)throw Error('Het locatiemodel is gewijzigd. Sluit dit venster en open het opnieuw.');
  if(dimensions.width>before.widthLimit)throw Error(`Dit vak is maximaal ${before.widthLimit} cm breed.`);
  let modelPath=before.path,modelName=before.name;
  if(p.bytes){
   const bytes=validateGlb(p.bytes,p.name);modelName=String(p.name).replace(/[\\/]/g,'_').slice(-180);
   modelPath=`${productId}/${randomUUID()}.glb`;
   check(await supabase.storage.from('product-models').upload(modelPath,bytes,{contentType:'model/gltf-binary',cacheControl:'3600',upsert:false}));
  }
  return check(await supabase.rpc('binnenapp_save_product_model',{p_product_id:productId,p_path:modelPath||null,p_name:modelName||null,p_dimensions:dimensions,p_scene_revision:p.sceneRevision}));
 }
 async function list(){
  const rows=check(await supabase.rpc('binnenapp_product_models'))||[];
  if(!rows.length)return new Map();
  const signed=check(await supabase.storage.from('product-models').createSignedUrls(rows.map(r=>r.path),3600));
  return new Map(rows.map((r,i)=>[String(r.product_id),{product_model_url:signed[i]?.signedUrl||null,product_model_name:r.name}]));
 }
 return {get,save,list};
}
module.exports={createProductModelStore,validateGlb,MAX_MODEL_BYTES};
