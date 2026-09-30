// Geïsoleerde proefstelling, zonder database of wijzigingen aan echte productmaten.
const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),assert=require('assert'),{pathToFileURL}=require('url');
app.setPath('userData',path.resolve(__dirname,'../dist/productmodellen-test'));
app.commandLine.appendSwitch('use-angle','swiftshader');app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async()=>{
 const timer=setTimeout(()=>app.exit(2),45000);timer.unref();
 const root=path.resolve(__dirname,'..'),assets=pathToFileURL(process.argv.includes('--packaged')?path.join(root,'dist/win-unpacked/resources/app.asar'):root).href+'/';
 const images=pathToFileURL(path.join(root,'mobiel/product-images/transparant')).href+'/';
 const fixture=path.join(root,'dist/productmodellen.html');
 fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eaf0f7;font-family:system-ui;color:#173252}header{position:absolute;z-index:2;padding:25px 35px;pointer-events:none}h1{font-size:25px;margin:0 0 5px}p{font-size:13px;margin:0}#view{width:100vw;height:100vh}</style><header><h1>BinnenApp · Productmodellen</h1><p>Proefstelling · schroevendozen met productfoto · vormen en maten ter illustratie</p></header><div id="view"></div>');
 const w=new BrowserWindow({show:false,width:1300,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const errors=[];w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
 const T=await import(${JSON.stringify(assets+'vendor/three/three.module.min.js')});
 const {createProductModels,productShape}=await import(${JSON.stringify(assets+'locaties-productmodellen.mjs')});
 const {createLocationView}=await import(${JSON.stringify(assets+'locaties-3d-view.mjs')});
 const samples=[['Gevelplaatschroef RVS 4.8x38mm','129122',24,18,20,'box'],['WD-40 onderhoudsspray','160769',10,28,10,'aerosol'],['Kelfort lijm-afdichtingskit','3404675-foto2',8,32,8,'cartridge'],['Midi poetspapier','3211895-v2',18,24,18,'roll'],['Wegwerpkwast','101296-v2',8,27,8,'brush'],['Verfbakje kunststof','101346-v2',24,7,28,'tray'],['Verfrol schuim','237262-v2',22,10,10,'roller'],['Rust Oleum grondverf','113063',16,18,16,'tin']];
 const data={racks:[{id:'test',name:'Proefstelling',rows:2,rowColumns:[4,4]}],products:[],geometry:{racks:{test:{width:155,height:95,depth:36,x:0,z:0,angle:0}},products:{}}};
 for(let i=0;i<samples.length;i++){const [description,photo,width,height,depth,shape]=samples[i];data.products.push({id:i+1,jb_code:i===0?'JB0043':'PROEF '+(i+1),description,product_image_url:${JSON.stringify(images)}+photo+'.png',rack:'Proefstelling',x_axis:String(i%4+1),y_axis:String(2-Math.floor(i/4))});data.geometry.products[i+1]={width,height,depth};if(productShape({description})!==shape)throw Error('Vorm '+description);}
 if(productShape({description:'Purreiniger NBS-pistool schroefbus 400ml'})!=='aerosol')throw Error('Purreiniger is een bus');
 const factory=createProductModels(()=>{}),dimensions={width:.24,height:.18,depth:.2};
 let first=factory.create(data.products[0],dimensions);factory.reset();
 const second=factory.create(data.products[0],dimensions);await new Promise(r=>setTimeout(r,700));
 const image=second.root.children.find(o=>o.material?.map);
 if(!image||!image.visible)throw Error('Foto na reset ontbreekt');
 if(Math.abs(image.scale.x*dimensions.width/(image.scale.y*dimensions.height)-1)>1e-8)throw Error('Foto vervormd');
 if(first.root.children.some(o=>o.material?.map))throw Error('Oude scene kreeg late foto');
 const remote=factory.create({...data.products[0],product_image_url:'https://binnenapp-mobiel.vercel.app/product-images/transparant/129122.png'},dimensions);
 for(let i=0;i<80&&!remote.root.children.some(o=>o.material?.map);i++)await new Promise(r=>setTimeout(r,100));
 if(!remote.root.children.some(o=>o.material?.map))throw Error('Live productfoto/CORS ontbreekt');
 const fallback=factory.create({description:'Onbekend'},dimensions);if(fallback.kind!=='box')throw Error('Fallback');factory.dispose();
 window.demoView=createLocationView(document.querySelector('#view'),hit=>window.lastProductHit=hit);demoView.update(data,{rackId:'test',roomHeight:2600},false);demoView.fit('front');
 window.demoData=data;await new Promise(r=>setTimeout(r,700));
 return {shapes:samples.map(s=>s[5]),photos:true,aspect:true,remote:true};
 })()`);
 assert(result.photos&&result.remote);console.log(JSON.stringify(result));
 await new Promise(r=>setTimeout(r,200));
 fs.writeFileSync(path.join(root,'dist/productmodellen-front.png'),(await w.webContents.capturePage()).toPNG());
 // Een product op de voorzijde van de proefstelling blijft via raycasting selecteerbaar.
 const click=async(x,y)=>{w.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});w.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,100));};
 w.webContents.focus();
 // Midden op het foto-etiket, bevestigd in productmodellen-front.png.
 await click(380,510);assert.equal(await w.webContents.executeJavaScript('window.lastProductHit?.productId'),1,'Foto-etiket selecteert de schroevendoos');
 await w.webContents.executeJavaScript("demoView.fit('perspective')");await new Promise(r=>setTimeout(r,200));
 fs.writeFileSync(path.join(root,'dist/productmodellen-preview.png'),(await w.webContents.capturePage()).toPNG());
 await w.webContents.executeJavaScript("demoData.geometry.racks.test.angle=37;demoView.update(demoData,{rackId:'test',roomHeight:2600,frontView:true},false);demoView.fit();");await new Promise(r=>setTimeout(r,200));
 fs.writeFileSync(path.join(root,'dist/vakkenlijst-vooraanzicht.png'),(await w.webContents.capturePage()).toPNG());
 assert.equal(await w.webContents.executeJavaScript("document.querySelector('#view').dataset.view"),'front');
 await click(240,520);assert.equal(await w.webContents.executeJavaScript('window.lastProductHit?.productId'),1,'Gedraaide stelling: product kiezen in vooraanzicht');
 await click(310,350);assert.deepEqual(await w.webContents.executeJavaScript('window.lastProductHit'),{rackId:'test',x:1,y:2},'Leeg deel van het vak kiezen in vooraanzicht');
 await w.webContents.executeJavaScript('demoView.dispose()');assert.deepEqual(errors,[]);
 console.log('GESLAAGD: acht vormen, schroevendoos, productfoto, onvervormde verhoudingen, late fotoload, live foto en opruimen.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
