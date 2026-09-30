import * as T from './vendor/three/three.module.min.js';

// Alleen de lokale weergave wordt vereenvoudigd. GLB-bestanden en buitenmaten blijven intact.
export function createModelOptimizer(){
  let worker=null,serial=0,closed=false;
  const pending=new Map();
  function stop(){worker?.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Modeloptimalisatie gestopt'));}pending.clear();}
  function simplify(payload){
    if(closed)return Promise.reject(Error('Weergave gesloten'));
    if(!worker){
      worker=new Worker(new URL('./product-model-optimize-worker.mjs',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data.indices);};
      worker.onerror=stop;
    }
    return new Promise((resolve,reject)=>{
      const id=++serial,timer=setTimeout(stop,30000);pending.set(id,{resolve,reject,timer});
      worker.postMessage({id,...payload},[payload.indices.buffer,payload.positions.buffer,payload.attributes.buffer]);
    });
  }
  async function optimize(source){
    const geometries=new Set();let total=0;
    source.traverse(o=>{if(o.isMesh&&o.geometry&&!o.isSkinnedMesh&&!Object.keys(o.geometry.morphAttributes).length)geometries.add(o.geometry);});
    for(const g of geometries)total+=(g.index?.count||g.attributes.position.count)/3;
    if(total<=3000)return;
    for(const g of geometries){
      const p=g.attributes.position,count=g.index?.count||p.count;
      if(count<300)continue;
      const positions=new Float32Array(p.count*3);
      for(let i=0;i<p.count;i++){positions[i*3]=p.getX(i);positions[i*3+1]=p.getY(i);positions[i*3+2]=p.getZ(i);}
      const channels=['normal','uv','uv1','color'].filter(k=>g.attributes[k]),weights=[];
      for(const k of channels)for(let i=0;i<g.attributes[k].itemSize;i++)weights.push(k==='normal'?.25:1);
      const stride=weights.length,attributes=new Float32Array(p.count*stride);
      for(let i=0;i<p.count;i++){let offset=i*stride;for(const k of channels){const a=g.attributes[k];for(let c=0;c<a.itemSize;c++)attributes[offset++]=a.getComponent(i,c);}}
      const original=g.index?Uint32Array.from(g.index.array):Uint32Array.from({length:p.count},(_,i)=>i);
      // Materiaalgroepen blijven gescheiden, zodat etiketten niet met kunststof vermengen.
      const groups=g.groups.length?g.groups:[{start:0,count,materialIndex:0}],results=[];
      try{
        for(const group of groups){
          const start=Math.max(group.start,g.drawRange.start),end=Math.min(group.start+group.count,count,g.drawRange.start+g.drawRange.count);
          const indices=original.slice(start,end),target=Math.min(indices.length,Math.max(36,Math.floor(indices.length*(3000/total)/3)*3));
          if(!indices.length){results.push({indices,materialIndex:group.materialIndex});continue;}
          const reduced=await simplify({indices,positions:positions.slice(),attributes:attributes.slice(),stride,weights,target});
          results.push({indices:reduced,materialIndex:group.materialIndex});
        }
        const combined=new Uint32Array(results.reduce((n,r)=>n+r.indices.length,0));let offset=0;
        const hadGroups=g.groups.length>0;g.clearGroups();
        for(const r of results){combined.set(r.indices,offset);if(hadGroups)g.addGroup(offset,r.indices.length,r.materialIndex);offset+=r.indices.length;}
        g.setIndex(new T.BufferAttribute(combined,1));g.setDrawRange(0,Infinity);
        g.userData.originalTriangles=count/3;g.userData.displayTriangles=combined.length/3;
      }catch{ /* Bij een niet-ondersteund model blijft het originele model beschikbaar. */ }
    }
  }
  return {optimize,dispose(){closed=true;stop();}};
}
