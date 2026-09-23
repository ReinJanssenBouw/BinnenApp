const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');

(async()=>{
 const vensters=[],berichten=[];let updates=0;
 class Venster extends EventEmitter{
  constructor(opties){super();this.opties=opties;this.webContents=new EventEmitter();this.webContents.send=(...args)=>berichten.push(args);vensters.push(this);}
  loadFile(bestand){this.bestand=path.basename(bestand);}
  isDestroyed(){return false;}
  maximize(){}
  show(){this.zichtbaar=true;}
  close(){this.gesloten=true;this.emit('closed');}
 }
 const app=Object.assign(new EventEmitter(),{isPackaged:true,disableHardwareAcceleration(){},whenReady:()=>Promise.resolve(),getVersion:()=> '1.0.1',quit(){}});
 const ipcMain=Object.assign(new EventEmitter(),{handle(){}});
 const root=path.resolve(__dirname,'..');
 vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),{
  __dirname:root,console,setTimeout:()=>({}),clearTimeout(){},
  require(naam){
   if(naam==='electron')return {app,BrowserWindow:Venster,ipcMain,safeStorage:{}};
   if(naam==='electron-updater')return {autoUpdater:{}};
   if(naam==='path')return path;
   if(naam==='./supabase-backend')return {registerSupabaseHandlers:()=>({prefetchAll:async(cb)=>{cb(1,1,'Artikelen geladen');return {};}})};
   if(naam==='./update-beheer')return {maakUpdateBeheer:()=>({start(){updates++;},snapshot:()=>({}),stop(){}})};
   throw Error('Onverwachte module '+naam);
  }
 });
 await Promise.resolve();
 assert.equal(vensters.length,1);
 assert.equal(vensters[0].bestand,'splash.html');
 await vensters[0].webContents.listeners('did-finish-load')[0]();
 assert.equal(updates,1);
 assert.equal(vensters[1].bestand,'BinnenApp.html');
 assert.equal(vensters[1].opties.show,false);
 vensters[1].emit('ready-to-show');
 assert.notEqual(vensters[0].gesloten,true);
 ipcMain.emit('startup-sync-ready');
 assert.equal(vensters[1].zichtbaar,true);
 assert.equal(vensters[0].gesloten,true);
 assert(berichten.some(([kanaal,b])=>kanaal==='splash-status'&&b.type==='version'&&b.version==='1.0.1'));
 console.log('GESLAAGD: splash verschijnt eerst, updatecontrole start, hoofdvenster wacht op gereed-signaal en splash sluit daarna.');
})().catch(e=>{console.error(e);process.exitCode=1;});
