import * as T from './vendor/three/three.module.min.js';
import {OrbitControls} from './vendor/three/OrbitControls.js';

export function createLocationView(host, onSelect) {
  const scene=new T.Scene(); scene.background=new T.Color('#eaf0f7');scene.fog=new T.Fog('#eaf0f7',25,65);
  const camera=new T.PerspectiveCamera(40,1,.01,1000);
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(1,1);
  renderer.domElement.tabIndex=0; renderer.domElement.setAttribute('aria-label','3D-stellingen. Sleep om te draaien, scroll om te zoomen. Kies vakken ook via de instellingen rechts.');
  host.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.2;controls.maxDistance=200;controls.maxPolarAngle=Math.PI*.49;
  scene.add(new T.HemisphereLight(0xffffff,0x667d98,2.4));
  const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(5,9,7);scene.add(sun);
  const content=new T.Group();scene.add(content);
  // Vaste binnenmaat in meters; stellingposities blijven in cm vanaf het midden.
  const room=new T.Group();scene.add(room);
  const roomWidth=6.630,roomDepth=4.820,halfW=roomWidth/2,halfD=roomDepth/2;
  box(room,roomWidth,.06,roomDepth,0,-.06,0,0xdce5ef);
  const floorLines=[];
  for(let x=Math.ceil(-halfW/.5)*.5;x<halfW;x+=.5)floorLines.push(x,-.025,-halfD,x,-.025,halfD);
  for(let z=Math.ceil(-halfD/.5)*.5;z<halfD;z+=.5)floorLines.push(-halfW,-.025,z,halfW,-.025,z);
  function lines(points,color){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));room.add(new T.LineSegments(geo,new T.LineBasicMaterial({color})));}
  lines(floorLines,0xb3c2d4);
  lines([-halfW,0,-halfD,halfW,0,-halfD,halfW,0,-halfD,halfW,0,halfD,halfW,0,halfD,-halfW,0,halfD,-halfW,0,halfD,-halfW,0,-halfD],0x315887);
  // Maatlijnen rond de vloer; er is nog geen wandhoogte opgegeven.
  const dimZ=halfD+.32,dimX=-halfW-.32;
  lines([-halfW,0,dimZ,halfW,0,dimZ,dimX,0,-halfD,dimX,0,halfD,
    -halfW,0,dimZ-.1,-halfW,0,dimZ+.1,halfW,0,dimZ-.1,halfW,0,dimZ+.1,
    dimX-.1,0,-halfD,dimX+.1,0,-halfD,dimX-.1,0,halfD,dimX+.1,0,halfD],0x617b9e);
  const widthLabel=text(room,'6630 mm',0,.01,dimZ+.23,1.5,.3);
  const depthLabel=text(room,'4820 mm',dimX-.23,.01,0,1.5,.3);
  let targets=[],snapshot,selected,overview=false,down=null,disposed=false;
  const ray=new T.Raycaster();
  function render(){if(!disposed&&host.clientWidth&&host.clientHeight){widthLabel.quaternion.copy(camera.quaternion);depthLabel.quaternion.copy(camera.quaternion);renderer.render(scene,camera);}}
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
  const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render);
  function clear(){content.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});content.clear();targets=[];}
  function box(parent,w,h,d,x,y,z,color,hit){
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.72,metalness:.12}));mesh.position.set(x,y,z);parent.add(mesh);
    if(hit){mesh.userData.hit=hit;targets.push(mesh);}return mesh;
  }
  function text(parent,label,x,y,z,width,height,color='#173252',bg='#ffffff'){
    const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font='bold 54px system-ui';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(label,256,64,480);
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));m.position.set(x,y,z);parent.add(m);return m;
  }
  function update(data,selection,all=false){
    snapshot=data;selected=selection;overview=all;clear();
    for(const r of data.racks){
      if(!all&&r.id!==selection.rackId)continue;
      const g=data.geometry.racks[r.id],w=g.width/100,h=g.height/100,d=g.depth/100;
      const group=new T.Group();group.position.set(g.x/100,0,g.z/100);group.rotation.y=g.angle*Math.PI/180;content.add(group);
      const cellHeight=h/r.rows,inside=Math.max(.02,w-.08),segments=[];
      for(const x of [-(w-.035)/2,(w-.035)/2])for(const z of [-(d-.035)/2,(d-.035)/2])box(group,.035,h,.035,x,h/2,z,0x315887,{rackId:r.id});
      for(let y=0;y<=r.rows;y++){
        box(group,w,.025,d,0,y*cellHeight+.0125,0,0xb8c4d1,{rackId:r.id});
        box(group,w,.04,.025,0,y*cellHeight+.02,d/2-.0125,0x315887,{rackId:r.id});
      }
      text(group,r.name,0,h+.19,d/2,Math.min(w,.95),.18,'#ffffff','#214b86');
      const products=data.products.filter(p=>p.rack===r.name);
      for(let y=1;y<=r.rows;y++){
        const cols=r.rowColumns[y-1],cellWidth=inside/cols;
        for(let x=1;x<=cols;x++){
          const left=-inside/2+(x-1)*cellWidth,bottom=(y-1)*cellHeight;
          if(x>1)segments.push(left,bottom+.03,d/2+.003,left,bottom+cellHeight,d/2+.003);
          {
            const plane=new T.Mesh(new T.PlaneGeometry(cellWidth,cellHeight-.04),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));
            plane.position.set(left+cellWidth/2,bottom+cellHeight/2,d/2+.006);plane.userData.hit={rackId:r.id,x,y};group.add(plane);targets.push(plane);
          }
          const items=products.filter(p=>Number(p.x_axis)===x&&Number(p.y_axis)===y);
          const totalWidth=items.reduce((a,p)=>a+data.geometry.products[p.id].width/100+.02,0);
          let offset=left+.015;
          for(const p of items){
            const pg=data.geometry.products[p.id],pw=pg.width/100,ph=pg.height/100,pd=pg.depth/100;
            const overflow=totalWidth>cellWidth-.02||ph>cellHeight-.04||pd>d-.04;
            const color=String(selection.productId)===String(p.id)?0x3675e2:overflow?0xc86955:0xc99d6b;
            const hit={rackId:r.id,x,y,productId:p.id};
            box(group,pw,ph,pd,offset+pw/2,bottom+.028+ph/2,d/2-.015-pd/2,color,hit);
            text(group,p.jb_code||String(p.id),offset+pw/2,bottom+.028+ph*.6,d/2-.012,Math.min(pw*.9,.45),Math.min(ph*.38,.11));
            offset+=pw+.02;
          }
          if(r.id===selection.rackId&&selection.x===x&&selection.y===y){
            const outline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(cellWidth,cellHeight-.035,d+.015)),new T.LineBasicMaterial({color:0x2b70ed}));outline.position.set(left+cellWidth/2,bottom+cellHeight/2,0);group.add(outline);
          }
        }
      }
      if(segments.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(segments,3));group.add(new T.LineSegments(geo,new T.LineBasicMaterial({color:0x8c9fb6})));}
    }
    render();
  }
  function fit(mode='perspective'){
    const bounds=new T.Box3().setFromObject(content);
    if(overview||bounds.isEmpty())bounds.union(new T.Box3().setFromObject(room));
    const c=bounds.getCenter(new T.Vector3()),s=bounds.getSize(new T.Vector3());
    const verticalFov=camera.fov*Math.PI/180;
    const horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*camera.aspect);
    const distance=Math.max(s.length()/2,.5)/Math.sin(Math.min(verticalFov,horizontalFov)/2)*1.12;
    controls.target.copy(c);
    const direction=mode==='front'?new T.Vector3(0,.08,1):mode==='top'?new T.Vector3(0,1,.001):new T.Vector3(1,overview?1.35:.65,1.4);
    if(!overview&&snapshot){const rack=snapshot.racks.find(r=>r.id===selected.rackId);if(rack)direction.applyAxisAngle(new T.Vector3(0,1,0),snapshot.geometry.racks[rack.id].angle*Math.PI/180);}
    camera.position.copy(c).add(direction.normalize().multiplyScalar(distance));controls.update();resize();
  }
  const onDown=e=>{down={x:e.clientX,y:e.clientY};};
  const onUp=e=>{
    const start=down;down=null;if(e.button!==0||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
    const b=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),camera);
    const hits=ray.intersectObjects(targets,false);
    // Een product vóór het vak krijgt voorrang op de onzichtbare selectieplaat.
    const nearest=hits[0]?.object.userData.hit;
    const product=nearest?.x?hits.find(hit=>{const h=hit.object.userData.hit;return h.productId&&h.rackId===nearest.rackId&&h.x===nearest.x&&h.y===nearest.y;}):null;
    const hit=product||hits[0];if(hit)onSelect(hit.object.userData.hit);
  };
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();host.dispatchEvent(new CustomEvent('view-error',{detail:'3D-weergave onderbroken. Heropen Locatie of gebruik de vakkenlijst.'}));});
  resize();
  return {update,fit,resize,dispose(){disposed=true;observer.disconnect();controls.dispose();clear();room.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});renderer.dispose();renderer.domElement.remove();}};
}
