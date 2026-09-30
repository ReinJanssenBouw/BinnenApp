const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert'),{pathToFileURL}=require('url');
app.setPath('userData',path.resolve(__dirname,'../dist/location-performance-test'));
app.commandLine.appendSwitch('use-angle','swiftshader');app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),60000).unref();const root=path.resolve(__dirname,'..'),assets=pathToFileURL(process.argv.includes('--packaged')?path.join(root,'dist/win-unpacked/resources/app.asar'):root).href+'/';
 const fixture=path.join(root,'dist/location-performance.html');fs.writeFileSync(fixture,'<!doctype html><style>body{margin:0}#view{width:1100px;height:750px}</style><div id="view"></div>');
 const w=new BrowserWindow({show:false,width:1100,height:750,webPreferences:{offscreen:true,backgroundThrottling:false}});const errors=[];w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
 const T=await import(${JSON.stringify(assets+'vendor/three/three.module.min.js')});
 T.Scene.prototype.add=function(...objects){window.testScene=this;this.onAfterRender=r=>{window.drawCalls=r.info.render.calls;window.gpuGeometries=r.info.memory.geometries;};return T.Object3D.prototype.add.apply(this,objects)};
 const {createLocationView}=await import(${JSON.stringify(assets+'locaties-3d-view.mjs')});
 const data={racks:[],products:[],geometry:{version:1,racks:{},products:{}}};
 for(let i=0;i<4;i++){const id='r'+i,name='Stelling '+(i+1);data.racks.push({id,name,rows:1,rowColumns:[1]});data.geometry.racks[id]={width:120,height:75,depth:60,x:(i%2)*140-70,z:Math.floor(i/2)*100-50,angle:0};data.products.push({id:i+1,jb_code:'TEST'+i,description:'Schroeven',rack:name,x_axis:'1',y_axis:'1'});data.geometry.products[i+1]={width:5,height:15,depth:4,across:10,behind:10};}
 const view=createLocationView(document.querySelector('#view'),()=>{}),selection={rackId:'r0',roomHeight:2600};
 const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const start=performance.now();view.update(data,selection,true);view.fit();await wait();const buildMs=performance.now()-start,calls=window.drawCalls;
 const objects=[];testScene.traverse(o=>{if(o.isMesh)objects.push(o.uuid)});
 const t=performance.now();view.update(data,{...selection,x:1,y:1,productId:1},true);await wait();const selectionMs=performance.now()-t;
 const after=[];testScene.traverse(o=>{if(o.isMesh)after.push(o.uuid)});const reused=after.filter(id=>objects.includes(id)).length;
 let geometries=window.gpuGeometries;for(let i=0;i<8;i++){view.update(data,{...selection,x:1,y:1,productId:i%4+1},true);await wait();}geometries=window.gpuGeometries;for(let i=0;i<8;i++){view.update(data,{...selection,x:1,y:1,productId:i%4+1},true);await wait();}const finalGeometries=window.gpuGeometries;
 for(let i=0;i<6;i++){data.geometry.products[1].width=5+i*.1;view.update(data,selection,true);await wait();}const rebuildGeometries=window.gpuGeometries;
 view.dispose();return {copies:400,calls,buildMs:Math.round(buildMs),selectionMs:Math.round(selectionMs),meshes:objects.length,reused,geometries,finalGeometries,rebuildGeometries};
 })()`);
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
 if(process.argv.includes('--baseline'))fs.writeFileSync(path.join(root,'dist/location-performance-baseline.json'),JSON.stringify(result,null,2));
 else{assert(result.calls<150,'Draw calls blijven begrensd bij 400 exemplaren');assert(result.reused>=result.meshes-2,'Selecteren moet de scene behouden');assert(result.finalGeometries<=result.geometries+2,'Selecteren lekt geen geometrie');assert(result.rebuildGeometries<=result.finalGeometries+2,'Aanpassen lekt geen geometrie');fs.writeFileSync(path.join(root,'dist/location-performance-result.json'),JSON.stringify(result,null,2));}
 w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
