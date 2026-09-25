const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createLocationSceneStore}=require('../location-scene-store');
const projectUrl='https://guurncfxhcxwvgnzoeyp.supabase.co';
const base=path.resolve(__dirname,'../dist');fs.mkdirSync(base,{recursive:true});
const directory=fs.mkdtempSync(path.join(base,'scene-storage-test-'));
const rack={id:'44444444-4444-4444-4444-444444444444',name:'Teststelling',rows:2,columns:3,rowColumns:[3,4]};
const geometry={version:1,racks:{[rack.id]:{width:240,height:180,depth:80,x:0,z:0,angle:0}},products:{1:{width:12,height:25,depth:20}}};
let cloud=false,admin=true,networkError=false;
let layout={racks:[],revision:0,products:[{id:1,stock:8,min_stock:6}]};
let scene={geometry:{version:1,racks:{},products:{}},sceneRevision:0};
const copy=v=>JSON.parse(JSON.stringify(v));
const supabase={rpc:async(name,args)=>{
 if(networkError)return {error:{code:'NETWORK',message:'Geen verbinding'}};
 if(name.includes('_scene')&&!cloud)return {error:{code:'PGRST202',message:'Missing RPC'}};
 if(name.includes('save_')&&!admin)return {error:{code:'42501',message:'Geen beheerder'}};
 if(name.includes('save_')&&args.p_revision!==layout.revision)return {error:{code:'40001',message:'Indeling gewijzigd'}};
 if(name==='binnenapp_save_location_scene'){
  if(args.p_scene_revision!==scene.sceneRevision)return {error:{code:'40001',message:'Model gewijzigd'}};
  scene={geometry:copy(args.p_geometry),sceneRevision:scene.sceneRevision+1};
 }
 if(name.includes('save_'))layout={...layout,racks:copy(args.p_racks),revision:layout.revision+1};
 return {data:copy(name.includes('_scene')?{...layout,...scene}:layout)};
}};
const create=()=>createLocationSceneStore({supabase,directory,projectUrl});
const payload=d=>({racks:[rack],geometry,revision:d.revision,sceneRevision:d.sceneRevision,localRevision:d.localRevision});
(async()=>{
 assert.throws(()=>createLocationSceneStore({supabase,directory,projectUrl:'https://wrong.supabase.co'}),/Onjuist/);
 let store=create(),d=await store.load();assert.equal(d.storage,'local');
 const first=payload(d);d=await store.save(first);assert.equal(d.storage,'local');assert.deepEqual(d.geometry,geometry);
 // New main process/store instance must load the same dimensions from disk.
 store=create();d=await store.load();assert.deepEqual(d.geometry,geometry);assert.equal(d.localRevision,1);
 await assert.rejects(store.save(first),/intussen gewijzigd/);
 admin=false;await assert.rejects(store.save(payload(d)),/Geen beheerder/);admin=true;
 assert.equal((await store.load()).localRevision,1);
 const invalid=payload(d);invalid.geometry=copy(geometry);invalid.geometry.products[1].width=-1;
 await assert.rejects(store.save(invalid),/productmaten/);
 networkError=true;await assert.rejects(store.load(),/Geen verbinding/);await assert.rejects(store.save(payload(d)),/Geen verbinding/);networkError=false;
 assert.deepEqual((await store.load()).geometry,geometry);
 // Enabling the RPC later preserves local work until the user saves it.
 cloud=true;d=await store.load();assert.equal(d.storage,'pending');assert.deepEqual(d.geometry,geometry);
 d=await store.save(payload(d));assert.equal(d.storage,'cloud');assert.deepEqual(scene.geometry,geometry);
 d=await create().load();assert.equal(d.storage,'cloud');assert.deepEqual(d.geometry,geometry);
 assert.deepEqual(layout.products,[{id:1,stock:8,min_stock:6}]);
 console.log('GESLAAGD: lokale persistentie na herstart, revisies, adminrechten, maatvalidatie, netwerkfouten en latere cloudsynchronisatie.');
})().catch(e=>{console.error(e);process.exitCode=1});
