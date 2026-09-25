/* BinnenApp AR-proef: alleen weergave, geen databasewijzigingen. */
(() => {
  const $=id=>document.getElementById(id);
  let data,scene,running=false,starting=false,watchdog,session=0;
  const scripts=new Map();
  const tell=text=>{$('summary').textContent=text;$('status').textContent=text;};
  function loadScript(url){
    if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{scripts.delete(url);s.remove();reject(new Error('AR-bestanden laden mislukt. Controleer je verbinding.'));};document.head.append(s);}));
    return scripts.get(url);
  }
  function stop(){
    session++;clearTimeout(watchdog);running=false;starting=false;
    document.querySelectorAll('video').forEach(v=>{v.srcObject?.getTracks().forEach(t=>t.stop());v.srcObject=null;v.remove();});
    if(scene){scene.pause();scene.renderer?.setAnimationLoop(null);scene.renderer?.dispose();scene.remove();scene=null;}
    document.querySelectorAll('.arjs-loader,#arjsDebugUIContainer').forEach(e=>e.remove());
    document.body.classList.remove('running');$('setup').hidden=false;$('live').hidden=true;$('start').disabled=!data;$('start').textContent='Camera starten';
  }
  $('stop').onclick=()=>{stop();tell('Camera gestopt. Je kunt de proef opnieuw starten.');};
  $('close').onclick=()=>{stop();if(parent!==window)parent.postMessage({type:'binnenapp-ar-close'},location.origin);else location.href='/';};
  addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting)){stop();tell('Camera gepauzeerd. Tik op Camera starten om verder te gaan.');}});
  addEventListener('camera-error',()=>{stop();tell('De camera kon niet starten. Geef cameratoegang via de website-instellingen in Safari en probeer opnieuw.');});
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin)return;
    if(event.data?.type==='binnenapp-ar-stop'){stop();return;}
    if(event.data?.type!=='binnenapp-ar-data'||running||starting)return;
    const next=event.data;
    if(!next.rack||!Array.isArray(next.products))return;
    data=next;$('title').textContent=data.rack.name;
    const placed=data.products.filter(p=>p.rack===data.rack.name);
    tell(`${data.rack.name} · ${data.rack.rows} rijen · ${placed.length} producten ingedeeld`);
    $('start').disabled=false;
    try{const settings=JSON.parse(localStorage.getItem('binnenapp-ar-'+data.rack.id)||'null');if(settings)for(const key of ['width','height','markerSize','gap'])if(Number.isFinite(settings[key]))$(key).value=settings[key];}catch{}
  });
  if(parent!==window)parent.postMessage({type:'binnenapp-ar-ready'},location.origin);
  else tell('Open deze proef vanuit Locatie in BinnenApp.');
  $('mode').onchange=()=>{$('dimensions').hidden=$('mode').value!=='real';};

  function buildModel(marker,rack,products,settings){
    const T=AFRAME.THREE;
    const root=new T.Group();root.rotation.x=-Math.PI/2;marker.object3D.add(root);
    const scale=settings.mode==='mini'?1:settings.markerSize;
    const width=settings.mode==='mini'?1.6:settings.width/scale;
    const height=settings.mode==='mini'?1.2:settings.height/scale;
    const left=.5+(settings.mode==='mini'?.15:settings.gap/scale);
    const rows=Number(rack.rows),linePoints=[];
    const segment=(x1,y1,x2,y2)=>linePoints.push(x1,y1,.012,x2,y2,.012);
    const materials=[];
    for(let y=1;y<=rows;y++){
      const count=Number(rack.rowColumns?.[y-1]??rack.columns),h=height/rows,w=width/count,bottom=(y-1)*h;
      for(let x=1;x<=count;x++){
        const x0=left+(x-1)*w,items=products.filter(p=>p.rack===rack.name&&Number(p.x_axis)===x&&Number(p.y_axis)===y);
        segment(x0,bottom,x0+w,bottom);segment(x0,bottom,x0,bottom+h);
        if(x===count)segment(x0+w,bottom,x0+w,bottom+h);
        if(y===rows)segment(x0,bottom+h,x0+w,bottom+h);
        if(items.length){
          const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
          const ctx=canvas.getContext('2d');ctx.fillStyle='#153968';ctx.fillRect(0,0,512,192);ctx.fillStyle='#9fcbff';ctx.font='bold 27px sans-serif';ctx.fillText(`X${x} / Y${y}  ${items[0].jb_code||''}`,18,38);
          ctx.fillStyle='#ffffff';ctx.font='bold 26px sans-serif';
          const words=String(items[0].description||'Product').split(/\s+/);let line='',lines=[];
          for(const word of words){if(ctx.measureText(line+' '+word).width>472&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}
          if(line)lines.push(line);lines.slice(0,2).forEach((text,i)=>ctx.fillText(text,18,82+i*33));
          if(items.length>1){ctx.font='22px sans-serif';ctx.fillText(`+ ${items.length-1} producten`,18,166);}
          const texture=new T.CanvasTexture(canvas);const material=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,depthTest:false});materials.push(material);
          const labelW=w*.92,labelH=Math.min(h*.8,labelW*192/512);
          const label=new T.Mesh(new T.PlaneGeometry(labelW,labelH),material);label.position.set(x0+w/2,bottom+h/2,.03);label.renderOrder=2;root.add(label);
        }
      }
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(linePoints,3));
    root.add(new T.LineSegments(geo,new T.LineBasicMaterial({color:0x69bdff,depthTest:false})));
    scene.addEventListener('removed',()=>{root.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});},{once:true});
  }

  $('settings').onsubmit=async event=>{
    event.preventDefault();if(!data||starting||running)return;
    if(!navigator.mediaDevices?.getUserMedia){tell('Open BinnenApp via HTTPS in Safari op je iPhone om de camera te gebruiken.');return;}
    const settings={mode:$('mode').value};
    for(const key of ['width','height','markerSize','gap']){settings[key]=Number($(key).value);if(!$(key).checkValidity()){tell('Controleer de ingevulde afmetingen.');return;}}
    if(settings.mode==='real')try{localStorage.setItem('binnenapp-ar-'+data.rack.id,JSON.stringify(settings));}catch{}
    const current=++session;starting=true;$('start').disabled=true;$('start').textContent='AR laden…';tell('AR voorbereiden…');
    try{
      await loadScript('/ar/vendor/aframe-1.6.0.min.js');await loadScript('/ar/vendor/aframe-ar-3.4.7.js');
      if(current!==session)return;
      document.body.classList.add('running');$('setup').hidden=true;$('live').hidden=false;
      scene=document.createElement('a-scene');scene.setAttribute('embedded','');scene.setAttribute('vr-mode-ui','enabled: false');scene.setAttribute('renderer','alpha: true; antialias: true');scene.setAttribute('device-orientation-permission-ui','enabled: false');
      scene.setAttribute('arjs','sourceType: webcam; debugUIEnabled: false; detectionMode: mono; cameraParametersUrl: /ar/vendor/camera_para.dat; maxDetectionRate: 30;');
      const marker=document.createElement('a-marker');marker.setAttribute('type','pattern');marker.setAttribute('url','/ar/vendor/patt.hiro');marker.setAttribute('size','1');marker.setAttribute('emitevents','true');
      marker.addEventListener('markerFound',()=>{if(current===session){clearTimeout(watchdog);tell('Marker herkend · houd hem in beeld');}});
      marker.addEventListener('markerLost',()=>{if(current===session)tell('Marker uit beeld · richt de camera weer op het hele vierkant');});
      scene.append(marker);const camera=document.createElement('a-entity');camera.setAttribute('camera','');scene.append(camera);
      marker.addEventListener('loaded',()=>{if(current===session)buildModel(marker,data.rack,data.products,settings);},{once:true});
      document.body.append(scene);running=true;starting=false;tell('Geef cameratoegang en richt op de Hiro-marker.');
      watchdog=setTimeout(()=>{if(current===session)tell('Nog geen marker gezien. Houd het hele vierkant goed verlicht in beeld, zonder reflecties.');},18000);
    }catch(error){stop();tell(error.message||'AR kon niet starten. Probeer opnieuw.');}
  };
})();
