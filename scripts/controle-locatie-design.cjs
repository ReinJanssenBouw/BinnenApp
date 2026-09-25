const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),assert=require('assert');
app.disableHardwareAcceleration();app.setPath('userData',path.resolve(__dirname,'../dist/locatie-design-test'));
app.whenReady().then(async()=>{
 const fixture=path.resolve(__dirname,'../dist/locatie-design.html');
 fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#f2f6fb}@media(max-width:600px){body{padding:16px}}</style><link rel="stylesheet" href="../locaties.css"><main id="test"></main><script src="../locaties.js"></script>');
 const w=new BrowserWindow({show:false,width:1440,height:1100});await w.loadFile(fixture);
 await w.webContents.executeJavaScript(`window.fixtureRacks=[{id:'a',name:'Stelling 1',rows:3,columns:5,rowColumns:[5,4,5]},{id:'b',name:'Stelling 2',rows:2,columns:3,rowColumns:[3,3]}];window.fixtureProducts=[{id:1,jb_code:'JB0001',description:'Delta Plus stofmasker FFP3 met ventiel',rack:'Stelling 1',x_axis:'1',y_axis:'3'},{id:2,jb_code:'JB0027',description:'Kelfort acrylaatkit wit 310 ml',rack:'Stelling 1',x_axis:'2',y_axis:'3'},{id:3,jb_code:'JB0010',description:'Universeelschroef verzinkt TX30',rack:'Stelling 1',x_axis:'3',y_axis:'2'},{id:4,jb_code:'JB0002',description:'Verfrol schuim extra fijn 11 cm'}];BinnenLocaties.mount(document.getElementById('test'),{isAdmin:()=>true,isActive:()=>true,load:async()=>({racks:fixtureRacks,products:fixtureProducts,revision:1})});`);
 for(const width of [1440,820,390]){
  w.setSize(width,1100);await new Promise(r=>setTimeout(r,150));
  assert(await w.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+width);
  fs.writeFileSync(path.resolve(__dirname,'../dist/locatie-design-'+width+'.png'),(await w.webContents.capturePage()).toPNG());
 }
 w.setSize(1440,1100);await w.webContents.executeJavaScript(`document.querySelector('[data-action="cell"][data-x="2"][data-y="3"]').click()`);await new Promise(r=>setTimeout(r,150));
 fs.writeFileSync(path.resolve(__dirname,'../dist/locatie-design-selected.png'),(await w.webContents.capturePage()).toPNG());
 await w.webContents.executeJavaScript(`document.querySelector('[data-action="select-rack"][data-rack="1"]').click()`);
 assert.equal(await w.webContents.executeJavaScript(`document.querySelectorAll('.loc-cell').length`),6);
 assert.equal(await w.webContents.executeJavaScript(`document.querySelector('.loc-picker')`),null);
 console.log('GESLAAGD: desktop, tablet, mobiel, stelling wisselen en selectie.');w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
