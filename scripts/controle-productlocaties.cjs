const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),assert=require('assert');
app.disableHardwareAcceleration();app.setPath('userData',path.resolve(__dirname,'../dist/locatie-test'));
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),20000).unref();
 const fixture=path.resolve(__dirname,'../dist/locatie-fixture.html');
 fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../locaties.css"><main id="test"></main><script src="../locaties.js"></script>');
 const w=new BrowserWindow({show:false,width:390,height:844});await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
 let saved,active=true; let products=[{id:1,jb_code:'JB0001',description:'Test kwast',updated_at:'2026-09-24T00:00:00Z'}];let racks=[];let revision=0;
 const el=document.getElementById('test');
 const api={isAdmin:()=>true,isActive:()=>active,load:async()=>({racks,revision,products}),save:async(next,old)=>{saved={racks:next,revision:old};racks=next;revision++;return {racks,revision}},assign:async payload=>{const p=products[0];p.rack=payload.p_rack_id?racks.find(r=>r.id===payload.p_rack_id).name:null;p.x_axis=payload.p_rack_id?String(payload.p_x):null;p.y_axis=payload.p_rack_id?String(payload.p_y):null;return {racks,revision,products}}};
 BinnenLocaties.mount(el,api);await new Promise(r=>setTimeout(r,30));
 el.querySelector('[data-action="add"]').click();
 for(const [key,value] of [['name','Stelling A'],['rows','3']]){const input=el.querySelector('[data-field="'+key+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
 el.querySelector('[data-field="rows"]').dispatchEvent(new Event('change',{bubbles:true}));
 for(const [y,value] of [2,4,3].entries()){const input=el.querySelector('[data-y="'+y+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
 el.querySelector('[data-action="preview"]').click();
 const cells=el.querySelectorAll('.loc-cell').length;
 el.querySelector('[data-action="save"]').click();await new Promise(r=>setTimeout(r,30));
 const message=el.querySelector('.loc-message').textContent;
 el.querySelector('[data-action="cell"][data-x="2"][data-y="1"]').click();
 const search=el.querySelector('.loc-search');search.value='JB0001';search.dispatchEvent(new Event('input',{bubbles:true}));
 el.querySelector('[data-action="assign"]').click();await new Promise(r=>setTimeout(r,30));
 const added=products[0].x_axis==='2'&&products[0].y_axis==='1'&&el.querySelector('[data-action="unassign"]')!==null;
 el.querySelector('[data-action="cell"][data-x="3"][data-y="3"]').click();
 el.querySelector('[data-action="assign"]').click();await new Promise(r=>setTimeout(r,30));
 const moved=products[0].x_axis==='3'&&products[0].y_axis==='3';
 el.querySelector('[data-action="unassign"]').click();await new Promise(r=>setTimeout(r,30));
 const removed=products[0].rack===null;

 active=false;el.innerHTML='Andere pagina';active=true;BinnenLocaties.mount(el,api);
 return {added,moved,removed,saved,cells,message,restored:el.querySelector('[data-field="name"]').value,overflow:document.documentElement.scrollWidth>innerWidth};
})()`);
 assert(result.added);assert(result.moved);assert(result.removed);assert.equal(result.cells,9);assert.equal(result.saved.racks[0].rows,3);assert.equal(result.saved.racks[0].columns,2);assert.deepEqual(result.saved.racks[0].rowColumns,[2,4,3]);assert.equal(result.restored,'Stelling A');assert(!result.overflow);assert.equal(result.message,'Indeling opgeslagen.');
 fs.writeFileSync(path.resolve(__dirname,'../dist/locatie-mobiel.png'),(await w.webContents.capturePage()).toPNG());
 console.log('GESLAAGD: producten zoeken, toevoegen, verplaatsen, uit vak halen, indeling en mobiele breedte.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
