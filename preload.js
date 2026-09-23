const { contextBridge, ipcRenderer } = require('electron');

// Haal prefetched data SYNCHRON op zodat het beschikbaar is vóór de eerste render.
// sendSync blokkeert tot main antwoordt — maar main retourneert alleen een gecached
// object, dus dit is vrijwel instant.
const _prefetchedData = ipcRenderer.sendSync('get-prefetched-data-sync');

// Wacht bij herstart op reeds gestarte schrijfacties, zonder de gedeelde wagen
// opnieuw te versturen. Een update mag geen lopende bestelling afbreken.
const lopendeSchrijfacties = new Set();
let schrijfActiviteit = 0;
const leesActies = new Set(['getStock', 'getCart', 'getOrders', 'getProductsAdmin', 'getRetour', 'getCorrections', 'getStatusDatums', 'orderConfirmationPdf', 'orderMailStatus']);
let updateHerstartBezig = false;

async function schrijfVerzoek(kanaal, ...waarden) {
  const verzoek = ipcRenderer.invoke(kanaal, ...waarden);
  lopendeSchrijfacties.add(verzoek);
  schrijfActiviteit++;
  try { return await verzoek; }
  finally { lopendeSchrijfacties.delete(verzoek); schrijfActiviteit++; }
}

async function herstartVoorUpdate() {
  if(updateHerstartBezig) return { ok:false, fout:'Het opnieuw opstarten wordt al voorbereid.' };
  updateHerstartBezig = true;
  try {
    const uitersteTijd = Date.now() + 15000;
    do {
      // Ook vervolgacties uit dezelfde opslagketen krijgen tijd om af te ronden.
      const vorigeActiviteit = schrijfActiviteit;
      await new Promise(resolve => setTimeout(resolve, 250));
      if(!lopendeSchrijfacties.size && schrijfActiviteit === vorigeActiviteit) return await ipcRenderer.invoke('binnenapp-update-herstart');
    } while(Date.now() < uitersteTijd);
    return { ok:false, fout:'Er wordt nog iets opgeslagen. Wacht even en klik opnieuw op Opnieuw opstarten.' };
  } catch {
    return { ok:false, fout:'Opnieuw opstarten is niet gelukt. Probeer het nogmaals.' };
  } finally { updateHerstartBezig = false; }
}

contextBridge.exposeInMainWorld('binnenApp', {
  minimize: () => ipcRenderer.send('minimize-window'),
  close:    () => ipcRenderer.send('close-window'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  updateStatus: () => ipcRenderer.invoke('binnenapp-update-status'),
  herstartVoorUpdate,
  onUpdateStatus: (callback) => {
    if(typeof callback !== 'function') return () => {};
    const luisteraar = (_event, bericht) => callback(bericht);
    ipcRenderer.on('binnenapp-update-status', luisteraar);
    return () => ipcRenderer.removeListener('binnenapp-update-status', luisteraar);
  },
  startupSyncReady: () => ipcRenderer.send('startup-sync-ready'),
  authSession: () => ipcRenderer.invoke('supabase-auth-session'),
  authSignIn: (email, password) => schrijfVerzoek('supabase-auth-sign-in', { email, password }),
  authSignUp: (naam, email, password) => schrijfVerzoek('supabase-auth-sign-up', { naam, email, password }),
  authSignOut: () => schrijfVerzoek('supabase-auth-sign-out'),
  ledenLijst: () => ipcRenderer.invoke('supabase-leden-lijst'),
  keurLidGoed: (email, rol) => schrijfVerzoek('supabase-keur-lid', { email, rol }),
  trekLidIn: (email) => schrijfVerzoek('supabase-trek-lid-in', { email }),
  prefetchedData: _prefetchedData || null,
  supabaseRequest: (key, payload) => leesActies.has(key)
    ? ipcRenderer.invoke('supabase-request', key, payload)
    : schrijfVerzoek('supabase-request', key, payload),
  cartRealtimeStatus: () => ipcRenderer.invoke('supabase-cart-realtime-status'),
  onCartRealtime: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const luisteraar = (_event, bericht) => callback(bericht);
    ipcRenderer.on('supabase-cart-realtime', luisteraar);
    return () => ipcRenderer.removeListener('supabase-cart-realtime', luisteraar);
  },
  uploadOrderConfirmation: (payload) => schrijfVerzoek('supabase-upload-confirmation', payload),
});

contextBridge.exposeInMainWorld('splashBridge', {
  onStatus: (cb) => ipcRenderer.on('splash-status', (_e, data) => cb(data)),
});
