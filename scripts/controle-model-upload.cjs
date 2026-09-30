const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {validateGlb,createProductModelStore}=require('../product-model-store');
function glb(extra={}){
 const vertices=new Float32Array([-1,-2,-3,1,-2,-3,1,2,-3,-1,2,-3,-1,-2,3,1,-2,3,1,2,3,-1,2,3]);
 const indices=new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,1,2,6,1,6,5,3,0,4,3,4,7]);
 const bin=Buffer.concat([Buffer.from(vertices.buffer),Buffer.from(indices.buffer)]);
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.15,.45,.9,1],metallicFactor:0,roughnessFactor:.7}}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength},{buffer:0,byteOffset:vertices.byteLength,byteLength:indices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-1,-2,-3],max:[1,2,3]},{bufferView:1,componentType:5123,count:indices.length,type:'SCALAR'}],...extra};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const head=Buffer.alloc(20);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+bin.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);
 const chunk=Buffer.alloc(8);chunk.writeUInt32LE(bin.length);chunk.writeUInt32LE(0x004e4942,4);return Buffer.concat([head,json,chunk,bin]);
}
module.exports={glb};
if(require.main===module)(async()=>{
 const bytes=glb();assert.deepEqual(validateGlb(bytes,'box.glb'),bytes);
 assert.throws(()=>validateGlb(bytes,'box.obj'));assert.throws(()=>validateGlb(Buffer.from('bad'),'box.glb'));
 assert.throws(()=>validateGlb(glb({buffers:[{uri:'https://example.com/a.bin'}]}),'box.glb'),/ingesloten/);
 assert.throws(()=>validateGlb(glb({skins:[{}]}),'box.glb'),/statisch/);
 let admin=true,uploadCount=0,record={sceneRevision:1,widthLimit:25,dimensions:{width:20,height:25,depth:20},path:null,name:null};
 const supabase={rpc:async(name,p)=>{
  if(name==='binnenapp_membership_status')return {data:{active:true,role:admin?'admin':'member'}};
  if(name==='binnenapp_get_product_model')return {data:structuredClone(record)};
  if(name==='binnenapp_save_product_model'){assert.equal(p.p_scene_revision,record.sceneRevision);record={...record,sceneRevision:record.sceneRevision+1,path:p.p_path,name:p.p_name,dimensions:p.p_dimensions};return {data:structuredClone(record)};}
  throw Error(name);
 },storage:{from:bucket=>{assert.equal(bucket,'product-models');return {upload:async(p,b,o)=>{assert(p.startsWith('1/'));assert.equal(o.upsert,false);assert.deepEqual(b,bytes);uploadCount++;return {data:{path:p}};}}}}};
 const store=createProductModelStore({supabase,projectUrl:'https://guurncfxhcxwvgnzoeyp.supabase.co'});
 const input={productId:1,sceneRevision:1,dimensions:{width:20,height:30,depth:40},bytes,name:'box.glb'};
 admin=false;await assert.rejects(store.save(input),/beheerder/);admin=true;
 await assert.rejects(store.save({...input,dimensions:{width:30,height:30,depth:40}}),/maximaal/);assert.equal(uploadCount,0);
 await store.save(input);assert.equal(uploadCount,1);assert.equal(record.name,'box.glb');assert.equal(record.dimensions.height,30);
 await assert.rejects(store.save(input),/gewijzigd/);assert.equal(uploadCount,1);
 await store.save({productId:1,sceneRevision:2,dimensions:{width:21,height:31,depth:41}});assert.equal(uploadCount,1);assert.equal(record.name,'box.glb');
 fs.writeFileSync(path.resolve(__dirname,'../dist/test-product.glb'),bytes);
 console.log('GESLAAGD: GLB-validatie, externe bestanden, rechten, vakbreedte, upload, hergebruik en revisieconflicten.');
})().catch(e=>{console.error(e);process.exitCode=1});
