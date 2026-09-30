const fs = require('node:fs');
const path = require('node:path');

// Alleen de extra afmetingen kunnen lokaal staan. Indeling, rechten en
// productlocaties blijven altijd via de bestaande geautoriseerde RPC's lopen.
function createLocationSceneStore({supabase, directory, projectUrl}) {
  if (projectUrl !== 'https://guurncfxhcxwvgnzoeyp.supabase.co') throw new Error('Onjuist BinnenApp-project.');
  const file = path.join(directory, 'binnenapp-location-scene-v1.json');
  let queue = Promise.resolve();
  const checked = result => {
    if (result.error) throw new Error(result.error.message || 'Locaties ophalen mislukt.');
    return result.data;
  };
  const missing = result => result.error?.code === 'PGRST202';
  function read() {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {revision:0,pending:false,geometry:{version:1,racks:{},products:{}}};
    }
    const data = JSON.parse(text);
    if (!Number.isInteger(data.revision) || data.geometry?.version !== 1) throw new Error('De lokale 3D-maten kunnen niet worden gelezen.');
    return data;
  }
  function write(data) {
    fs.mkdirSync(directory, {recursive:true});
    fs.writeFileSync(file + '.tmp', JSON.stringify(data), 'utf8');
    fs.renameSync(file + '.tmp', file);
  }
  function validate(geometry, racks) {
    if (geometry?.version !== 1 || !geometry.racks || !geometry.products || Array.isArray(geometry.racks) || Array.isArray(geometry.products) || Buffer.byteLength(JSON.stringify(geometry)) > 1000000) throw new Error('Ongeldige 3D-maten.');
    const rackLimits = {width:[10,2000],height:[10,1000],depth:[10,500],x:[-5000,5000],z:[-5000,5000],angle:[0,359]};
    const dims = (value, limits) => value && Object.entries(limits).every(([key,[min,max]]) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= min && value[key] <= max);
    for (const [id,g] of Object.entries(geometry.racks)) if (!racks.some(r => r.id === id) || !dims(g,rackLimits)) throw new Error('Ongeldige stellingmaten.');
    for (const [id,g] of Object.entries(geometry.products)) if (!/^\d{1,18}$/.test(id) || !dims(g,{width:[.1,500],height:[.1,500],depth:[.1,500]})) throw new Error('Ongeldige productmaten.');
    for(const g of Object.values(geometry.products)){const a=g.across??1,b=g.behind??1;if(![a,b].every(n=>Number.isInteger(n)&&n>=1&&n<=50)||a*b>250)throw new Error('Vul gehele aantallen van 1 tot 50 in, met maximaal 250 plaatsen per product.');}
  }
  async function load() {
    const response = await supabase.rpc('binnenapp_get_location_scene');
    if (!missing(response)) {
      const cloud = checked(response), local = read();
      // Het opgeslagen beheerdersmodel is leidend, ook op een pc met oude
      // lokale wijzigingen. Alleen de eerste import mag uit lokale maten komen.
      const published=cloud.sceneRevision>0||Object.keys(cloud.geometry?.racks||{}).length>0||Object.keys(cloud.geometry?.products||{}).length>0;
      let importLocal=false;
      if(!published&&local.pending){
        const membership=checked(await supabase.rpc('binnenapp_membership_status'));
        importLocal=membership?.active===true&&membership.role==='admin';
      }
      return {...cloud,geometry:importLocal?local.geometry:cloud.geometry,storage:importLocal?'pending':'cloud',localRevision:local.revision};
    }
    const layout = checked(await supabase.rpc('binnenapp_get_location_layout'));
    const local = read();
    return {...layout,geometry:local.geometry,sceneRevision:0,storage:'local',localRevision:local.revision};
  }
  async function saveNow(payload) {
    const local = read();
    if ((payload.localRevision ?? 0) !== local.revision) throw new Error('De lokale maten zijn intussen gewijzigd. Vernieuw en probeer opnieuw.');
    validate(payload.geometry,payload.racks);
    const current=checked(await supabase.rpc('binnenapp_get_location_layout'));
    for(const p of current.products){
      const oldRack=current.racks.find(r=>r.name===p.rack),r=payload.racks.find(r=>r.id===oldRack?.id);
      const columns=r?.rowColumns?.[Number(p.y_axis)-1]??r?.columns,g=r&&payload.geometry.racks[r.id],pg=payload.geometry.products[p.id];
      if(g&&pg&&columns){
        const max=Math.max(0,Math.min(500,Math.floor(((g.width-8)/columns-3)*10+1e-7)/10));
        if(pg.width>max+1e-7)throw new Error(`${p.jb_code||p.id} is te breed voor het vak. Maximale breedte: ${max} cm.`);
      }
    }
    const response = await supabase.rpc('binnenapp_save_location_scene', {
      p_racks:payload.racks,p_geometry:payload.geometry,p_revision:payload.revision,p_scene_revision:payload.sceneRevision
    });
    if (!missing(response)) {
      const cloud = checked(response);
      write({revision:local.revision+1,pending:false,geometry:cloud.geometry});
      return {...cloud,storage:'cloud',localRevision:local.revision+1};
    }
    // Dit verzoek controleert adminrechten, bezette vakken en de indelingsrevisie.
    checked(await supabase.rpc('binnenapp_save_location_layout',{p_racks:payload.racks,p_revision:payload.revision}));
    write({revision:local.revision+1,pending:true,geometry:payload.geometry});
    const layout = checked(await supabase.rpc('binnenapp_get_location_layout'));
    return {...layout,geometry:payload.geometry,sceneRevision:0,storage:'local',localRevision:local.revision+1};
  }
  async function photos(){
    const rows=checked(await supabase.from('products').select('id,product_image_url'))||[];
    return new Map(rows.map(p=>[String(p.id),p.product_image_url]));
  }
  const withPhotos=(data,images)=>({...data,products:data.products.map(p=>({...p,product_image_url:images.get(String(p.id))||null}))});
  return {async load(){const data=await load();return withPhotos(data,await photos());},save(payload){const pending=queue.then(async()=>{const images=await photos();return withPhotos(await saveNow(payload),images);});queue=pending.catch(()=>{});return pending;}};
}
module.exports={createLocationSceneStore};
