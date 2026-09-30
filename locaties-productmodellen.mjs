import * as T from './vendor/three/three.module.min.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';
import {createModelOptimizer} from './product-model-optimize.mjs';

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

export function createProductModels(redraw,onModelError=()=>{}){
  const cache=new Map(),loader=new T.TextureLoader();let generation=0,disposed=false;
  const models=new Map(),batches=new Set();
  const optimizer=createModelOptimizer();
  function custom(url,apply){
    const current=generation;
    let promise=models.get(url);
    if(!promise){
      const manager=new T.LoadingManager();manager.setURLModifier(value=>{if(value===url||/^(blob:|data:)/.test(value))return value;throw Error('Extern modelbestand geweigerd');});
      promise=new GLTFLoader(manager).loadAsync(url).then(async gltf=>{
        const source=gltf.scene,bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3());
        if(![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0)){disposeSource(source);throw Error('Model heeft geen geldige buitenmaten');}
        await optimizer.optimize(source);
        source.traverse(o=>{if(o.geometry)o.geometry.userData.sharedProductModel=true;for(const m of [].concat(o.material||[]))for(const v of Object.values(m))if(v?.isTexture)v.userData.sharedProductPhoto=true;});
        if(disposed){disposeSource(source);throw Error('Weergave gesloten');}return {source,bounds,size};
      });models.set(url,promise);
    }
    promise.then(({source,bounds,size})=>{
      if(disposed||generation!==current)return;
      const copy=source.clone(true);copy.traverse(o=>{if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
      const center=bounds.getCenter(new T.Vector3()),unit=new T.Group();unit.scale.set(1/size.x,1/size.y,1/size.z);copy.position.sub(center);unit.add(copy);apply(unit);redraw();
    }).catch(()=>{if(!disposed&&generation===current){apply(null);redraw();}});
  }
  function disposeSource(source){const textures=new Set();source.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[])){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}});for(const t of textures)t.dispose();}
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
  function create(product,dimensions,{selected=false,overflow=false,onChange=()=>{}}={}){
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
      image.scale.set(w/dimensions.width,h/dimensions.height,1);imageMaterial.map=texture;imageMaterial.needsUpdate=true;image.visible=root.userData.modelStatus!=='ready';onChange();
    });
    if(selected||overflow){
      const outline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.015,1.015,1.025)),new T.LineBasicMaterial({color:selected?0x3675e2:0xc86955}));root.add(outline);
    }
    root.scale.set(dimensions.width,dimensions.height,dimensions.depth);
    if(product.product_model_url){
      const fallback=[...root.children];root.userData.modelStatus='loading';
      custom(product.product_model_url,model=>{root.userData.modelStatus=model?'ready':'error';if(model){if(kind==='cartridge')model.rotation.y=Math.PI;for(const child of fallback)if(!child.isLineSegments)child.visible=false;root.add(model);root.userData.productShape='uploaded';}else onModelError(product);onChange();});
    }
    return {root,labelY:labelY-labelHeight*.40,kind};
  }
  function createBatch(product,dimensions,{across=1,behind=1,selected=false,overflow=false}={}){
    const root=new T.Group(),visual=new T.Group();root.add(visual);
    root.userData.productCopies=across*behind;
    let template,dead=false;
    const translation=new T.Matrix4(),matrix=new T.Matrix4(),partMatrix=new T.Matrix4();
    // Eén prototype per product. Identieke onderdelen delen één GPU-tekenopdracht.
    function rebuild(){
      if(!template||dead)return;
      visual.traverse(o=>{if(o.isInstancedMesh)o.dispose();});visual.clear();
      template.root.updateMatrixWorld(true);
      root.userData.productShape=template.root.userData.productShape;
      root.userData.modelStatus=template.root.userData.modelStatus;
      template.root.traverseVisible(part=>{
        if(!part.geometry)return;
        if(part.isMesh){
          const sourceCount=part.isInstancedMesh?part.count:1;
          const mesh=new T.InstancedMesh(part.geometry,part.material,across*behind*sourceCount);
          mesh.renderOrder=part.renderOrder;let index=0;
          for(let col=0;col<across;col++)for(let row=0;row<behind;row++)for(let source=0;source<sourceCount;source++){
            translation.makeTranslation(col*dimensions.width,0,-row*dimensions.depth);
            matrix.multiplyMatrices(translation,part.matrixWorld);
            if(part.isInstancedMesh){part.getMatrixAt(source,partMatrix);matrix.multiply(partMatrix);}
            mesh.setMatrixAt(index,matrix);
            if(part.morphTargetInfluences)mesh.setMorphAt(index,part);
            index++;
          }
          mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();visual.add(mesh);
        }else{
          // Zeldzame lijn-/puntprimitieven in een GLB behouden hun oorspronkelijke vorm.
          for(let col=0;col<across;col++)for(let row=0;row<behind;row++){
            const copy=part.clone(false);copy.matrixAutoUpdate=false;
            copy.matrix.multiplyMatrices(translation.makeTranslation(col*dimensions.width,0,-row*dimensions.depth),part.matrixWorld);visual.add(copy);
          }
        }
      });
      redraw();
    }
    template=create(product,dimensions,{onChange:rebuild});
    // De afzonderlijke exemplaren blijven herkenbaar; ook hun randen gaan in één batch.
    const edgeBox=new T.BoxGeometry(dimensions.width*1.015,dimensions.height*1.015,dimensions.depth*1.025),edges=new T.EdgesGeometry(edgeBox);
    const points=edges.attributes.position.array,allPoints=new Float32Array(points.length*across*behind);let point=0;
    for(let col=0;col<across;col++)for(let row=0;row<behind;row++)for(let i=0;i<points.length;i+=3){allPoints[point++]=points[i]+col*dimensions.width;allPoints[point++]=points[i+1];allPoints[point++]=points[i+2]-row*dimensions.depth;}
    edgeBox.dispose();edges.dispose();
    const outlineGeometry=new T.BufferGeometry();outlineGeometry.setAttribute('position',new T.BufferAttribute(allPoints,3));
    const outline=new T.LineSegments(outlineGeometry,new T.LineBasicMaterial());root.add(outline);
    function highlight(selected,overflow){outline.visible=selected||overflow;outline.material.color.setHex(selected?0x3675e2:0xc86955);}
    function dispose(){
      if(dead)return;dead=true;
      visual.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
      const geometries=new Set(),materials=new Set();
      template.root.traverse(o=>{if(o.geometry&&!o.geometry.userData.sharedProductModel)geometries.add(o.geometry);for(const m of [].concat(o.material||[]))materials.add(m);});
      for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
      outline.geometry.dispose();outline.material.dispose();root.clear();
    }
    batches.add(dispose);highlight(selected,overflow);rebuild();
    return {root,labelY:template.labelY,kind:template.kind,highlight};
  }
  function reset(){generation++;for(const dispose of batches)dispose();batches.clear();for(const entry of cache.values())entry.listeners=[];}
  return {create,createBatch,reset,dispose(){disposed=true;optimizer.dispose();reset();for(const entry of cache.values()){entry.listeners=[];entry.texture.dispose();}cache.clear();for(const p of models.values())p.then(({source})=>disposeSource(source)).catch(()=>{});models.clear();}};
}
