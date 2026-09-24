(() => {
  const instances = new WeakMap();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.BinnenLocaties = { mount(el, api) {
    const existing = instances.get(el);
    if (existing) { if (!el.querySelector('[data-loc-root]')) existing.render(); return; }
    const state = {racks:[],revision:0,loaded:false,busy:false,dirty:false,message:'Indeling laden…',preview:null};
    const admin = () => api.isAdmin();
    function render() {
      if (!api.isActive()) return;
      el.innerHTML = `<section class="loc-panel" data-loc-root>
        <div class="loc-heading"><div><h1>Locatie</h1><p>Stel per stelling de rijen (Y) in en kies per rij het aantal productkolommen (X).</p></div></div>
        <div class="loc-message" role="status">${esc(state.message)}</div>
        <div class="loc-racks">${state.racks.map((r,i)=>`<section class="loc-rack" data-rack="${i}">
          <div class="loc-fields"><label>Stelling<input data-field="name" value="${esc(r.name)}" maxlength="64" ${!admin()||state.busy?'disabled':''}></label>
          <label>Rijen (Y)<input data-field="rows" value="${esc(r.rows)}" type="number" inputmode="numeric" min="1" max="50" step="1" ${!admin()||state.busy?'disabled':''}></label>
          </div><div class="loc-row-columns">${Array.from({length:Math.min(50,Math.max(0,Number(r.rows)||0))},(_,y)=>`<label>Rij Y${y+1} · productkolommen (X)<input data-field="rowColumns" data-y="${y}" value="${esc(r.rowColumns?.[y] ?? r.columns ?? 1)}" type="number" inputmode="numeric" min="1" max="50" step="1" ${!admin()||state.busy?'disabled':''}></label>`).join('')}</div>
          <div class="loc-row-actions"><button type="button" data-action="preview" ${state.busy?'disabled':''}>Indeling bekijken</button>${admin()?`<button type="button" data-action="remove" class="loc-remove" ${state.busy?'disabled':''}>Verwijderen</button>`:''}</div>
          ${state.preview===r.id?preview(r):''}
        </section>`).join('')}</div>
        ${state.loaded&&!state.racks.length?'<div class="loc-empty">Er zijn nog geen stellingen ingesteld.</div>':''}
        <div class="loc-actions">${admin()?`<button type="button" data-action="add" ${!state.loaded||state.busy?'disabled':''}>+ Stelling toevoegen</button><button type="button" class="loc-primary" data-action="save" ${!state.loaded||state.busy||!state.dirty?'disabled':''}>${state.busy?'Opslaan…':'Indeling opslaan'}</button>`:''}<button type="button" data-action="reload" ${state.busy?'disabled':''}>Opnieuw laden</button></div>
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
        let cells='';for(let x=1;x<=columns;x++)cells+=`<div class="loc-cell">X${x} · Y${y}</div>`;
        rows+=`<div class="loc-grid" style="grid-template-columns:repeat(${columns},minmax(76px,1fr))">${cells}</div>`;
      }
      return `<p class="loc-axis">Y: van onder naar boven · X: van links naar rechts</p><div class="loc-grid-scroll">${rows}</div>`;
    }
    async function load() {
      state.busy=true;state.message='Indeling laden…';render();
      try {const d=await api.load();state.racks=d.racks;state.revision=d.revision;state.loaded=true;state.dirty=false;state.message='';}
      catch(e){state.message=e.message||'Laden mislukt. Probeer opnieuw.';}
      finally{state.busy=false;render();}
    }
    el.addEventListener('input',e=>{
      const field=e.target.dataset.field, row=e.target.closest('[data-rack]');
      if(!['name','rows','rowColumns'].includes(field)||!row||!admin()||state.busy)return;
      const rack=state.racks[Number(row.dataset.rack)];
      if(field==='rowColumns'){
        if(!rack.rowColumns)rack.rowColumns=Array.from({length:Number(rack.rows)},()=>rack.columns ?? 1);
        rack.rowColumns[Number(e.target.dataset.y)]=e.target.value;
      }else rack[field]=e.target.value;
      state.dirty=true;state.message='Onopgeslagen wijzigingen';
      el.querySelector('[data-action="save"]').disabled=false;
      el.querySelector('.loc-message').textContent=state.message;
    });
    el.addEventListener('change',e=>{
      if(e.target.dataset.field==='rows'&&e.target.closest('[data-rack]')&&admin()&&!state.busy)render();
    });
    el.addEventListener('click',async e=>{
      const button=e.target.closest('[data-action]');if(!button||!button.closest('[data-loc-root]')||button.disabled||state.busy)return;
      const action=button.dataset.action, index=Number(button.closest('[data-rack]')?.dataset.rack);
      if(action==='reload'){if(state.dirty&&!confirm('Onopgeslagen wijzigingen weggooien en de actuele indeling laden?'))return;await load();return;}
      if(action==='preview'){state.preview=state.preview===state.racks[index].id?null:state.racks[index].id;render();return;}
      if(!admin()||!state.loaded)return;
      if(action==='add'){
        if(state.racks.length>=100){state.message='Maximaal 100 stellingen.';render();return;}
        let n=1;while(state.racks.some(r=>r.name.toLowerCase()===`stelling ${n}`))n++;
        state.racks.push({id:crypto.randomUUID(),name:`Stelling ${n}`,rows:1,columns:1,rowColumns:[1]});state.dirty=true;state.message='Onopgeslagen wijzigingen';render();
        el.querySelector('.loc-rack:last-child input')?.focus();
      }else if(action==='remove'){
        if(!confirm(`Stelling “${state.racks[index].name}” uit de indeling verwijderen?`))return;
        state.racks.splice(index,1);state.dirty=true;state.message='Onopgeslagen wijzigingen';render();
      }else if(action==='save'){
        const names=state.racks.map(r=>r.name.trim().toLowerCase());
        if(state.racks.some(r=>!validRack(r))||new Set(names).size!==names.length){state.message='Gebruik unieke stellingnamen en hele aantallen van 1 tot 50 voor rijen en kolommen.';render();return;}
        state.busy=true;state.message='Indeling opslaan…';render();
        try{const d=await api.save(state.racks.map(r=>({...r,name:r.name.trim(),rows:Number(r.rows),columns:Number(r.rowColumns?.[0] ?? r.columns ?? 1),rowColumns:Array.from({length:Number(r.rows)},(_,y)=>Number(r.rowColumns?.[y] ?? r.columns ?? 1))})),state.revision);state.racks=d.racks;state.revision=d.revision;state.dirty=false;state.message='Indeling opgeslagen.';}
        catch(error){state.message=error.message||'Opslaan mislukt. Je wijzigingen zijn bewaard in dit scherm.';}
        finally{state.busy=false;render();}
      }
    });
    instances.set(el,{render});void load();
  }};
})();
