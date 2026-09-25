// Isolated renderer fixture: no backend connection or production writes.
const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),assert=require('assert');
app.setPath('userData',path.resolve(__dirname,'../dist/locatie-3d-test'));
app.commandLine.appendSwitch('use-angle','swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),45000).unref();
 const fixture=path.resolve(__dirname,'../dist/locatie-3d-fixture.html');
 const resourceRoot=path.resolve(__dirname,process.argv.includes('--packaged')?'../dist/win-unpacked/resources/app.asar':'..');
 const assetPrefix=require('node:url').pathToFileURL(resourceRoot).href+'/';
 const desktopCss=fs.readFileSync(path.join(resourceRoot,'BinnenApp.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
 fs.writeFileSync(fixture,('<!doctype html><meta charset="utf-8"><style>'+desktopCss+'</style><link rel="stylesheet" href="../locaties.css"><link rel="stylesheet" href="../locaties-3d.css"><aside class="sidebar" aria-hidden="true"></aside><div class="pages"><main class="page active" id="page-locatie"><div id="test"></div></main></div><script src="../locaties.js"></script><script src="../locaties-3d.js"></script>').replaceAll('="../','="'+assetPrefix));
 const w=new BrowserWindow({show:false,width:1440,height:950,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const errors=[];w.webContents.on('console-message',(e)=>{if(e.level==='error')errors.push(e.message)});
 await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
 const wait=()=>new Promise(r=>setTimeout(r,80));const q=s=>document.querySelector(s);const click=s=>{if(!q(s))throw Error('Missing '+s);q(s).click()};
 const set=(s,v,type='input')=>{const e=q(s);e.value=v;e.dispatchEvent(new Event(type,{bubbles:true}))};
 let admin=true,fail=false,saves=0,assigns=0;
 let db={racks:[],revision:0,sceneRevision:0,geometry:{version:1,racks:{},products:{}},products:[{id:1,jb_code:'JB0001',description:'Test verfrol',stock:8,min_stock:6,updated_at:'1'},{id:2,jb_code:'JB0002',description:'Test kit',stock:9,min_stock:4,updated_at:'1'}]};
 const copy=x=>JSON.parse(JSON.stringify(x));
 const api={isAdmin:()=>admin,isActive:()=>true,loadScene:async()=>copy(db),saveScene:async p=>{if(fail)throw Error('Testconflict: vernieuw');if(p.revision!==db.revision||p.sceneRevision!==db.sceneRevision)throw Error('Revision mismatch');saves++;db={...db,...copy(p),revision:db.revision+1,sceneRevision:db.sceneRevision+1};return copy(db)},assign:async p=>{assigns++;const item=db.products.find(x=>x.id===p.p_product_id);item.rack=p.p_rack_id?db.racks.find(r=>r.id===p.p_rack_id).name:null;item.x_axis=p.p_rack_id?String(p.p_x):null;item.y_axis=p.p_rack_id?String(p.p_y):null;item.updated_at=String(Number(item.updated_at)+1);return copy(db)},load:async()=>copy(db),save:async()=>copy(db)};
 window.confirm=()=>true;localStorage.removeItem('binnenapp-room-height-mm');BinnenLocaties3D.mount(q('#test'),api);await wait();const defaultHeight=q('[data-room-height]').value==='2600';set('[data-room-height]','3000','change');click('[data-l3="reload"]');await wait();const wallHeightPersisted=q('[data-room-height]').value==='3000'&&localStorage.getItem('binnenapp-room-height-mm')==='3000';set('[data-room-height]','-1','change');const wallHeightValidated=q('[data-room-height]').value==='3000';set('[data-room-height]','2600','change');click('[data-l3="add"]');
 set('[data-rack-field="name"]','Stelling A');set('[data-dim="width"]','240');set('[data-dim="depth"]','80');set('[data-rack-field="rows"]','2','change');set('[data-row="0"]','4','change');set('[data-row="1"]','3','change');
 set('[data-dim="height"]','');const invalidBlocked=q('[data-l3="save"]').disabled;set('[data-dim="height"]','180');
 click('[data-l3="save"]');await wait();const rackId=db.racks[0].id;const saved=copy(db);
 set('[data-select="y"]','1','change');set('[data-select="x"]','2','change');click('[data-l3="assign"][data-id="1"]');await wait();
 const assigned=db.products[0].rack==='Stelling A'&&db.products[0].x_axis==='2';set('[data-dim="width"][data-scope="product"]','90');set('[data-dim="width"][data-scope="product"]','90','change');const warned=!!q('.l3-warning');
 click('[data-l3="save"]');await wait();click('[data-l3="reload"]');await wait();const persisted=q('[data-dim="width"][data-scope="product"]').value==='90';
 set('[data-select="y"]','2','change');set('[data-select="x"]','1','change');click('[data-l3="assign"][data-id="1"]');await wait();const moved=db.products[0].y_axis==='2';
 click('[data-l3="unassign"][data-id="1"]');await wait();const removed=db.products[0].rack===null;
 click('[data-l3="assign"][data-id="1"]');await wait();click('[data-l3="rack-settings"]');
 fail=true;set('[data-dim="depth"]','85');click('[data-l3="save"]');await wait();const conflict=q('.l3-status').textContent.includes('Testconflict')&&!q('[data-l3="save"]').disabled&&db.geometry.racks[rackId].depth===80;fail=false;click('[data-l3="save"]');await wait();
 click('[data-l3="mode"]');await wait();const flat=!!q('.l3-flat .loc-panel');click('[data-l3="mode"]');await wait();
 click('[data-l3="add"]');set('[data-rack-field="name"]','Stelling B');click('[data-l3="save"]');await wait();
 click('[data-l3="rack"][data-id="'+rackId+'"]');set('[data-select="y"]','2','change');set('[data-select="x"]','1','change');click('[data-l3="product"][data-id="1"]');
 await new Promise(r=>setTimeout(r,1000));
 const canvas=q('.l3-canvas canvas'),gl=canvas?.getContext('webgl2');const webgl=!!gl&&canvas.width>100;const overflow=document.documentElement.scrollWidth>innerWidth;
 const roomLabel=q('.l3-scale').textContent.includes('6630 × 4820 mm');
 click('[data-l3="rack-settings"]');set('[data-dim="x"]','400','input');set('[data-dim="x"]','400','change');const outsideWarned=!!q('.l3-room-warning');set('[data-dim="x"]','0','input');set('[data-dim="x"]','0','change');const insideCleared=!q('.l3-room-warning');set('[data-dim="angle"]','90','input');set('[data-dim="angle"]','90','change');const rotationWarned=!!q('.l3-room-warning');set('[data-dim="angle"]','0','input');set('[data-dim="angle"]','0','change');click('[data-l3="save"]');await wait();
 click('[data-l3="plan"]');const planVisible=!!q('.l3-plan svg')&&q('.l3-canvas').hidden&&document.querySelectorAll('.l3-plan-rack').length===2;
 const second=document.querySelectorAll('.l3-plan-rack')[1];second.dispatchEvent(new MouseEvent('click',{bubbles:true}));const planSelection=q('.l3-inspector h2').textContent==='Stelling B';
 set('[data-dim="width"]','180');set('[data-dim="width"]','180','change');set('[data-dim="angle"]','90');set('[data-dim="angle"]','90','change');set('[data-dim="x"]','180');set('[data-dim="x"]','180','change');set('[data-dim="z"]','100');set('[data-dim="z"]','100','change');
 const planUpdated=q('.l3-plan-rack.is-selected rect').getAttribute('width')==='180';
 click('[data-view="perspective"]');const switched3D=q('.l3-plan').hidden&&!q('.l3-canvas').hidden&&q('[data-dim="width"]').value==='180';click('[data-l3="plan"]');
 const beforeZoom=q('.l3-plan svg').getAttribute('viewBox');click('[data-l3="plan-zoom"][data-factor="1.25"]');const zoomed=q('.l3-plan svg').getAttribute('viewBox')!==beforeZoom;click('[data-l3="fit"]');const resetZoom=q('.l3-plan svg').getAttribute('viewBox')===beforeZoom;
 click('[data-l3="save"]');await wait();click('[data-l3="reload"]');await wait();const planSaved=db.geometry.racks[db.racks[1].id].width===180&&q('.l3-plan-rack.is-selected rect').getAttribute('width')==='180';
 window.testSetAdmin=()=>{admin=false;BinnenLocaties3D.mount(q('#test'),api)};
 return {planVisible,planSelection,planUpdated,switched3D,zoomed,resetZoom,planSaved,defaultHeight,wallHeightPersisted,wallHeightValidated,rotationWarned,roomLabel,outsideWarned,insideCleared,invalidBlocked,assigned,warned,persisted,moved,removed,conflict,flat,webgl,overflow,saved,saves,assigns,stock:db.products.map(p=>[p.stock,p.min_stock]),status:q('.l3-status').textContent};
 })()`);
 console.log(JSON.stringify(result));
 for(const k of ['planVisible','planSelection','planUpdated','switched3D','zoomed','resetZoom','planSaved','defaultHeight','wallHeightPersisted','wallHeightValidated','rotationWarned','roomLabel','outsideWarned','insideCleared','invalidBlocked','assigned','warned','persisted','moved','removed','conflict','flat','webgl'])assert(result[k],k);
 assert(!result.overflow);assert.deepEqual(result.saved.racks[0].rowColumns,[4,3]);assert.equal(result.saved.geometry.racks[result.saved.racks[0].id].depth,80);assert.deepEqual(result.stock,[[8,6],[9,4]]);
 const pause=()=>new Promise(r=>setTimeout(r,80));
 const pose=()=>w.webContents.executeJavaScript(`({x:Number(document.querySelector('[data-dim="x"]').value),z:Number(document.querySelector('[data-dim="z"]').value),dirty:!document.querySelector('[data-l3="save"]').disabled})`);
 async function mouseDrag(dx,dy,cancel=false){
  const point=await w.webContents.executeJavaScript(`(()=>{const el=document.querySelector('.l3-plan-rack.is-selected'),b=el.getBoundingClientRect(),m=el.ownerSVGElement.getScreenCTM();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),scale:m.a};})()`);
  w.webContents.focus();
  w.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});await pause();
  w.webContents.sendInputEvent({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});await pause();
  w.webContents.sendInputEvent({type:'mouseMove',x:point.x+dx,y:point.y+dy,button:'left',modifiers:['leftButtonDown']});await pause();
  if(cancel){w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});await pause();w.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
  w.webContents.sendInputEvent({type:'mouseUp',x:point.x+dx,y:point.y+dy,button:'left',clickCount:1});await pause();return point.scale;
 }
 const original=await pose();const scale=await mouseDrag(-60,-30);const dragged=await pose();
 assert(Math.abs(dragged.x-original.x+60/scale)<.2,'Drag X at rendered SVG scale');assert(Math.abs(dragged.z-original.z+30/scale)<.2,'Drag Z at rendered SVG scale');assert(dragged.dirty,'Drag must await save');
 await mouseDrag(25,20,true);assert.deepEqual(await pose(),dragged,'Escape restores position and earlier unsaved state');
 await w.webContents.executeJavaScript(`document.querySelector('[data-l3="plan-zoom"][data-factor="1.25"]').click()`);
 const zoomStart=await pose();const zoomScale=await mouseDrag(-30,20);const zoomEnd=await pose();assert(Math.abs(zoomEnd.x-zoomStart.x+30/zoomScale)<.2,'Zoomed drag X');assert(Math.abs(zoomEnd.z-zoomStart.z-20/zoomScale)<.2,'Zoomed drag Z');
 await w.webContents.executeJavaScript(`document.querySelector('[data-view="perspective"]').click()`);assert.deepEqual(await pose(),zoomEnd,'Same draft in 3D');
 await w.webContents.executeJavaScript(`document.querySelector('[data-l3="plan"]').click();document.querySelector('[data-l3="save"]').click()`);await pause();await w.webContents.executeJavaScript(`document.querySelector('[data-l3="reload"]').click()`);await pause();const reloaded=await pose();assert.equal(reloaded.x,zoomEnd.x);assert.equal(reloaded.z,zoomEnd.z);assert(!reloaded.dirty);
 await w.webContents.executeJavaScript(`document.querySelector('[data-l3="fit"]').click()`);
 console.log('GESLAAGD: echte muisdrag, gedraaide stelling, zoom, Escape, 3D-consistentie en opgeslagen positie herladen.');
 await new Promise(r=>setTimeout(r,800));fs.writeFileSync(path.resolve(__dirname,'../dist/locatie-3d-desktop.png'),(await w.webContents.capturePage()).toPNG());
 for(const width of [1024,1920]){w.setSize(width,950);await new Promise(r=>setTimeout(r,120));assert(await w.webContents.executeJavaScript("document.querySelector('#page-locatie').scrollWidth<=document.querySelector('#page-locatie').clientWidth"),'Desktop overflow '+width);}
 await w.webContents.executeJavaScript('testSetAdmin()');await new Promise(r=>setTimeout(r,150));
 const member=await w.webContents.executeJavaScript(`document.querySelector('[data-l3="save"]').hidden&&!document.querySelector('[data-l3="add"]')&&[...document.querySelectorAll('[data-dim]')].every(e=>e.disabled)`);assert(member,'member read-only');const memberPose=await pose();await mouseDrag(25,20);assert.deepEqual(await pose(),memberPose,'Lid kan niet slepen');
 assert.deepEqual(errors,[]);console.log('GESLAAGD: WebGL, aanmaken, maten, rijindeling, validatie, plaatsen/verplaatsen, herladen, conflicten, vakkenlijst, rechten en voorraadbehoud.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
