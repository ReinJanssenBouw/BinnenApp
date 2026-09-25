(() => {
  const instances = new WeakMap();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.BinnenLocaties = { mount(el, api) {
    const existing = instances.get(el);
    if (existing) { if (!el.querySelector('[data-loc-root]')) existing.render(); return; }
    const state = {racks:[],revision:0,loaded:false,busy:false,dirty:false,message:'Indeling laden…',preview:null,products:[],selected:null,editing:false,query:''};
    const admin = () => api.isAdmin();
    const rackIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 3v18M20 3v18M4 10h16M4 19h16M8 5h4v5H8zM14 13h4v6h-4zM7 14h4v5H7z"/></svg>';
    function render() {
      if (!api.isActive()) return;
      if(!state.racks.some(r=>r.id===state.preview))state.preview=state.racks[0]?.id||null;
      const r=state.racks.find(r=>r.id===state.preview),i=state.racks.indexOf(r);
      const total=r?Array.from({length:Math.min(50,Math.max(0,Number(r.rows)||0))},(_,y)=>Number(r.rowColumns?.[y]??r.columns??1)).reduce((a,b)=>a+b,0):0;
      const placed=r?state.products.filter(p=>p.rack===r.name):[];
      const occupied=new Set(placed.map(p=>`${p.x_axis}:${p.y_axis}`)).size;
      el.innerHTML = `<section class="loc-panel" data-loc-root>
        <header class="loc-heading"><div><span class="loc-eyebrow">MAGAZIJN</span><h1>Alles op z’n plek.</h1><p>Kies een stelling en geef je producten een vaste locatie.</p></div><button type="button" data-action="reload" class="loc-refresh" ${state.busy?'disabled':''} aria-label="Locaties opnieuw laden">↻ <span>Vernieuwen</span></button></header>
        <nav class="loc-rack-nav" aria-label="Stellingen">${state.racks.map((rack,index)=>`<button type="button" data-action="select-rack" data-rack="${index}" class="loc-rack-tab ${rack.id===state.preview?'is-active':''}" aria-pressed="${rack.id===state.preview}">${rackIcon}<span>${esc(rack.name)}</span></button>`).join('')}${admin()?`<button type="button" data-action="add" class="loc-add" ${!state.loaded||state.busy?'disabled':''}>＋ Stelling</button>`:''}</nav>
        <div class="loc-message" role="status">${esc(state.message)}</div>
        <div class="loc-workspace ${state.selected?'has-selection':''}"><div class="loc-racks">${r?`<section class="loc-rack" data-rack="${i}">
          <header class="loc-rack-heading"><div><span class="loc-eyebrow">STELLING</span><h2>${esc(r.name)}</h2><p>${occupied} van ${total} vakken gevuld <span>·</span> ${placed.length} producten</p></div>${admin()?`<button type="button" data-action="configure" aria-expanded="${state.editing}">${state.editing?'Instellingen sluiten':'Indeling aanpassen'}</button>`:''}</header>
          <div class="loc-settings" ${state.editing?'':'hidden'}><div class="loc-fields"><label>Naam stelling<input data-field="name" value="${esc(r.name)}" maxlength="64" ${!admin()||state.busy?'disabled':''}></label><label>Aantal rijen (Y)<input data-field="rows" value="${esc(r.rows)}" type="number" inputmode="numeric" min="1" max="50" step="1" ${!admin()||state.busy?'disabled':''}></label></div>
          <p class="loc-settings-caption">Productkolommen per rij</p><div class="loc-row-columns">${Array.from({length:Math.min(50,Math.max(0,Number(r.rows)||0))},(_,y)=>`<label><span>Rij Y${y+1}</span><input aria-label="Productkolommen rij Y${y+1}" data-field="rowColumns" data-y="${y}" value="${esc(r.rowColumns?.[y]??r.columns??1)}" type="number" inputmode="numeric" min="1" max="50" step="1" ${!admin()||state.busy?'disabled':''}></label>`).join('')}</div><div class="loc-row-actions"><button type="button" data-action="preview">Voorbeeld bijwerken</button><button type="button" data-action="remove" class="loc-remove" ${state.busy?'disabled':''}>Stelling verwijderen</button></div></div>
          <div class="loc-map-heading"><span>VOORAANZICHT</span><div><i></i> Gevuld <i class="loc-dot-empty"></i> Leeg</div></div>${preview(r)}
          <footer class="loc-map-footer">Klik op een vak om producten te bekijken of toe te voegen.<span>Y ↑ &nbsp; X →</span></footer>
        </section>`:state.loaded?`<div class="loc-empty">${rackIcon}<h2>Begin met een stelling</h2><p>Voeg een stelling toe en bepaal hoeveel rijen en vakken je nodig hebt.</p></div>`:'<div class="loc-empty">Stellingen laden…</div>'}</div>${picker()}</div>
        <div class="loc-actions" ${state.dirty?'':'hidden'}><span>Je indeling is nog niet opgeslagen.</span>${admin()?`<button type="button" class="loc-primary" data-action="save" ${!state.loaded||state.busy||!state.dirty?'disabled':''}>${state.busy?'Opslaan…':'Indeling opslaan'}</button>`:''}</div>
      </section>`;
    }
    function validRack(r) {
      return r.name.trim().length>0 && r.name.trim().length<=64 && Number.isInteger(Number(r.rows)) && Number(r.rows)>=1 && Number(r.rows)<=50 && Array.from({length:Number(r.rows)},(_,y)=>Number(r.rowColumns?.[y] ?? r.columns ?? 1)).every(n=>Number.isInteger(n)&&n>=1&&n<=50);
    }
    function preview(r) {
      if (!validRack(r)) return '<p>Vul een naam en 1 tot 50 rijen en kolommen in.</p>';
      let rows='';
      for(let y=Number(r.rows);y>=1;y--){
        const columns=Number(r.rowColumns?.[y-1] ?? r.columns ?? 1);
        let cells='';for(let x=1;x<=columns;x++){
          const products=state.products.filter(p=>p.rack===r.name&&Number(p.x_axis)===x&&Number(p.y_axis)===y);
          const selected=state.selected?.id===r.id&&state.selected.x===x&&state.selected.y===y;
          cells+=`<button type="button" class="loc-cell ${products.length?'is-filled':''} ${selected?'is-selected':''}" data-action="cell" data-x="${x}" data-y="${y}" aria-label="${esc(r.name)}, rij Y${y}, kolom X${x}, ${products.length} producten" aria-pressed="${selected}" ${state.busy?'disabled':''}><span class="loc-cell-coordinate">X${x}<i>${selected?'✓':products.length?'●':''}</i></span>${products.length?`<strong>${esc(products[0].jb_code||'Product')}</strong><span class="loc-cell-name">${esc(products[0].description)}</span>${products.length>1?`<small>+ ${products.length-1} meer</small>`:''}`:`<span class="loc-cell-plus">＋</span><span class="loc-cell-empty">Leeg vak</span>`}</button>`;
        }
        rows+=`<div class="loc-shelf"><span class="loc-row-label">Y${y}</span><div class="loc-grid" style="grid-template-columns:repeat(${columns},minmax(138px,1fr))">${cells}</div></div>`;
      }
      return `<div class="loc-grid-scroll" tabindex="0" aria-label="Stellingvakken, horizontaal scrollbaar">${rows}</div>`;
    }
    function picker() {
      const c=state.selected;if(!c)return '';
      const rack=state.racks.find(r=>r.id===c.id);if(!rack)return '';
      const assigned=state.products.filter(p=>p.rack===rack.name&&Number(p.x_axis)===c.x&&Number(p.y_axis)===c.y);
      return `<section class="loc-picker" aria-label="Geselecteerd vak"><header class="loc-picker-heading"><div><span class="loc-eyebrow">${esc(rack.name)}</span><h2>Vak X${c.x} <span>/</span> Y${c.y}</h2></div><button type="button" data-action="close-cell" aria-label="Vak sluiten">✕</button></header><h3>In dit vak <span>${assigned.length}</span></h3>
        <div>${assigned.length?assigned.map(p=>`<div class="loc-product"><span><strong>${esc(p.jb_code)}</strong> ${esc(p.description)}</span>${admin()?`<button type="button" data-action="unassign" data-product="${p.id}" ${state.busy?'disabled':''}>Loskoppelen</button>`:''}</div>`).join(''):'<p class="loc-vacant">Dit vak is vrij.<br><span>Kies hieronder een product om het in te delen.</span></p>'}</div>
        ${admin()?`<label class="loc-search-label">Product toevoegen<input class="loc-search" type="search" placeholder="Zoek op naam of JB-code…" value="${esc(state.query)}" aria-label="Product zoeken"></label><div class="loc-results">${choices(state.query)}</div>`:''}</section>`;
    }
    function choices(query) {
      const c=state.selected,rack=state.racks.find(r=>r.id===c.id);
      return state.products.filter(p=>!(p.rack===rack.name&&Number(p.x_axis)===c.x&&Number(p.y_axis)===c.y)&&`${p.jb_code} ${p.description}`.toLowerCase().includes(query.toLowerCase())).map(p=>`<div class="loc-product"><span><strong>${esc(p.jb_code)}</strong> ${esc(p.description)}${p.rack?`<small>Nu: ${esc(p.rack)} · X${esc(p.x_axis)} · Y${esc(p.y_axis)}</small>`:''}</span><button type="button" data-action="assign" data-product="${p.id}" ${state.busy?'disabled':''}>${p.rack?'Verplaatsen':'Toevoegen'}</button></div>`).join('')||'<p>Geen producten gevonden.</p>';
    }
    async function load() {
      state.busy=true;state.message='Indeling laden…';render();
      try {const d=await api.load();state.racks=d.racks;state.products=d.products||[];state.revision=d.revision;state.selected=null;state.loaded=true;state.dirty=false;state.message='';}
      catch(e){state.message=e.message||'Laden mislukt. Probeer opnieuw.';}
      finally{state.busy=false;render();}
    }
    el.addEventListener('input',e=>{
      if(e.target.matches('.loc-search')){state.query=e.target.value;el.querySelector('.loc-results').innerHTML=choices(state.query);return;}
      const field=e.target.dataset.field, row=e.target.closest('[data-rack]');
      if(!['name','rows','rowColumns'].includes(field)||!row||!admin()||state.busy)return;
      const rack=state.racks[Number(row.dataset.rack)];
      if(field==='rowColumns'){
        if(!rack.rowColumns)rack.rowColumns=Array.from({length:Number(rack.rows)},()=>rack.columns ?? 1);
        rack.rowColumns[Number(e.target.dataset.y)]=e.target.value;
      }else rack[field]=e.target.value;
      state.dirty=true;state.message='Onopgeslagen wijzigingen';
      el.querySelector('[data-action="save"]').disabled=false;el.querySelector('.loc-actions').hidden=false;
      el.querySelector('.loc-message').textContent=state.message;
    });
    el.addEventListener('change',e=>{
      if(e.target.dataset.field==='rows'&&e.target.closest('[data-rack]')&&admin()&&!state.busy)render();
    });
    el.addEventListener('click',async e=>{
      const button=e.target.closest('[data-action]');if(!button||!button.closest('[data-loc-root]')||button.disabled||state.busy)return;
      const action=button.dataset.action, index=Number(button.closest('[data-rack]')?.dataset.rack);
      if(action==='configure'){state.editing=!state.editing;render();return;}
      if(action==='select-rack'){state.preview=state.racks[index].id;state.selected=null;state.query='';render();return;}
      if(action==='close-cell'){state.selected=null;render();return;}
      if(action==='cell'){
        if(state.dirty){state.message='Sla eerst de gewijzigde indeling op om producten toe te voegen.';render();return;}
        state.query='';state.selected={id:state.racks[index].id,x:Number(button.dataset.x),y:Number(button.dataset.y)};render();
        el.querySelector('.loc-picker')?.scrollIntoView({block:'nearest'});el.querySelector('.loc-search')?.focus({preventScroll:true});return;
      }
      if(action==='assign'||action==='unassign'){
        if(!admin()||state.dirty||!state.selected)return;
        const product=state.products.find(p=>String(p.id)===button.dataset.product);if(!product)return;
        const c=state.selected;state.busy=true;state.message='Productlocatie opslaan…';render();
        try{
          const d=await api.assign({p_product_id:product.id,p_rack_id:action==='assign'?c.id:null,p_x:c.x,p_y:c.y,p_revision:state.revision,p_expected_updated_at:product.updated_at});
          state.racks=d.racks;state.products=d.products;state.revision=d.revision;state.message='Productlocatie opgeslagen.';
        }catch(error){state.message=error.message||'Opslaan mislukt. Probeer opnieuw.';}
        finally{state.busy=false;render();}return;
      }
      if(action==='reload'){if(state.dirty&&!confirm('Onopgeslagen wijzigingen weggooien en de actuele indeling laden?'))return;await load();return;}
      if(action==='preview'){state.preview=state.racks[index].id;render();return;}
      if(!admin()||!state.loaded)return;
      if(action==='add'){
        if(state.racks.length>=100){state.message='Maximaal 100 stellingen.';render();return;}
        let n=1;while(state.racks.some(r=>r.name.toLowerCase()===`stelling ${n}`))n++;
        state.editing=true;state.selected=null;state.preview=crypto.randomUUID();state.racks.push({id:state.preview,name:`Stelling ${n}`,rows:1,columns:1,rowColumns:[1]});state.dirty=true;state.message='Onopgeslagen wijzigingen';render();
        el.querySelector('.loc-rack:last-child input')?.focus();
      }else if(action==='remove'){
        if(!confirm(`Stelling “${state.racks[index].name}” uit de indeling verwijderen?`))return;
        state.racks.splice(index,1);state.dirty=true;state.message='Onopgeslagen wijzigingen';render();
      }else if(action==='save'){
        const names=state.racks.map(r=>r.name.trim().toLowerCase());
        if(state.racks.some(r=>!validRack(r))||new Set(names).size!==names.length){state.message='Gebruik unieke stellingnamen en hele aantallen van 1 tot 50 voor rijen en kolommen.';render();return;}
        state.busy=true;state.message='Indeling opslaan…';render();
        try{const d=await api.save(state.racks.map(r=>({...r,name:r.name.trim(),rows:Number(r.rows),columns:Number(r.rowColumns?.[0] ?? r.columns ?? 1),rowColumns:Array.from({length:Number(r.rows)},(_,y)=>Number(r.rowColumns?.[y] ?? r.columns ?? 1))})),state.revision);state.racks=d.racks;state.revision=d.revision;state.dirty=false;state.editing=false;state.selected=null;const fresh=await api.load();state.products=fresh.products||[];state.message='Indeling opgeslagen.';}
        catch(error){state.message=error.message||'Opslaan mislukt. Je wijzigingen zijn bewaard in dit scherm.';}
        finally{state.busy=false;render();}
      }
    });
    instances.set(el,{render});void load();
  }};
})();
