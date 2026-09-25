const {app,BrowserWindow}=require('electron'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.setPath('userData',path.resolve(__dirname,'../dist/mobile-stock-test'));
const root=path.resolve(__dirname,'../mobiel');
const mock=`
const createClient=()=>window.testDB;
window.testRow={id:1,description:'WD-40 onderhoudsspray 450 ml',jb_code:'JB0012',stock:8,min_stock:6,unit:'st',packaged_per:1};
window.testCalls=[];window.testFail=false;
window.testDB={auth:{getSession:async()=>({data:{session:null}})},rpc:async(name,args)=>{
 window.testCalls.push({name,args});await new Promise(r=>setTimeout(r,80));
 if(window.testFail){window.testRow.min_stock=7;return {error:{code:'40001',message:'Dit artikel is intussen gewijzigd. Ververs en probeer opnieuw.'}};}
 const field=name==='binnenapp_set_min_stock'?'min_stock':'stock';
 if(window.testRow[field]!==args[field==='stock'?'p_expected_stock':'p_expected_min'])throw Error('Wrong expected value');
 window.testRow[field]=args['p_'+field];return {data:{...window.testRow}};
},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{...window.testRow}})})})})};
`;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);return res.end();}let content=buf;
 if(u.pathname==='/app.js')content=buf.toString().replace(/^import .*;\r?\n/,mock)+'\nwindow.testApp={staat,tekenScherm,voorraadOpslaan,voorraadGrenzenOpslaan};';
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
 });
});
app.whenReady().then(async()=>{
 setTimeout(()=>app.exit(2),50000).unref();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const w=new BrowserWindow({show:false,width:390,height:844,webPreferences:{offscreen:true,backgroundThrottling:false}}),errors=[];
 w.webContents.on('console-message',(...a)=>{const m=typeof a[1]==='object'?a[1].message:a[2];if(/Uncaught/.test(m||''))errors.push(m)});
 // Uitsluitend lokale mocks; de test mag nooit de productie-database aanspreken.
 w.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('http://127.0.0.1:')&&!d.url.startsWith('data:')}));
 const run=s=>w.webContents.executeJavaScript(s);
 const wait=async s=>{for(let i=0;i<100;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+s)};
 await w.loadURL('http://127.0.0.1:'+server.address().port+'/');await wait('!!window.testApp');
 await run(`testApp.staat.beheerder=true;testApp.staat.tab='voorraad';testApp.staat.producten=[{...testRow}];document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');testApp.tekenScherm(true)`);
 const edit=async(sel,value)=>run(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async sel=>run(`document.querySelector(${JSON.stringify(sel)}).click()`);
 assert(await run(`!!document.querySelector('[data-minimum-veld]')&&!document.querySelector('details.voorraad-grenzen')`));
 await edit('[data-voorraad-veld]','');assert(await run(`document.querySelector('[data-voorraad-opslaan]').disabled`));
 await run(`testApp.voorraadOpslaan(1,'')`);assert.equal(await run('testCalls.length'),0);
 await edit('[data-minimum-veld]','-1');assert(await run(`document.querySelector('[data-grenzen-opslaan]').disabled`));
 await edit('[data-minimum-veld]','1.5');assert(await run(`document.querySelector('[data-grenzen-opslaan]').disabled`));
 await edit('[data-minimum-veld]','10');await edit('[data-voorraad-veld]','5');
 await click('[data-voorraad-opslaan]');await wait('!testApp.staat.voorraadBezig.size');
 assert.deepEqual(await run('({stock:testRow.stock,min:testRow.min_stock})'),{stock:5,min:6});
 assert.equal(await run(`document.querySelector('[data-minimum-veld]').value`),'10');
 await click('[data-grenzen-opslaan]');await wait('!testApp.staat.voorraadBezig.size');assert.equal(await run('testRow.min_stock'),10);assert.equal(await run('testRow.stock'),5);
 await edit('[data-voorraad-veld]','0');await click('[data-voorraad-opslaan]');await wait('!testApp.staat.voorraadBezig.size');assert.equal(await run('testRow.stock'),0);
 await edit('[data-voorraad-veld]','9');await edit('[data-minimum-veld]','0');await click('[data-grenzen-opslaan]');await wait('!testApp.staat.voorraadBezig.size');
 assert.equal(await run('testRow.min_stock'),0);assert.equal(await run(`document.querySelector('[data-voorraad-veld]').value`),'9');
 await run('window.testFail=true');await edit('[data-minimum-veld]','4');await click('[data-grenzen-opslaan]');await wait('!testApp.staat.voorraadBezig.size');
 assert.equal(await run('testApp.staat.producten[0].min_stock'),7);assert.equal(await run(`document.querySelector('[data-minimum-veld]').value`),'4');assert(await run(`document.getElementById('toast').textContent.includes('gewijzigd')`));
 await run('window.testFail=false');await click('[data-grenzen-opslaan]');await wait('!testApp.staat.voorraadBezig.size');assert.equal(await run('testRow.min_stock'),4);
 await click('[data-voorraad-opslaan]');await wait('!testApp.staat.voorraadBezig.size');
 // Echte layout bij telefoon-, smalle telefoon- en tabletbreedte.
 for(const width of [390,320,820]){w.setContentSize(width,844);await new Promise(r=>setTimeout(r,400));assert(await run(`document.documentElement.scrollWidth<=innerWidth`),'Geen overflow '+width);assert(await run(`Array.from(document.querySelectorAll('.voorraad-bediening,.voorraad-minimum-bediening')).every(el=>el.scrollWidth<=el.clientWidth)`),'Bediening past '+width);fs.writeFileSync(path.resolve(__dirname,'../dist/mobile-stock-'+width+'.png'),(await w.webContents.capturePage()).toPNG());}
 await run(`testApp.staat.beheerder=false;testApp.tekenScherm(true)`);assert(await run(`!document.querySelector('[data-minimum-veld]')&&!!document.querySelector('[data-voorraad-veld]')`));
 const count=await run('testCalls.length');await run(`testApp.voorraadGrenzenOpslaan(1,{disabled:false})`);assert.equal(await run('testCalls.length'),count);
 assert.deepEqual(errors,[]);console.log('GESLAAGD: voorraad/minimum afzonderlijk opslaan, nul, ongeldige invoer, conceptbehoud, gelijktijdige wijziging/herstel, beheerdersrechten, telefoon320/390 en tablet820. Alle databaseverzoeken gemockt; geen productiedata gewijzigd.');w.destroy();server.close();app.quit();
}).catch(e=>{console.error(e);server.close();app.exit(1)});
