const {app,BrowserWindow}=require('electron'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.setPath('userData',path.resolve(__dirname,'../dist/ar-test'));
const root=path.resolve(__dirname,'../mobiel');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html');return res.end(`<!doctype html><iframe id="frame" src="/ar/index.html" allow="camera" style="width:100%;height:740px;border:0"></iframe><script>addEventListener('message',e=>{if(e.data?.type==='binnenapp-ar-ready')e.source.postMessage({type:'binnenapp-ar-data',rack:{id:'test',name:'Stelling test',rows:2,columns:2,rowColumns:[2,3]},products:[{id:1,jb_code:'JB0001',description:'Test kwast',rack:'Stelling test',x_axis:'1',y_axis:'1'}]},location.origin);});</script>`);}
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.dat':'application/octet-stream','.patt':'text/plain'};
 fs.readFile(file,(err,buf)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':buf);});
});
app.whenReady().then(async()=>{
 setTimeout(()=>{console.error('AR test timeout');app.exit(2)},45000).unref();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const w=new BrowserWindow({show:false,width:1000,height:800});w.webContents.session.setPermissionRequestHandler((wc,p,cb)=>cb(true));
 w.webContents.on('console-message',(...args)=>{const msg=typeof args[1]==='object'?args[1].message:args[2];if(/error|failed/i.test(msg||''))console.log(msg);});
 await w.loadURL('http://127.0.0.1:'+server.address().port+'/fixture');
 const frame=w.webContents.mainFrame.frames[0];
 await frame.executeJavaScript(`(async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');const img=new Image();img.src='hiro.png';await img.decode();const draw=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.drawImage(img,60,230,160,160);};draw();window.testTimer=setInterval(draw,33);navigator.mediaDevices.getUserMedia=async()=>{window.testStream=canvas.captureStream(30);return window.testStream;};})()`);
 assert.equal(await frame.executeJavaScript(`document.getElementById('start').disabled`),false);
 await frame.executeJavaScript(`document.getElementById('start').click()`);
 let found=false;
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,200));found=await frame.executeJavaScript(`document.getElementById('status').textContent.includes('Marker herkend')`);if(found)break;}
 const state=await frame.executeJavaScript(`({status:document.getElementById('status').textContent,scene:!!document.querySelector('a-scene'),marker:document.querySelector('a-marker')?.object3D?.visible,children:document.querySelector('a-marker')?.object3D?.children.length})`);console.log(JSON.stringify(state));
 await new Promise(r=>setTimeout(r,1000));
 fs.writeFileSync(path.resolve(__dirname,'../dist/ar-test.png'),(await w.webContents.capturePage()).toPNG());
 assert(found,'Hiro-marker wordt herkend in gesimuleerde camerastream');assert(state.children>0,'3D-indeling opgebouwd');
 await frame.executeJavaScript(`document.getElementById('stop').click()`);
 const stopped=await frame.executeJavaScript(`({tracks:window.testStream.getTracks().every(t=>t.readyState==='ended'),scene:!!document.querySelector('a-scene')})`);
 assert(stopped.tracks);assert(!stopped.scene);
 await frame.executeJavaScript(`navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Geen toestemming','NotAllowedError')};document.getElementById('start').click()`);
 await new Promise(r=>setTimeout(r,700));
 assert(await frame.executeJavaScript(`document.getElementById('summary').textContent.includes('camera kon niet starten')`),'Weigering van cameratoegang heeft bruikbare melding');
 console.log('GESLAAGD: instellingen, lokale AR-bibliotheken, herkenning met gesimuleerde camera, 3D-vakken en camera stoppen.');w.destroy();server.close();app.quit();
}).catch(e=>{console.error(e);server.close();app.exit(1)});
