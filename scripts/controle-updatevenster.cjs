const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('path'),assert=require('assert');
app.disableHardwareAcceleration();
app.setPath('userData',path.resolve(__dirname,'../dist/renderer-controle'));
app.whenReady().then(async()=>{
 ipcMain.on('get-prefetched-data-sync',e=>{e.returnValue=null;});
 setTimeout(()=>app.exit(2),20000).unref();
 const status={fase:'gereed',versie:'1.0.5',verplicht:false,blokkeren:false,percent:100,fout:null};
 ipcMain.handle('binnenapp-update-status',()=>status);
 ipcMain.handle('get-app-version',()=> '1.0.4');
 ipcMain.handle('supabase-auth-session',()=>({session:null}));
 const w=new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 await w.loadFile(path.resolve(__dirname,'../BinnenApp.html'));
 for(const fase of ['gereed','downloaden','fout']) {
  w.webContents.send('binnenapp-update-status',{...status,fase});
  await new Promise(r=>setTimeout(r,100));
  const actual=await w.webContents.executeJavaScript(`({hidden:document.getElementById('optioneleUpdate').hidden,display:getComputedStyle(document.getElementById('optioneleUpdate')).display,text:document.getElementById('optioneleUpdateTekst').textContent})`);
  assert(!actual.hidden);assert.notEqual(actual.display,'none');console.log(fase,JSON.stringify(actual));
 }
 w.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
