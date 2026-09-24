const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const {EventEmitter}=require('events');
async function scenario(fase,installatieOk=true){
 const windows=[];let callback,installs=0,loads=0;
 class Window extends EventEmitter{
  constructor(){super();this.webContents=Object.assign(new EventEmitter(),{send(){}});windows.push(this);}
  loadFile(){}isDestroyed(){return false;}show(){}maximize(){}close(){}
 }
 const app=Object.assign(new EventEmitter(),{isPackaged:true,disableHardwareAcceleration(){},whenReady:()=>Promise.resolve(),getVersion:()=> '1.0.5',quit(){}});
 const ipcMain=Object.assign(new EventEmitter(),{handle(){}});
 vm.runInNewContext(fs.readFileSync('main.js','utf8'),{__dirname:process.cwd(),console,setTimeout:()=>({}),clearTimeout(){},require(n){
  if(n==='electron')return {app,BrowserWindow:Window,ipcMain,safeStorage:{}};
  if(n==='electron-updater')return {autoUpdater:{}};
  if(n==='path')return path;
  if(n==='./supabase-backend')return {registerSupabaseHandlers:()=>({prefetchAll:async()=>{loads++;return {};}})};
  if(n==='./update-beheer')return {maakUpdateBeheer:o=>{callback=o.onStatus;return {start:async()=>{},snapshot:()=>({fase}),herstart:()=>{installs++;return {ok:installatieOk};},stop(){}};}};
  throw Error(n);
 }});
 await Promise.resolve();await windows[0].webContents.listeners('did-finish-load')[0]();
 assert.equal(installs,fase==='gereed'?1:0);
 if(fase==='gereed'&&installatieOk){
  assert.equal(loads,0);assert.equal(windows.length,1);
  callback({fase:'gereed',fout:'Installer kon niet starten'});
  await new Promise(r=>setImmediate(r));
  assert.equal(loads,1);assert.equal(windows.length,2);
 }else {assert.equal(loads,1);assert.equal(windows.length,2);}
}
(async()=>{await scenario('gereed');await scenario('gereed',false);await scenario('rust');await scenario('fout');console.log('GESLAAGD: installatie voor openen hoofdvenster; bij geen update/netwerkfout/installatiefout blijft app starten.');})().catch(e=>{console.error(e);process.exit(1)});
