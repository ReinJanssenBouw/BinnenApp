// Geïsoleerde UI/GLB-test, zonder verbinding met productiegegevens.
const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),assert=require('assert'),{pathToFileURL}=require('url');
app.setPath('userData',path.resolve(__dirname,'../dist/model-upload-test'));
app.commandLine.appendSwitch('use-angle','swiftshader');app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async()=>{
 const timer=setTimeout(()=>app.exit(2),40000);timer.unref();
 const root=path.resolve(__dirname,'..'),assets=pathToFileURL(process.argv.includes('--packaged')?path.join(root,'dist/win-unpacked/resources/app.asar'):root).href+'/';
 const fixture=path.join(root,'dist/model-upload-test.html'),model=pathToFileURL(path.join(root,'dist/test-product.glb')).href;
 fs.writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${assets}product-modelbeheer.css"><style>body{font-family:system-ui;background:#eef3fa}</style><script src="${assets}product-modelbeheer.js"></script>`);
 const w=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{offscreen:true,backgroundThrottling:false}});const errors=[];
 w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
  const T=await import(${JSON.stringify(assets+'vendor/three/three.module.min.js')});
  const {createProductModels}=await import(${JSON.stringify(assets+'locaties-productmodellen.mjs')});
  const factory=createProductModels(()=>{}),item=factory.create({description:'Testmodel',product_model_url:${JSON.stringify(model)}},{width:.2,height:.3,depth:.4});
  for(let i=0;i<100&&item.root.userData.modelStatus==='loading';i++)await new Promise(r=>setTimeout(r,30));
  if(item.root.userData.modelStatus!=='ready')throw Error('GLB niet ingeladen');
  const bounds=new T.Box3().setFromObject(item.root.children.at(-1)),size=bounds.getSize(new T.Vector3());
  // Update de bovenliggende matrix: productafmetingen moeten in meters worden toegepast.
  item.root.updateMatrixWorld(true);bounds.setFromObject(item.root.children.at(-1));bounds.getSize(size);
  if(Math.abs(size.x-.2)>1e-6||Math.abs(size.y-.3)>1e-6||Math.abs(size.z-.4)>1e-6)throw Error('Modelmaten wijken af: '+size.toArray());
  factory.dispose();
  let record={dimensions:{width:20,height:30,depth:40},widthLimit:25,sceneRevision:1};window.saveCount=0;
  window.binnenApp={supabaseRequest:async(action,p)=>{if(action==='getProductModel')return structuredClone(record);if(action==='saveProductModel'){window.saveCount++;window.lastPayload=p;await new Promise(r=>setTimeout(r,50));record={...record,dimensions:p.dimensions,sceneRevision:record.sceneRevision+1,name:p.name||record.name};return structuredClone(record);}throw Error(action);}};
  await BinnenProductModel.open(1,'JB0001 · Proefproduct');
  const q=s=>document.querySelector('.pm-dialog '+s),bytes=new Uint8Array(await (await fetch(${JSON.stringify(model)})).arrayBuffer());
  const transfer=new DataTransfer();transfer.items.add(new File([bytes],'product.glb',{type:'model/gltf-binary'}));q('[data-file]').files=transfer.files;
  q('[data-dim="width"]').value='26';q('form').requestSubmit();if(window.saveCount!==0)throw Error('Vakbreedte niet begrensd');
  q('[data-dim="width"]').value='24';q('[data-dim="across"]').value='3';q('[data-dim="behind"]').value='4';q('[data-dim="across"]').dispatchEvent(new Event('input',{bubbles:true}));if(!q('[data-capacity]').textContent.includes('12 plaatsen')||!q('[data-fit]').textContent.includes('breed'))throw Error('Capaciteit of paswaarschuwing ontbreekt');q('form').requestSubmit();
  if(!q('[data-save]').disabled)throw Error('Dubbele opslag mogelijk');
  for(let i=0;i<50&&q('[data-save]').disabled;i++)await new Promise(r=>setTimeout(r,20));
  if(lastPayload.dimensions.across!==3||lastPayload.dimensions.behind!==4)throw Error('Aantallen ontbreken in opslag');
  if(saveCount!==1||lastPayload.bytes.length!==bytes.length||lastPayload.dimensions.width!==24)throw Error('Upload of maten ontbreken');
  if(!q('[data-status]').textContent.includes('opgeslagen'))throw Error('Bevestiging ontbreekt');
  q('[data-close]').click();await BinnenProductModel.open(1,'JB0001 · Proefproduct');
  if(q('[data-dim="across"]').value!=='3'||q('[data-dim="behind"]').value!=='4')throw Error('Aantallen niet herladen');
  if(q('[data-dim="width"]').value!=='24'||!q('[data-current]').textContent.includes('product.glb'))throw Error('Heropenen verloor gegevens');
  return {modelSize:size.toArray(),upload:true,widthLimit:true,reopen:true};
 })()`);
 assert(result.upload&&result.reopen);assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
 await new Promise(r=>setTimeout(r,400));
 fs.writeFileSync(path.join(root,'dist/productmodel-upload.png'),(await w.webContents.capturePage()).toPNG());
 console.log('GESLAAGD: GLB laden, exacte buitenmaten, uploadformulier, vakbreedte, dubbele opslag en heropenen.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
