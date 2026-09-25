const {app,BrowserWindow}=require('electron'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('enable-unsafe-swiftshader');app.setPath('userData',path.resolve(__dirname,'../dist/ar-doos-test'));
const root=path.resolve(__dirname,'../mobiel');
const fixture=`<script>
window.testVisible=true;window.testDenied=false;
navigator.mediaDevices.getUserMedia=async()=>{
 if(window.testDenied)throw new DOMException('Geen toestemming','NotAllowedError');
 const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;const ctx=canvas.getContext('2d');const img=new Image();img.src='/ar/hiro.png';await img.decode();
 const draw=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,390,844);if(window.testVisible)ctx.drawImage(img,40,240,140,140);};draw();
 clearInterval(window.testTimer);window.testTimer=setInterval(draw,33);window.testStream=canvas.captureStream(30);return window.testStream;
};
</script>`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,buf)=>{const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'};res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'Missing':url.pathname==='/ar/doos.html'?buf.toString().replace('<head>','<head>'+fixture):buf);});
});
app.whenReady().then(async()=>{
 setTimeout(()=>{console.error('Test timeout');app.exit(2)},55000).unref();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const w=new BrowserWindow({show:false,width:390,height:844,webPreferences:{backgroundThrottling:false,offscreen:true}});const errors=[];
 w.webContents.on('console-message',(...args)=>{const msg=typeof args[1]==='object'?args[1].message:args[2];if(/Uncaught/.test(msg||''))errors.push(msg);});
 const run=s=>w.webContents.executeJavaScript(s);
 const wait=async(s)=>{for(let i=0;i<100;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+s);};
 const url='http://127.0.0.1:'+server.address().port+'/ar/doos.html';await w.loadURL(url);await run(`localStorage.clear()`);await w.loadURL(url);
 assert(await run(`document.documentElement.scrollWidth<=innerWidth`),'Geen horizontale overflow');
 fs.writeFileSync(path.resolve(__dirname,'../dist/ar-doos-setup.png'),(await w.webContents.capturePage()).toPNG());
 const start=async()=>{await run(`document.getElementById('start').click()`);await wait(`document.getElementById('status').textContent.includes('Plaatje herkend')`);};
 await start();
 await run(`for(const [key,value]of Object.entries({x:24,z:-12,height:7,size:20,angle:45})){const input=document.getElementById(key);input.value=value;input.dispatchEvent(new Event('input'));}document.getElementById('save').click()`);
 const pose=await run(`JSON.parse(localStorage.getItem('binnenapp-ar-doos-hiro-v1')).pose`);assert.equal(pose.x,24);assert.equal(pose.angle,45);
 const transform=`(()=>{const box=document.querySelector('a-marker').object3D.getObjectByName('bewaarde-doos');return {position:box.position.toArray(),scale:box.scale.toArray(),rotation:box.rotation.toArray()};})()`;
 const first=await run(transform);assert.equal(first.position[0],24/18.4);assert.equal(first.position[1],7/18.4);
 await run(`window.testVisible=false`);await wait(`document.getElementById('save').disabled`);assert(await run(`!document.querySelector('a-marker').object3D.visible`));
 await run(`window.testVisible=true`);await wait(`!document.getElementById('save').disabled`);
 await run(`document.getElementById('adjust').open=false`);await new Promise(r=>setTimeout(r,1000));
 fs.writeFileSync(path.resolve(__dirname,'../dist/ar-doos-camera.png'),(await w.webContents.capturePage()).toPNG());
 await run(`document.getElementById('stop').click()`);assert(await run(`window.testStream.getTracks().every(t=>t.readyState==='ended')&&!document.querySelector('a-scene')`));
 await w.loadURL(url);assert(await run(`document.getElementById('x').value==='24'`));await start();assert.deepStrictEqual(await run(transform),first);
 await run(`document.getElementById('stop').click()`);await start();assert.deepStrictEqual(await run(transform),first);
 await run(`Storage.prototype.setItem=function(){throw new DOMException('Blocked','QuotaExceededError')};document.getElementById('save').click()`);assert(await run(`document.getElementById('saved').textContent.includes('Bewaren lukt niet')`));
 await run(`document.getElementById('stop').click();window.testDenied=true;document.getElementById('start').click()`);await wait(`document.getElementById('summary').textContent.includes('camera kon niet starten')`);
 await w.loadURL(url);await run(`document.getElementById('forget').click()`);assert(await run(`localStorage.getItem('binnenapp-ar-doos-hiro-v1')===null`));
 await run(`localStorage.setItem('binnenapp-ar-doos-hiro-v1',JSON.stringify({version:1,pose:{x:999}}))`);await w.loadURL(url);assert(await run(`document.getElementById('x').value==='30'`));await run(`localStorage.clear()`);
 assert.deepStrictEqual(errors,[]);console.log('GESLAAGD: herkenning, markerverlies/herkenning, bewaren, herstel na pagina herladen en camera heropenen, identieke 3D-transformatie, camera stoppen, opslagfout, geweigerde camera, wissen en ongeldige opslag. Geen JavaScript-excepties.');
 w.destroy();server.close();app.quit();
}).catch(e=>{console.error(e);server.close();app.exit(1)});
