(()=>{
 let dialog=null;
 window.BinnenProductModel={async open(productId,title,onSaved){
  if(!productId)throw Error('Sla het artikel eerst op.');
  if(dialog?.open)return;
  const modal=document.createElement('dialog');dialog=modal;modal.className='pm-dialog';
  modal.innerHTML='<form><header><div><small>PRODUCTMODEL</small><h2></h2></div><button type="button" data-close aria-label="Sluiten">×</button></header><p>Upload een GLB met ingesloten afbeeldingen (maximaal 20 MB). Het model wordt op onderstaande buitenmaten in de stelling gezet.</p><label>3D-bestand<input type="file" accept=".glb,model/gltf-binary" data-file></label><p data-current></p><div class="pm-dimensions">'+['Breedte','Hoogte','Diepte'].map((label,i)=>'<label>'+label+' (cm)<input type="number" data-dim="'+['width','height','depth'][i]+'" min="0.1" max="500" step="0.1" required></label>').join('')+'</div><div class="pm-dimensions pm-counts"><label>Naast elkaar<input data-dim="across" type="number" min="1" max="50" step="1" required></label><label>Achter elkaar<input data-dim="behind" type="number" min="1" max="50" step="1" required></label></div><p data-capacity></p><p data-limit></p><p data-fit role="status"></p><p data-status role="status" aria-live="polite">Gegevens laden…</p><footer><button type="button" data-close>Sluiten</button><button type="submit" data-save disabled>Model en maten opslaan</button></footer></form>';
  document.body.append(modal);modal.querySelector('h2').textContent=title||'3D-model';modal.showModal();
  modal.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();modal.querySelector('form').requestSubmit();}});
  const q=s=>modal.querySelector(s);let busy=false,record=null;
  const close=()=>{if(busy)return;modal.close();modal.remove();};
  modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  modal.addEventListener('cancel',e=>{e.preventDefault();close();});
  const status=msg=>q('[data-status]').textContent=msg;
  const capacity=()=>{const a=Number(q('[data-dim="across"]').value),b=Number(q('[data-dim="behind"]').value);q('[data-capacity]').textContent=Number.isInteger(a)&&a>0&&Number.isInteger(b)&&b>0?a+' naast elkaar × '+b+' achter elkaar = '+(a*b)+' plaatsen. Dit verandert de voorraad niet.':'';const wide=record&&a*Number(q('[data-dim="width"]').value)>record.widthLimit,deep=record?.depthLimit!=null&&b*Number(q('[data-dim="depth"]').value)>record.depthLimit;q('[data-fit]').textContent=wide||deep?'Past nog niet: '+[wide?'samen te breed':'',deep?'achter elkaar te diep':''].filter(Boolean).join(', ')+'. Pas de aantallen of maten aan.':'';};
  modal.addEventListener('input',capacity);
  const lock=v=>{busy=v;modal.querySelectorAll('button,input').forEach(e=>e.disabled=v);};
  try{record=await window.binnenApp.supabaseRequest('getProductModel',{productId});if(!modal.open)return;
   for(const key of ['width','height','depth','across','behind'])q('[data-dim="'+key+'"]').value=record.dimensions[key]??1;
   q('[data-dim="width"]').max=record.widthLimit;
   q('[data-current]').textContent=record.name?'Huidig model: '+record.name:'Nog geen eigen model; momenteel wordt de standaardvorm gebruikt.';
   q('[data-limit]').textContent=record.widthLimit<500?'Maximale breedte in het huidige vak: '+record.widthLimit+' cm.':'';
   capacity();q('[data-save]').disabled=false;status('Maten kunnen ook zonder nieuw bestand worden opgeslagen.');
  }catch(e){status(e.message);}
  q('form').onsubmit=async e=>{
   e.preventDefault();if(busy||!record)return;
   const file=q('[data-file]').files[0],dimensions=Object.fromEntries(['width','height','depth','across','behind'].map(k=>[k,Number(q('[data-dim="'+k+'"]').value)]));
   if(file&&(!/\.glb$/i.test(file.name)||file.size>20*1024*1024)){status('Kies een GLB-bestand van maximaal 20 MB.');return;}
   if(dimensions.across*dimensions.behind>250){status('Maximaal 250 plaatsen per product.');return;}
   lock(true);status('Model en maten opslaan…');
   try{
    const payload={productId,dimensions,sceneRevision:record.sceneRevision};
    if(file){payload.bytes=new Uint8Array(await file.arrayBuffer());payload.name=file.name;}
    record=await window.binnenApp.supabaseRequest('saveProductModel',payload);
    q('[data-current]').textContent=record.name?'Huidig model: '+record.name:'Standaardvorm met jouw afmetingen.';q('[data-file]').value='';
    status('Model en maten opgeslagen voor iedereen.');onSaved?.();
   }catch(error){status(error.message||'Opslaan mislukt.');}finally{lock(false);}
  };
 }};
})();
