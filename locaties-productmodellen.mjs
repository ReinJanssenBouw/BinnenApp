import * as T from './vendor/three/three.module.min.js';

// Herkenbare, lichte benaderingen; de ingestelde maten blijven leidend.
export function productShape(product){
  const name=(product.description||'').toLowerCase();
  if(/schroef(?!bus)|schroeven|nagel|anker|raveeldrager|scharnier/.test(name))return 'box';
  if(/(?:acrylaat|siliconen|afdichtings|lijm|hybri)kit|kit\s.*\d+\s*ml/.test(name))return 'cartridge';
  if(/spray|purschuim|purreiniger|isolatielijm/.test(name))return 'aerosol';
  if(/compriband|butylband|tape|poetspapier/.test(name))return 'roll';
  if(/verfbak/.test(name))return 'tray';
  if(/verfrol/.test(name))return 'roller';
  if(/kwast/.test(name))return 'brush';
  if(/grondverf|staalplamuur|\bverf\b|lak\b/.test(name))return 'tin';
  return 'box';
}

export function createProductModels(redraw){
  const cache=new Map(),loader=new T.TextureLoader();let generation=0,disposed=false;
  function photo(url,apply){
    if(!url)return;
    let entry=cache.get(url);
    const current=generation,listener=texture=>{if(!disposed&&generation===current)apply(texture);};
    if(entry){if(entry.ready)listener(entry.texture);else if(!entry.failed)entry.listeners.push(listener);return;}
    entry={listeners:[listener],ready:false,failed:false};cache.set(url,entry);
    entry.texture=loader.load(url,texture=>{
      if(disposed)return;
      entry.ready=true;texture.colorSpace=T.SRGBColorSpace;
      for(const cb of entry.listeners)cb(texture);entry.listeners=[];redraw();
    },undefined,()=>{entry.failed=true;entry.listeners=[];});
    entry.texture.userData.sharedProductPhoto=true;
  }
  const material=(color,metalness=0)=>new T.MeshStandardMaterial({color,roughness:metalness?.4:.85,metalness});
  function mesh(root,geometry,color,x=0,y=0,z=0,metalness=0){
    const m=new T.Mesh(geometry,material(color,metalness));m.position.set(x,y,z);root.add(m);return m;
  }
  const cube=(r,w,h,d,x,y,z,color)=>mesh(r,new T.BoxGeometry(w,h,d),color,x,y,z);
  const cylinder=(r,top,bottom,h,y,color,metalness=0)=>mesh(r,new T.CylinderGeometry(top,bottom,h,24),color,0,y,0,metalness);
  function create(product,dimensions,{selected=false,overflow=false}={}){
    const root=new T.Group(),kind=productShape(product);root.userData.productShape=kind;
    // Ontwerp binnen een eenheidskubus; schaal daarna naar de ingevoerde buitenmaten.
    if(kind==='box'){
      cube(root,1,.96,1,0,-.02,0,0xbd915f);
      cube(root,1,.04,1,0,.48,0,0xcba779);
      cube(root,.15,.002,.98,0,.501,0,0xd9bc87);
      cube(root,.004,.002,1,0,.503,0,0x987247);
    }else if(kind==='aerosol'){
      cylinder(root,.48,.48,.78,-.08,0xe3e6e8,.35);
      cylinder(root,.48,.48,.025,-.482,0x9ea8b1,.6);
      cylinder(root,.36,.48,.09,.355,0xb1bac2,.6);
      cylinder(root,.32,.32,.10,.45,0x233c52);
    }else if(kind==='cartridge'){
      cylinder(root,.48,.48,.67,-.165,0xf4f2e9);
      cylinder(root,.49,.49,.025,-.48,0x9ba7b2,.4);
      cylinder(root,.18,.48,.06,.2,0xe9e7dd);
      cylinder(root,.035,.16,.26,.36,0xf3f0e4);
    }else if(kind==='tin'){
      cylinder(root,.49,.49,.94,-.02,0xd2d9dd,.35);
      cylinder(root,.5,.5,.04,.47,0xc0c8cc,.7);
      cylinder(root,.45,.45,.008,.494,0xe1e5e6,.5);
      cylinder(root,.5,.5,.025,-.48,0x8e9ba4,.6);
    }else if(kind==='roll'){
      const paper=/poetspapier/i.test(product.description||'');
      const shape=new T.Shape();shape.absarc(0,0,.5,0,Math.PI*2,false);
      const hole=new T.Path();hole.absarc(0,0,.17,0,Math.PI*2,true);shape.holes.push(hole);
      const geo=new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:24});geo.translate(0,0,-.5);geo.rotateX(-Math.PI/2);
      mesh(root,geo,paper?0xf4f0e7:0x363c40);
      const core=new T.Mesh(new T.CylinderGeometry(.165,.165,.99,24,1,true),new T.MeshStandardMaterial({color:0xb3936d,side:T.DoubleSide}));root.add(core);
    }else if(kind==='tray'){
      cube(root,1,.08,1,0,-.46,0,0x313a42);
      for(const x of [-.47,.47])cube(root,.06,.92,1,x,.04,0,0x3c4650);
      for(const z of [-.47,.47])cube(root,.88,.92,.06,0,.04,z,0x3c4650);
      for(let i=0;i<6;i++)cube(root,.82,.035,.025,0,-.395,-.35+i*.10,0x62707a);
    }else if(kind==='roller'){
      const geo=new T.CylinderGeometry(.5,.5,1,24);geo.rotateZ(Math.PI/2);mesh(root,geo,0xf1ecdd);
      const geoCore=new T.CylinderGeometry(.16,.16,1.004,16);geoCore.rotateZ(Math.PI/2);mesh(root,geoCore,0xaeb8b9);
    }else if(kind==='brush'){
      cylinder(root,.12,.22,.43,.285,0xbe9564);
      cylinder(root,.34,.35,.19,-.025,0xabb7be,.6);
      cylinder(root,.35,.48,.37,-.31,0xe8dec2);
    }
    // Etiket vóór het model: originele foto in zijn eigen verhouding, nooit afsnijden.
    const labelWidth=kind==='box'?.84:.68,labelHeight=kind==='box'?.70:.55;
    const labelY=kind==='cartridge'?-.19:-.05;
    const label=new T.Mesh(new T.PlaneGeometry(labelWidth,labelHeight),new T.MeshBasicMaterial({color:0xffffff}));
    label.position.set(0,labelY,.506);root.add(label);
    const imageMaterial=new T.MeshBasicMaterial({transparent:true,depthWrite:false});
    const image=new T.Mesh(new T.PlaneGeometry(1,1),imageMaterial);image.visible=false;image.position.set(0,labelY+.035,.508);root.add(image);
    photo(product.product_image_url,texture=>{
      const ratio=texture.image.width/texture.image.height;
      // Fit in world space as well, so changing box dimensions never distorts the photo.
      const maxW=labelWidth*.92*dimensions.width,maxH=labelHeight*.78*dimensions.height;
      const w=Math.min(maxW,maxH*ratio),h=w/ratio;
      image.scale.set(w/dimensions.width,h/dimensions.height,1);imageMaterial.map=texture;imageMaterial.needsUpdate=true;image.visible=true;
    });
    if(selected||overflow){
      const outline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.015,1.015,1.025)),new T.LineBasicMaterial({color:selected?0x3675e2:0xc86955}));root.add(outline);
    }
    root.scale.set(dimensions.width,dimensions.height,dimensions.depth);
    return {root,labelY:labelY-labelHeight*.40,kind};
  }
  return {create,reset(){generation++;for(const entry of cache.values())entry.listeners=[];},dispose(){disposed=true;for(const entry of cache.values()){entry.listeners=[];entry.texture.dispose();}cache.clear();}};
}
