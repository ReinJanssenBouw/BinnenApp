/* Desktop-editor. Productlocaties blijven gedeeld met de mobiele vakkenlijst. */
(() => {
  const instances=new WeakMap();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const rackLimits={width:[10,2000],height:[10,1000],depth:[10,500],x:[-5000,5000],z:[-5000,5000],angle:[0,359]};
  const validNumber=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  window.BinnenLocaties3D={mount(el,api){
    if(instances.has(el)){instances.get(el).activate();return;}
    const state={data:null,rackId:null,x:null,y:null,productId:null,dirty:false,busy:false,mode:'3d',query:'',overview:true,message:'Stellingen laden…'};
    let view=null,closed=false,viewError='';
    el.innerHTML=`<section class="l3-root"><header class="l3-header"><div><span class="l3-eyebrow">LOCATIE · MAGAZIJN</span><h1>Je magazijn in 3D</h1></div><div class="l3-head-actions"><button type="button" data-l3="mode">Vakkenlijst</button><button type="button" data-l3="reload">Vernieuwen</button><button type="button" data-l3="save" class="l3-primary" disabled>Model opslaan</button></div></header><p class="l3-status" role="status" aria-live="polite"></p><p class="l3-storage" hidden></p><div class="l3-work"><aside class="l3-racks" aria-label="Stellingen"></aside><div class="l3-stage"><div class="l3-views" aria-label="Camerastand"><button type="button" data-l3="view" data-view="perspective">3D</button><button type="button" data-l3="view" data-view="front">Voorkant</button><button type="button" data-l3="view" data-view="top">Bovenkant</button><button type="button" data-l3="overview">Stelling bekijken</button></div><div class="l3-canvas"></div><div class="l3-stage-caption"><span>Sleep: draaien · Scroll: zoomen · Rechtermuisknop: verschuiven</span><button type="button" data-l3="fit">Alles in beeld</button></div><div class="l3-scale">Ruimte 6630 × 4820 mm · Raster 500 mm</div></div><aside class="l3-inspector" aria-label="Afmetingen en producten"></aside></div><div class="l3-flat" hidden></div></section>`;
    const root=el.querySelector('.l3-root'),$=s=>root.querySelector(s);
    const admin=()=>api.isAdmin();
    const rack=()=>state.data?.racks.find(r=>r.id===state.rackId);
    const product=()=>state.data?.products.find(p=>String(p.id)===String(state.productId));
    const group=()=>{const r=rack();return r?state.data.products.filter(p=>p.rack===r.name&&Number(p.x_axis)===state.x&&Number(p.y_axis)===state.y):[];};
    const field=(label,key,value,min,max,scope='rack',step='0.1')=>`<label>${label}<div class="l3-input-unit"><input type="number" data-dim="${key}" data-scope="${scope}" min="${min}" max="${max}" step="${step}" required value="${esc(value)}" ${!admin()||state.busy?'disabled':''}><span>${key==='angle'?'°':'cm'}</span></div></label>`;
    function normalize(data){
      data=clone(data);data.geometry={version:1,racks:{...data.geometry?.racks},products:{...data.geometry?.products}};
      data.racks.forEach((r,i)=>{r.rows=Number(r.rows);r.rowColumns=Array.from({length:r.rows},(_,y)=>Number(r.rowColumns?.[y]??r.columns));data.geometry.racks[r.id]??={width:200,height:200,depth:60,x:(i%3-1)*210,z:-170+Math.floor(i/3)*100,angle:0};});
      for(const p of data.products)data.geometry.products[p.id]??={width:20,height:25,depth:20};
      const ids=new Set(data.racks.map(r=>r.id));for(const id of Object.keys(data.geometry.racks))if(!ids.has(id))delete data.geometry.racks[id];
      const productIds=new Set(data.products.map(p=>String(p.id)));for(const id of Object.keys(data.geometry.products))if(!productIds.has(id))delete data.geometry.products[id];
      return data;
    }
    function validation(){
      if(!state.data)return 'De indeling is nog niet geladen.';
      const names=new Set();
      for(const r of state.data.racks){
        if(!r.name.trim()||r.name.trim().length>64||names.has(r.name.trim().toLowerCase()))return 'Gebruik een unieke naam voor iedere stelling.';
        names.add(r.name.trim().toLowerCase());
        if(!Number.isInteger(r.rows)||r.rows<1||r.rows>50||r.rowColumns.length!==r.rows||r.rowColumns.some(n=>!Number.isInteger(n)||n<1||n>50))return 'Kies 1 tot 50 rijen en kolommen per rij.';
        if(Object.entries(rackLimits).some(([key,[min,max]])=>!validNumber(state.data.geometry.racks[r.id][key],min,max)))return 'Controleer de stellingmaten en positie. Gebruik de grenzen bij het veld.';
      }
      for(const g of Object.values(state.data.geometry.products))if(['width','height','depth'].some(k=>!validNumber(g[k],.1,500)))return 'Productmaten moeten tussen 0,1 en 500 cm liggen.';
      return '';
    }
    function status(){
      const error=state.dirty?validation():'';
      $('.l3-storage').hidden=!['local','pending'].includes(state.data?.storage);
      $('.l3-storage').textContent=state.data?.storage==='pending'?'Je lokale maten staan klaar om te delen. Klik op Model opslaan.':'3D-maten worden op deze pc bewaard. Stellingen en productlocaties worden met de andere apparaten gedeeld.';
      $('.l3-status').textContent=error||viewError||state.message||(state.dirty?'Niet opgeslagen · sla je model op om deze maten te bewaren.':'Maten in centimeters · controleer de startmaten met je echte stellingen.');
      $('.l3-status').classList.toggle('is-error',!!error);
      $('[data-l3="save"]').disabled=!admin()||state.busy||!state.dirty||!!error;
      $('[data-l3="save"]').textContent=state.busy?'Even wachten…':'Model opslaan';
      $('[data-l3="save"]').hidden=!admin()||state.mode!=='3d';
      $('[data-l3="reload"]').disabled=state.busy;
      $('[data-l3="mode"]').disabled=state.busy;
    }
    function draw(){if(view&&state.data&&!validation())view.update(state.data,state,state.overview);}
    function renderRacks(){
      $('.l3-racks').innerHTML=`<div class="l3-rail-title">Stellingen <span>${state.data?.racks.length||0}</span></div>${(state.data?.racks||[]).map(r=>`<button type="button" class="l3-rack-choice ${state.rackId===r.id?'is-selected':''}" data-l3="rack" data-id="${esc(r.id)}" aria-pressed="${state.rackId===r.id}" ${state.busy?'disabled':''}><span class="l3-rack-symbol">▥</span><span><strong>${esc(r.name)}</strong><small>${r.rows} rijen · ${state.data.products.filter(p=>p.rack===r.name).length} producten</small></span></button>`).join('')}${admin()?`<button type="button" data-l3="add" class="l3-add" ${!state.data||state.busy?'disabled':''}>＋ Nieuwe stelling</button>`:''}<p class="l3-rail-note">Klik op een vak in het model om producten toe te voegen.</p>`;
    }
    function warnings(){
      const r=rack();if(!r||!state.x||!state.y)return '';
      const g=state.data.geometry.racks[r.id],items=group(),cw=(g.width-8)/r.rowColumns[state.y-1],ch=g.height/r.rows-4;
      const tooWide=items.reduce((sum,p)=>sum+state.data.geometry.products[p.id].width+2,0)>cw-2;
      const tall=items.some(p=>state.data.geometry.products[p.id].height>ch),deep=items.some(p=>state.data.geometry.products[p.id].depth>g.depth-4);
      return tooWide||tall||deep?`<p class="l3-warning">Past nog niet: ${[tooWide?'producten samen te breed':'',tall?'product te hoog':'',deep?'product te diep':''].filter(Boolean).join(', ')}. Pas de maten aan of kies een ander vak.</p>`:'';
    }
    function choices(){
      const r=rack();if(!r)return '';
      const q=state.query.toLowerCase().trim();
      return state.data.products.filter(p=>!(p.rack===r.name&&Number(p.x_axis)===state.x&&Number(p.y_axis)===state.y)&&`${p.jb_code} ${p.description}`.toLowerCase().includes(q)).map(p=>`<button type="button" class="l3-product-choice" data-l3="assign" data-id="${p.id}" ${state.busy?'disabled':''}><span><strong>${esc(p.jb_code)}</strong> ${esc(p.description)}${p.rack?`<small>Nu: ${esc(p.rack)} · X${esc(p.x_axis)} / Y${esc(p.y_axis)}</small>`:''}</span><b>${p.rack?'Verplaatsen':'＋'}</b></button>`).join('')||'<p class="l3-muted">Geen producten gevonden.</p>';
    }
    function roomWarning(g){
      const a=g.angle*Math.PI/180,extentX=(Math.abs(Math.cos(a))*g.width+Math.abs(Math.sin(a))*g.depth)/2,extentZ=(Math.abs(Math.sin(a))*g.width+Math.abs(Math.cos(a))*g.depth)/2;
      return Math.abs(g.x)+extentX>331.5+.001||Math.abs(g.z)+extentZ>241+.001?'<p class="l3-warning l3-room-warning">Deze stelling steekt buiten de ruimte van 6630 × 4820 mm. Pas de positie of maten aan.</p>':'';
    }
    function inspector(){
      const r=rack();if(!r){$('.l3-inspector').innerHTML='<div class="l3-empty"><h2>Begin met een stelling</h2><p>Maak links een stelling. Stel daarna de afmetingen in en kies een vak voor je producten.</p></div>';return;}
      const g=state.data.geometry.racks[r.id],p=product(),pg=p&&state.data.geometry.products[p.id];
      $('.l3-inspector').innerHTML=`<div class="l3-inspector-title"><span class="l3-eyebrow">${p?'PRODUCT':'STELLING'}</span><h2>${esc(p?p.jb_code:r.name)}</h2>${p?`<p>${esc(p.description)}</p><button type="button" data-l3="rack-settings">← Stellingmaten</button>`:''}</div>
      ${roomWarning(g)}${p?`<div class="l3-fields">${field('Breedte','width',pg.width,.1,500,'product')}${field('Hoogte','height',pg.height,.1,500,'product')}${field('Diepte','depth',pg.depth,.1,500,'product')}</div><p class="l3-muted">Maten van het product of de verpakking die je in dit vak neerzet. Eén blok per product, onafhankelijk van de voorraad.</p>`:`
      <label class="l3-name">Naam<input data-rack-field="name" maxlength="64" value="${esc(r.name)}" ${!admin()||state.busy?'disabled':''}></label>
      <div class="l3-fields">${field('Breedte','width',g.width,10,2000)}${field('Hoogte','height',g.height,10,1000)}${field('Diepte','depth',g.depth,10,500)}</div>
      <details class="l3-section"><summary>Positie in het magazijn</summary><div class="l3-fields">${field('Links / rechts','x',g.x,-5000,5000)}${field('Voor / achter','z',g.z,-5000,5000)}${field('Draaien','angle',g.angle,0,359,'rack','1')}</div><p class="l3-muted">Positie van het midden van de stelling, gemeten vanaf het midden van de ruimte.</p></details>
      <details class="l3-section"><summary>Rijen en productkolommen</summary><label>Aantal rijen<input data-rack-field="rows" type="number" min="1" max="50" step="1" required value="${r.rows}" ${!admin()||state.busy?'disabled':''}></label><div class="l3-row-fields">${r.rowColumns.map((c,i)=>`<label>Rij Y${i+1}<input aria-label="Kolommen rij ${i+1}" data-row="${i}" type="number" min="1" max="50" required step="1" value="${c}" ${!admin()||state.busy?'disabled':''}></label>`).join('')}</div><p class="l3-muted">Rijen zijn even hoog. Kolommen verdelen de beschikbare breedte per rij.</p></details>`}
      <section class="l3-section l3-cell-section"><h3>Producten in een vak</h3><div class="l3-cell-select"><label>Rij (Y)<select data-select="y" ${state.busy?'disabled':''}><option value="">Kies rij</option>${Array.from({length:r.rows},(_,i)=>`<option value="${i+1}" ${state.y===i+1?'selected':''}>Y${i+1}</option>`).join('')}</select></label><label>Kolom (X)<select data-select="x" ${!state.y||state.busy?'disabled':''}><option value="">Kies vak</option>${Array.from({length:state.y?r.rowColumns[state.y-1]||0:0},(_,i)=>`<option value="${i+1}" ${state.x===i+1?'selected':''}>X${i+1}</option>`).join('')}</select></label></div>
      ${state.x&&state.y?`<p class="l3-cell-address">${esc(r.name)} / Y${state.y} / X${state.x}</p>${warnings()}<div class="l3-assigned">${group().map(item=>`<div class="l3-assigned-row ${String(item.id)===String(state.productId)?'is-selected':''}"><button type="button" data-l3="product" data-id="${item.id}"><strong>${esc(item.jb_code)}</strong><span>${esc(item.description)}</span><small>${Object.values({w:state.data.geometry.products[item.id].width,h:state.data.geometry.products[item.id].height,d:state.data.geometry.products[item.id].depth}).join(' × ')} cm</small></button>${admin()?`<button type="button" data-l3="unassign" data-id="${item.id}" aria-label="${esc(item.jb_code)} uit dit vak halen" ${state.busy?'disabled':''}>×</button>`:''}</div>`).join('')||'<p class="l3-muted">Dit vak is nog leeg.</p>'}</div>${admin()?`<label class="l3-search-label">Product toevoegen<input type="search" class="l3-search" placeholder="Naam of JB-code" value="${esc(state.query)}" ${state.busy?'disabled':''}></label><div class="l3-search-results">${choices()}</div>`:''}`:'<p class="l3-muted">Klik op een vak in het model of kies hierboven een rij en kolom.</p>'}</section>
      ${admin()&&!p?`<button type="button" data-l3="remove" class="l3-remove" ${state.busy?'disabled':''}>Stelling verwijderen</button>`:''}`;
    }
    function render(){renderRacks();inspector();status();draw();}
    function adopt(data){
      state.data=normalize(data);if(!state.data.racks.some(r=>r.id===state.rackId)){state.rackId=state.data.racks[0]?.id||null;state.x=null;state.y=null;state.productId=null;}
      const r=rack();if(r&&(state.y>r.rows||state.x>(r.rowColumns[state.y-1]||0))){state.x=null;state.y=null;state.productId=null;}
    }
    async function load(){
      state.busy=true;state.message='Stellingen laden…';status();
      try{adopt(await api.loadScene());state.dirty=state.data.storage==='pending';state.message='';render();view?.fit();}
      catch(error){state.message=error.message||'Laden mislukt. Klik op Vernieuwen om opnieuw te proberen.';}
      finally{state.busy=false;render();}
    }
    function select(hit){
      if(state.busy)return;const different=state.rackId!==hit.rackId;
      state.rackId=hit.rackId;state.x=hit.x||null;state.y=hit.y||null;state.productId=hit.productId||null;state.query='';render();if(different&&!state.overview)view?.fit();
    }
    function dirty(){state.dirty=true;state.message='';status();draw();}
    root.addEventListener('input',e=>{
      if(e.target.matches('.l3-search')){state.query=e.target.value;$('.l3-search-results').innerHTML=choices();return;}
      if(!admin()||state.busy||!rack())return;
      if(e.target.dataset.dim){const target=e.target.dataset.scope==='product'?state.data.geometry.products[state.productId]:state.data.geometry.racks[state.rackId];if(target){target[e.target.dataset.dim]=e.target.value===''?NaN:Number(e.target.value);dirty();}}
      if(e.target.dataset.rackField==='name'){
        const oldName=rack().name;rack().name=e.target.value;for(const p of state.data.products)if(p.rack===oldName)p.rack=rack().name;dirty();renderRacks();
      }
    });
    root.addEventListener('change',e=>{
      if(state.busy||!rack())return;
      if(e.target.dataset.select){
        if(e.target.dataset.select==='y'){state.y=Number(e.target.value)||null;state.x=null;}else state.x=Number(e.target.value)||null;
        state.productId=null;render();return;
      }
      if(!admin())return;
      if(e.target.dataset.rackField==='rows'){
        const count=Number(e.target.value);if(!Number.isInteger(count)||count<1||count>50){e.target.value=rack().rows;state.message='Kies 1 tot 50 rijen.';status();return;}
        rack().rows=count;rack().rowColumns=Array.from({length:count},(_,i)=>rack().rowColumns[i]||rack().columns||1);state.x=null;state.y=null;state.productId=null;dirty();render();
      }else if(e.target.dataset.row!==undefined){const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>50){e.target.value=rack().rowColumns[Number(e.target.dataset.row)];state.message='Kies 1 tot 50 kolommen.';status();return;}rack().rowColumns[Number(e.target.dataset.row)]=n;state.x=null;state.y=null;state.productId=null;dirty();render();}
      else if(e.target.dataset.dim){if(!validation()){const scroll=$('.l3-inspector').scrollTop;inspector();$('.l3-inspector').scrollTop=scroll;}}
    });
    root.addEventListener('click',async e=>{
      const b=e.target.closest('[data-l3]');if(!b||b.disabled||state.busy)return;
      const action=b.dataset.l3;
      if(action==='view'){view?.fit(b.dataset.view);return;}
      if(action==='fit'){view?.fit();return;}
      if(action==='overview'){state.overview=!state.overview;b.textContent=state.overview?'Stelling bekijken':'Ruimte bekijken';draw();view?.fit();return;}
      if(action==='rack'){select({rackId:b.dataset.id});return;}
      if(action==='product'){state.productId=Number(b.dataset.id);inspector();draw();return;}
      if(action==='rack-settings'){state.productId=null;inspector();draw();return;}
      if(action==='reload'&&state.mode==='flat'){state.message='Gebruik Vernieuwen in de vakkenlijst hieronder.';status();return;}
      if(action==='reload'){if(state.dirty&&!confirm('Onopgeslagen maten weggooien en opnieuw laden?'))return;await load();return;}
      if(action==='mode'){
        if(state.mode==='flat'&&$('.l3-flat .loc-actions')?.offsetHeight&&!confirm('Terug naar de 3D-editor? Sla wijzigingen in de vakkenlijst eerst op.'))return;
        if(state.dirty&&!confirm('Onopgeslagen maten weggooien en naar de vakkenlijst gaan?'))return;
        state.mode=state.mode==='3d'?'flat':'3d';$('.l3-work').hidden=state.mode!=='3d';$('.l3-flat').hidden=state.mode==='3d';b.textContent=state.mode==='3d'?'Vakkenlijst':'3D-editor';
        if(state.mode==='flat'){state.dirty=false;const child=document.createElement('div');$('.l3-flat').replaceChildren(child);window.BinnenLocaties.mount(child,{...api,isActive:()=>api.isActive()&&state.mode==='flat'});status();}else await load();return;
      }
      if(!admin()||!state.data)return;
      if(action==='add'){
        if(state.data.racks.length>=100){state.message='Maximaal 100 stellingen.';status();return;}
        let n=1;while(state.data.racks.some(r=>r.name.toLowerCase()===`stelling ${n}`))n++;
        const id=crypto.randomUUID();state.data.racks.push({id,name:`Stelling ${n}`,rows:3,columns:3,rowColumns:[3,3,3]});state.data.geometry.racks[id]={width:200,height:200,depth:60,x:((state.data.racks.length-1)%3-1)*210,z:-170+Math.floor((state.data.racks.length-1)/3)*100,angle:0};state.rackId=id;state.x=null;state.y=null;state.productId=null;dirty();render();view?.fit();return;
      }
      if(action==='remove'){
        if(state.data.products.some(p=>p.rack===rack().name)){state.message='Verplaats of ontkoppel eerst alle producten uit deze stelling.';status();return;}
        if(!confirm(`Stelling “${rack().name}” verwijderen? Sla daarna het model op.`))return;
        state.data.racks=state.data.racks.filter(r=>r.id!==state.rackId);delete state.data.geometry.racks[state.rackId];state.rackId=state.data.racks[0]?.id||null;state.x=null;state.y=null;state.productId=null;dirty();render();view?.fit();return;
      }
      if(action==='save'){
        const error=validation();if(error){state.message=error;status();return;}
        state.busy=true;state.message='Model opslaan…';render();
        try{const d=await api.saveScene({racks:state.data.racks.map(r=>({...r,name:r.name.trim(),columns:r.rowColumns[0]})),geometry:state.data.geometry,revision:state.data.revision,sceneRevision:state.data.sceneRevision,localRevision:state.data.localRevision});adopt(d);state.dirty=false;state.message=state.data.storage==='local'?'Model opgeslagen op deze pc.':'Model opgeslagen. Deze maten blijven bewaard.';}
        catch(error){state.message=error.message||'Opslaan mislukt. Je wijzigingen staan nog in dit scherm.';}
        finally{state.busy=false;render();}return;
      }
      if(action==='assign'||action==='unassign'){
        if(state.dirty){state.message='Sla eerst het model op. Daarna kun je producten toevoegen of verplaatsen.';status();return;}
        if(!state.x||!state.y)return;
        const p=state.data.products.find(p=>String(p.id)===b.dataset.id);if(!p)return;
        state.busy=true;state.message='Productlocatie opslaan…';render();
        try{await api.assign({p_product_id:p.id,p_rack_id:action==='assign'?state.rackId:null,p_x:state.x,p_y:state.y,p_revision:state.data.revision,p_expected_updated_at:p.updated_at});if(action==='unassign')state.productId=null;else state.productId=p.id;adopt(await api.loadScene());state.message='Productlocatie opgeslagen.';}
        catch(error){state.message=error.message||'Productlocatie opslaan mislukt. Vernieuw en probeer opnieuw.';}
        finally{state.busy=false;render();}return;
      }
    });
    $('.l3-canvas').addEventListener('view-error',e=>{viewError=e.detail;status();});
    const beforeUnload=e=>{if(state.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
    instances.set(el,{activate(){if(state.mode==='3d'&&!state.dirty&&!state.busy)void load();else render();}});
    render();
    import('./locaties-3d-view.mjs').then(({createLocationView})=>{if(closed)return;view=createLocationView($('.l3-canvas'),select);draw();view.fit();}).catch(()=>{viewError='3D kan niet starten op deze pc. Gebruik de vakkenlijst; je gegevens blijven beschikbaar.';status();});
    void load();
    window.addEventListener('pagehide',()=>{closed=true;view?.dispose();window.removeEventListener('beforeunload',beforeUnload);},{once:true});
  }};
})();
