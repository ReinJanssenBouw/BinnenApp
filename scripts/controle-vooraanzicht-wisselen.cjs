// Four-rack regression with real pointer events; no backend or production writes.
const {app,BrowserWindow}=require('electron');
const path=require('path'),fs=require('fs'),assert=require('assert');
app.setPath('userData',path.resolve(__dirname,'../dist/front-switch-test'));
app.commandLine.appendSwitch('use-angle','swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),45000).unref();
 const resourceRoot=path.resolve(__dirname,process.argv.includes('--packaged')?'../dist/win-unpacked/resources/app.asar':'..');
 const prefix=require('url').pathToFileURL(resourceRoot).href+'/';
 const css=fs.readFileSync(path.join(resourceRoot,'BinnenApp.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
 const fixture=path.resolve(__dirname,'../dist/front-switch-fixture.html');
 fs.writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><style>${css}</style><link rel="stylesheet" href="${prefix}locaties-3d.css"><aside class="sidebar"></aside><div class="pages"><main class="page active" id="page-locatie"><div id="test"></div></main></div><script src="${prefix}locaties-3d.js"></script>`);
 const w=new BrowserWindow({show:false,width:1440,height:950,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const errors=[];w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
 await w.loadFile(fixture);
 await w.webContents.executeJavaScript(`(()=>{
  window.addEventListener('error',e=>console.error(e.message));
  const racks=[0,1,2,3].map(i=>({id:'rack-'+i,name:'Stelling '+(i+1),rows:3,columns:3,rowColumns:[3,3,3]}));
  const geometry={version:1,racks:Object.fromEntries(racks.map((r,i)=>[r.id,{width:180+i*10,height:180+i*10,depth:60,x:(i%2)*200-100,z:Math.floor(i/2)*200-100,angle:i*90}])),products:{}};
  BinnenLocaties3D.mount(document.querySelector('#test'),{isAdmin:()=>true,isActive:()=>true,loadScene:async()=>({racks,geometry,products:[],revision:1,sceneRevision:1}),saveScene:async()=>{throw Error('Unexpected save')}});
 })()`);
 const pause=()=>new Promise(r=>setTimeout(r,180));await new Promise(r=>setTimeout(r,1400));
 async function click(selector){
  const p=await w.webContents.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const b=e.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()`);
  w.webContents.focus();w.webContents.sendInputEvent({type:'mouseMove',...p});
  w.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});
  w.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});await pause();
 }
 await click('[data-view="front"]');
 for(const i of [1,2,3,0,3,1]){
  await click('.l3-rack-choice[data-id="rack-'+i+'"]');
  const state=await w.webContents.executeJavaScript(`({name:document.querySelector('.l3-inspector h2')?.textContent,selected:document.querySelector('.l3-rack-choice.is-selected')?.dataset.id,view:document.querySelector('.l3-canvas').dataset.view,visible:document.querySelector('.l3-canvas').clientWidth>0&&!document.querySelector('.l3-canvas').hidden})`);
  console.log(JSON.stringify(state));assert.equal(state.name,'Stelling '+(i+1));assert.equal(state.selected,'rack-'+i);assert.equal(state.view,'front');assert(state.visible,'Front canvas stays visible after switching');
  await click('.l3-canvas canvas');
  const address=await w.webContents.executeJavaScript(`document.querySelector('.l3-cell-address')?.textContent`);
  fs.writeFileSync(path.resolve(__dirname,'../dist/front-switch.png'),(await w.webContents.capturePage()).toPNG());
  assert(address?.startsWith('Stelling '+(i+1)+' /'),'Displayed model must belong to selected rack: '+address);
 }
 fs.writeFileSync(path.resolve(__dirname,'../dist/front-switch.png'),(await w.webContents.capturePage()).toPNG());
 assert.deepEqual(errors,[]);console.log('GESLAAGD: stellingen 1–4 selecteren en vak aanklikken in recht vooraanzicht.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
