const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),assert=require('assert');
app.disableHardwareAcceleration();app.setPath('userData',path.resolve(__dirname,'../dist/locatie-test'));
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),20000).unref();
 const fixture=path.resolve(__dirname,'../dist/locatie-fixture.html');
 fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../locaties.css"><main id="test"></main><script src="../locaties.js"></script>');
 const w=new BrowserWindow({show:false,width:390,height:844});await w.loadFile(fixture);
 const result=await w.webContents.executeJavaScript(`(async()=>{
 let saved,active=true;
 const el=document.getElementById('test');
 const api={isAdmin:()=>true,isActive:()=>active,load:async()=>({racks:[],revision:0}),save:async(racks,revision)=>{saved={racks,revision};return {racks,revision:1}}};
 BinnenLocaties.mount(el,api);await new Promise(r=>setTimeout(r,30));
 el.querySelector('[data-action="add"]').click();
 for(const [key,value] of [['name','Stelling A'],['rows','3'],['columns','4']]){const input=el.querySelector('[data-field="'+key+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
 el.querySelector('[data-action="preview"]').click();
 const cells=el.querySelectorAll('.loc-cell').length;
 el.querySelector('[data-action="save"]').click();await new Promise(r=>setTimeout(r,30));
 const message=el.querySelector('.loc-message').textContent;
 active=false;el.innerHTML='Andere pagina';active=true;BinnenLocaties.mount(el,api);
 return {saved,cells,message,restored:el.querySelector('[data-field="name"]').value,overflow:document.documentElement.scrollWidth>innerWidth};
})()`);
 assert.equal(result.cells,12);assert.equal(result.saved.racks[0].rows,3);assert.equal(result.saved.racks[0].columns,4);assert.equal(result.restored,'Stelling A');assert(!result.overflow);assert.equal(result.message,'Indeling opgeslagen.');
 fs.writeFileSync(path.resolve(__dirname,'../dist/locatie-mobiel.png'),(await w.webContents.capturePage()).toPNG());
 console.log('GESLAAGD: stelling instellen, 3x4-raster, opslaan, tabblad terugkeer en mobiele breedte.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
