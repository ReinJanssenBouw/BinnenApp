const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert'),{pathToFileURL}=require('url');
app.setPath('userData',path.resolve(__dirname,'../dist/upload-performance-test'));
app.commandLine.appendSwitch('use-angle','swiftshader');app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),60000).unref();const root=path.resolve(__dirname,'..'),assets=pathToFileURL(process.argv.includes('--packaged')?path.join(root,'dist/win-unpacked/resources/app.asar'):root).href+'/';
 const modelFile=process.argv.find(a=>a.startsWith('--model='))?.slice(8)||'dist/kelfort-hybrikit.glb';
 const fixture=path.join(root,'dist/upload-performance.html');fs.writeFileSync(fixture,'<!doctype html><style>body{margin:0}</style>');
 const w=new BrowserWindow({show:false,width:1100,height:750,webPreferences:{offscreen:true,backgroundThrottling:false}});const errors=[];w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
 const T=await import(${JSON.stringify(assets+'vendor/three/three.module.min.js')});
 const {GLTFLoader}=await import(${JSON.stringify(assets+'vendor/three/GLTFLoader.js')});
 const {createProductModels}=await import(${JSON.stringify(assets+'locaties-productmodellen.mjs')});
 const url=${JSON.stringify(pathToFileURL(path.resolve(root,modelFile)).href)};
 const source=(await new GLTFLoader().loadAsync(url)).scene;let original=0;source.traverse(o=>{if(o.isMesh)original+=o.geometry.index.count/3});
 const factory=createProductModels(()=>{}),product={id:30,description:'Kelfort Hybrikit',product_model_url:url};
 const batch=factory.createBatch(product,{width:.05,height:.3,depth:.05},{across:10,behind:10});
 const until=Date.now()+20000;while(batch.root.userData.modelStatus==='loading'&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
 if(batch.root.userData.modelStatus!=='ready')throw Error('Uploaded model not ready');
 const scene=new T.Scene();scene.background=new T.Color('#eaf0f7');scene.add(batch.root,new T.HemisphereLight(0xffffff,0x667d98,2.4));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(2,4,3);scene.add(sun);
 const camera=new T.PerspectiveCamera(40,1100/750,.01,100);camera.position.set(.9,.7,1.3);camera.lookAt(.225,0,-.225);
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1100,750);document.body.append(renderer.domElement);
 let optimized=0,instances=0;batch.root.traverse(o=>{if(o.isInstancedMesh){optimized+=o.geometry.index.count/3;instances+=o.count;}});
 const measure=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixel=new Uint8Array(4),start=performance.now();for(let i=0;i<8;i++){camera.position.x+=.001;renderer.render(scene,camera);gl.readPixels(550,375,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);}return Math.round((performance.now()-start)/8);};
 const optimizedMs=measure(),triangles=renderer.info.render.triangles;
 await new Promise(r=>setTimeout(r,200));window.captureReady=true;
 // Compare the exact same 100 model copies with their original geometry.
 batch.root.visible=false;const originalGroup=new T.Group();source.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 source.traverse(o=>{if(!o.isMesh)return;const m=new T.InstancedMesh(o.geometry,o.material,100),normal=new T.Matrix4().makeScale(.05/size.x,.3/size.y,.05/size.z).multiply(new T.Matrix4().makeTranslation(-center.x,-center.y,-center.z)).multiply(o.matrixWorld);let i=0;for(let x=0;x<10;x++)for(let z=0;z<10;z++)m.setMatrixAt(i++,new T.Matrix4().makeTranslation(x*.05,0,-z*.05).multiply(normal));originalGroup.add(m)});scene.add(originalGroup);const originalMs=measure();originalGroup.visible=false;batch.root.visible=true;renderer.render(scene,camera);
 window.cleanup=()=>{factory.dispose();renderer.dispose()};
 return {original,optimized,copies:100,instances,triangles,optimizedMs,originalMs};
 })()`);
 assert.deepEqual(errors,[]);assert(result.optimized<result.original*.2,'Het echte uploadmodel moet minstens 80% lichter zijn');assert.equal(result.instances,200);assert(result.triangles<600000);
 fs.writeFileSync(path.join(root,'dist/upload-performance-preview.png'),(await w.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(root,'dist/upload-performance-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await w.webContents.executeJavaScript('cleanup()');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
