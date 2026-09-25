const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { createLocationSceneStore } = require('./location-scene-store');

const SUPABASE_URL = 'https://guurncfxhcxwvgnzoeyp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_iomMmjLjzETZ_RLIq5bemA_e02lXOOk';
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// --- Auth-logboek ----------------------------------------------------
// Zonder dit is een spontane uitlog niet te herleiden: de renderer kan
// geen bestanden schrijven en de console verdwijnt zodra het venster herlaadt.
const NL = String.fromCharCode(10);
let _logPad = null;

function zetLogPad(app) {
  try {
    _logPad = path.join(app.getPath('userData'), 'auth-log.txt');
    if (fs.existsSync(_logPad) && fs.statSync(_logPad).size > 200 * 1024) {
      fs.writeFileSync(_logPad, '');
    }
  } catch { _logPad = null; }
}

function logAuth(bericht, extra) {
  const regel = new Date().toISOString() + '  ' + bericht +
    (extra === undefined ? '' : '  ' + JSON.stringify(extra));
  console.log('[auth]', regel);
  if (!_logPad) return;
  try { fs.appendFileSync(_logPad, regel + NL); } catch { /* logging mag de app nooit breken */ }
}

function createEncryptedAuthStorage(app, safeStorage) {
  const storageFile = path.join(app.getPath('userData'), 'supabase-session.bin');

  function readAll() {
    let encrypted;
    try {
      encrypted = fs.readFileSync(storageFile);
    } catch (fout) {
      if (fout.code !== 'ENOENT') logAuth('opslag lezen mislukt', { fout: fout.message });
      return {};
    }
    try {
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(encrypted)
        : encrypted.toString('utf8');
      return JSON.parse(json) || {};
    } catch (fout) {
      // Ernstig: de sessie staat er wel, maar we komen er niet meer bij.
      logAuth('ONTSLEUTELEN MISLUKT - sessie onbereikbaar', { fout: fout.message, bytes: encrypted.length });
      return {};
    }
  }

  function writeAll(values) {
    const json = JSON.stringify(values || {});
    const bytes = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');
    fs.mkdirSync(path.dirname(storageFile), { recursive: true });
    fs.writeFileSync(storageFile, bytes);
  }

  return {
    getItem(key) {
      return readAll()[key] ?? null;
    },
    setItem(key, value) {
      const values = readAll();
      values[key] = value;
      writeAll(values);
      logAuth('sessie opgeslagen', { sleutel: key, tekens: String(value || '').length });
    },
    removeItem(key) {
      // Wie wist de sessie? De stack verraadt of dit een echte uitlog is
      // of supabase-js die opruimt na een mislukte vernieuwing.
      const stapel = (new Error().stack || '').split(NL).slice(2, 7).map(r => r.trim());
      logAuth('SESSIE GEWIST', { sleutel: key, herkomst: stapel });
      const values = readAll();
      delete values[key];
      writeAll(values);
    }
  };
}

function check(result, fallback = 'Supabase-verzoek mislukt') {
  if (result?.error) throw new Error(result.error.message || fallback);
  return result?.data;
}

function maakGebruikersSamenvatting(user, membership = {}) {
  if (!user) return null;
  // De ledencontrole bevat de actuele naam; sessiemetadata kan nog ouder zijn.
  // Geef uitsluitend profieltekst door, nooit de sessie of overige metadata.
  const displayName = [membership?.displayName, user.user_metadata?.display_name, user.email]
    .find(waarde => typeof waarde === 'string' && waarde.trim());
  return { id: user.id, email: user.email || '', displayName: displayName?.trim() || '' };
}

function normalizeStatus(value = '') {
  const clean = String(value || '').trim();
  return clean === 'In Magazijn' ? 'In magazijn' : clean;
}

function valideerVerwachteLeverdatum(waarde) {
  if (waarde === null) return null;
  if (typeof waarde !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(waarde)
      || waarde < '2020-01-01' || waarde > '2100-12-31') {
    throw new Error('Kies een geldige verwachte leverdatum tussen 2020 en 2100.');
  }
  const datum = new Date(waarde + 'T12:00:00Z');
  if (!Number.isFinite(datum.getTime()) || datum.toISOString().slice(0, 10) !== waarde) {
    throw new Error('Kies een bestaande kalenderdatum.');
  }
  return waarde;
}

function valideerPdfBestelnummer(value) {
  const bestelnummer = String(value || '').trim();
  if (!/^#ORD-[A-Za-z0-9-]{6,40}$/.test(bestelnummer)) {
    throw new Error('Ongeldig bestelnummer voor de orderbevestiging.');
  }
  return bestelnummer;
}

function valideerPdfBestand(bytes, mimeType) {
  if (!bytes?.byteLength) throw new Error('Het PDF-bestand is leeg. Kies een geldige orderbevestiging.');
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('De PDF mag maximaal 10 MB zijn.');
  const bestandstype = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (bestandstype !== 'application/pdf') throw new Error('Alleen echte PDF-bestanden zijn toegestaan.');
  // Sommige geldige PDF's hebben een korte voorloop vóór hun bestandskop.
  const kop = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 1024));
  if (kop.indexOf('%PDF-') < 0) throw new Error('Dit bestand heeft geen geldige PDF-bestandskop. Upload de PDF opnieuw.');
}

function leesPdfInvoer(value) {
  const aantalBytes = value instanceof ArrayBuffer ? value.byteLength : value?.byteLength ?? value?.length ?? 0;
  if (aantalBytes > MAX_PDF_BYTES) throw new Error('De PDF mag maximaal 10 MB zijn.');
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Buffer.from(value);
  }
  throw new Error('Geen geldige PDF-inhoud ontvangen. Selecteer het bestand opnieuw.');
}

function productToLegacyRow(product = {}) {
  return {
    ID: product.id,
    Omschrijving: product.description,
    JB_x002d_CODE: product.jb_code,
    EANcode: product.ean_code,
    Voorraad: product.stock,
    MinVoorraad: product.min_stock,
    ProductFoto: product.product_image_url,
    BronFoto: product.source_image_url,
    Stelling: product.rack,
    X_x002d_As: product.x_axis,
    Y_x002d_As: product.y_axis,
    Positie2: product.position,
    VerpaktPer: product.packaged_per,
    Eenheid: product.unit,
    Beschikbaar: product.available ? 'Ja' : 'Nee',
    Categorie: product.category,
    PrijsPS: product.price_per_unit,
    Created: product.created_at,
    Modified: product.updated_at
  };
}

function valideerArtikelTekst(value, naam, maxLengte, verplicht = true) {
  const tekst = String(value ?? '').trim();
  if (verplicht && !tekst) throw new Error(`Vul ${naam} in.`);
  if (tekst.length > maxLengte || /[\u0000-\u001f\u007f]/.test(tekst)) {
    throw new Error(`${naam} is ongeldig of te lang.`);
  }
  return tekst;
}

function valideerArtikelGetal(value, naam, { min = 0, max = 1000000, geheel = true } = {}) {
  const getal = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(getal) || getal < min || getal > max || (geheel && !Number.isInteger(getal))) {
    throw new Error(`${naam} is ongeldig.`);
  }
  return getal;
}

function valideerArtikelUrl(value, naam) {
  const tekst = valideerArtikelTekst(value, naam, 2048, false);
  if (!tekst) return null;
  let url;
  try { url = new URL(tekst); } catch { throw new Error(`${naam} is geen geldige URL.`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${naam} moet met http:// of https:// beginnen.`);
  return tekst;
}

function valideerArtikelPayload(payload = {}) {
  const productId = payload.productId == null || payload.productId === '' ? null : Number(payload.productId);
  if (productId !== null && (!Number.isSafeInteger(productId) || productId <= 0)) throw new Error('Ongeldig productnummer.');
  const expectedUpdatedAt = productId === null ? null : String(payload.expectedUpdatedAt || '').trim();
  if (productId !== null && (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt)))) {
    throw new Error('De actuele artikelversie ontbreekt. Ververs artikelbeheer.');
  }
  const minStock = valideerArtikelGetal(payload.minStock, 'Minimumvoorraad');
  return {
    productId,
    expectedUpdatedAt,
    eanCode: valideerArtikelTekst(payload.eanCode, 'het EAN- of artikelnummer', 64),
    jbCode: valideerArtikelTekst(payload.jbCode, 'het JB-nummer', 64).replace(/\s+/g, '').toUpperCase(),
    description: valideerArtikelTekst(payload.description, 'de artikelnaam', 240),
    category: valideerArtikelTekst(payload.category, 'de categorie', 80),
    unit: valideerArtikelTekst(payload.unit, 'de eenheid', 24),
    packagedPer: valideerArtikelGetal(payload.packagedPer, 'Verpakt per', { min: 1 }),
    pricePerUnit: valideerArtikelGetal(payload.pricePerUnit, 'Prijs per verpakking', { max: 10000000, geheel: false }),
    stock: valideerArtikelGetal(payload.stock, 'Voorraad'),
    minStock,
    productImageUrl: valideerArtikelUrl(payload.productImageUrl, 'De foto-URL'),
    sourceImageUrl: valideerArtikelUrl(payload.sourceImageUrl, 'De originele foto-URL'),
    rack: valideerArtikelTekst(payload.rack, 'Stelling', 64, false) || null,
    xAxis: valideerArtikelTekst(payload.xAxis, 'X-as', 64, false) || null,
    yAxis: valideerArtikelTekst(payload.yAxis, 'Y-as', 64, false) || null,
    position: valideerArtikelTekst(payload.position, 'Positie', 64, false) || null,
    available: payload.available !== false
  };
}

function registerSupabaseHandlers({ app, safeStorage, ipcMain, onCartRealtime }) {
  zetLogPad(app);
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: createEncryptedAuthStorage(app, safeStorage),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  const locationScene = createLocationSceneStore({supabase,directory:app.getPath('userData'),projectUrl:SUPABASE_URL});

  // ─── Prefetch cache ──────────────────────────────────────────────────
  const _cache = {};
  let cartRealtimeChannel = null;
  let cartRealtimeStatus = 'CLOSED';
  let cartRealtimeGeneratie = 0;

  function meldCartRealtime(soort, extra = {}) {
    if (soort === 'status') cartRealtimeStatus = String(extra.status || 'CLOSED');
    if (soort === 'status') console.info('[realtime] winkelwagen:', cartRealtimeStatus);
    onCartRealtime?.({ soort, tijdstip: Date.now(), ...extra });
  }

  async function stopCartRealtime() {
    cartRealtimeGeneratie += 1;
    const kanaal = cartRealtimeChannel;
    cartRealtimeChannel = null;
    if (kanaal) {
      try { await supabase.removeChannel(kanaal); }
      catch (error) { console.warn('[realtime] winkelwagen stoppen mislukt:', error.message); }
    }
    meldCartRealtime('status', { status: 'CLOSED' });
  }

  async function startCartRealtime(accessToken) {
    if (cartRealtimeChannel && (cartRealtimeStatus === 'SUBSCRIBED' || cartRealtimeStatus === 'CONNECTING')) return;
    const generatie = ++cartRealtimeGeneratie;
    const oudKanaal = cartRealtimeChannel;
    cartRealtimeChannel = null;
    if (oudKanaal) {
      try { await supabase.removeChannel(oudKanaal); }
      catch (error) { console.warn('[realtime] oud winkelwagenkanaal opruimen mislukt:', error.message); }
    }
    if (generatie !== cartRealtimeGeneratie) return;

    try {
      if (accessToken) await supabase.realtime.setAuth(accessToken);
      meldCartRealtime('status', { status: 'CONNECTING' });
      const kanaal = supabase
        .channel('binnenapp-desktop-winkelwagen')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'cart_items'
        }, () => meldCartRealtime('wijziging'));
      cartRealtimeChannel = kanaal;
      kanaal.subscribe(status => {
        if (generatie !== cartRealtimeGeneratie || cartRealtimeChannel !== kanaal) return;
        meldCartRealtime('status', { status });
      });
    } catch (error) {
      console.warn('[realtime] winkelwagen starten mislukt:', error.message);
      meldCartRealtime('status', { status: 'CHANNEL_ERROR' });
    }
  }

  // Let op: deze controle mag iemand nooit uitloggen door een hapering.
  // Alleen een expliciet 'niet actief' is een reden om de sessie te wissen;
  // een mislukte aanroep betekent dat we het niet weten, niet dat het fout is.
  async function getSessionSummary() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      logAuth('sessiecontrole: getSession gaf een fout', { fout: error.message });
      return { user: null, onbekend: true, reden: error.message };
    }

    const session = data?.session || null;
    if (!session?.user) {
      logAuth('sessiecontrole: geen sessie in de opslag');
      void stopCartRealtime();
      return { user: null };
    }

    // De sessie bevat de gebruiker al; getUser() is een extra netwerkaanroep
    // die we niet nodig hebben om te weten dat er iemand is ingelogd.
    const user = session.user;

    const ledenAntwoord = await supabase.rpc('binnenapp_membership_status');
    if (ledenAntwoord.error) {
      // Niet uitloggen: we laten de gebruiker door en proberen het later opnieuw
      logAuth('ledencheck mislukt, sessie blijft staan', { fout: ledenAntwoord.error.message });
      void startCartRealtime(session.access_token);
      return { user: maakGebruikersSamenvatting(user), role: 'member', onbekend: true };
    }

    const membership = ledenAntwoord.data || {};
    if (membership.active !== true) {
      logAuth('lid niet actief - sessie wordt gewist', { email: user.email, antwoord: membership });
      await stopCartRealtime();
      await supabase.auth.signOut({ scope: 'local' });
      return { user: null, accessDenied: true };
    }

    logAuth('sessiecontrole geslaagd', { email: user.email, rol: membership.role });
    void startCartRealtime(session.access_token);
    return { user: maakGebruikersSamenvatting(user, membership), role: membership.role || 'member' };
  }

  async function getProducts() {
    return check(await supabase
      .from('products')
      .select('*')
      .eq('available', true)
      .order('id')) || [];
  }

  async function getCartRows() {
    const rows = check(await supabase
      .from('cart_items')
      .select('product_id,quantity,updated_at,products(*)')
      .order('updated_at')) || [];
    return rows.map(row => ({
      ...productToLegacyRow(row.products || {}),
      Aantal: row.quantity,
      ItemId: row.product_id,
      SharePointProductId: row.product_id
    }));
  }

  async function leesOrderBevestiging(orderNumber) {
    const bestelnummer = valideerPdfBestelnummer(orderNumber);
    const antwoord = await supabase.from('orders')
      .select('id,order_number,confirmation_pdf_url,confirmation_pdf_path,confirmation_pdf_name')
      .eq('order_number', bestelnummer)
      .maybeSingle();
    if (antwoord.error) throw new Error('De orderbevestiging kon niet worden opgehaald. Controleer je verbinding en probeer opnieuw.');
    if (!antwoord.data) throw new Error('Deze bestelling bestaat niet of je hebt geen toegang.');
    return antwoord.data;
  }

  async function haalOrderBevestigingPdf(orderNumber) {
    const bestelling = await leesOrderBevestiging(orderNumber);
    const opslagpad = String(bestelling.confirmation_pdf_path || '').trim();
    if (!opslagpad) {
      if (bestelling.confirmation_pdf_url) {
        throw new Error('Deze orderbevestiging gebruikt nog een oude bestandslink. Upload de PDF opnieuw om hem veilig in BinnenApp te openen.');
      }
      throw new Error('Bij deze bestelling is nog geen orderbevestiging opgeslagen. Upload eerst de PDF.');
    }
    if (opslagpad.startsWith('/') || opslagpad.includes('://') || /[\\\u0000-\u001f\u007f]/.test(opslagpad)
        || opslagpad.split('/').some(deel => deel === '..' || deel === '.')) {
      throw new Error('De opgeslagen PDF-verwijzing is ongeldig. Upload de PDF opnieuw.');
    }
    // Uitsluitend het door RLS gelezen databasepad, nooit een clientpad of URL.
    const antwoord = await supabase.storage.from('order-confirmations').download(opslagpad);
    if (antwoord.error || !antwoord.data) {
      throw new Error('De opgeslagen PDF kon niet worden geladen. Controleer je verbinding of upload de PDF opnieuw.');
    }
    const bestand = antwoord.data;
    if (!bestand.size) throw new Error('De opgeslagen PDF is leeg. Upload de PDF opnieuw.');
    if (bestand.size > MAX_PDF_BYTES) throw new Error('De PDF mag maximaal 10 MB zijn.');
    if (String(bestand.type || '').split(';')[0].trim().toLowerCase() !== 'application/pdf') {
      throw new Error('Het opgeslagen bestand is geen PDF. Upload de orderbevestiging opnieuw.');
    }
    const bytes = new Uint8Array(await bestand.arrayBuffer());
    valideerPdfBestand(bytes, bestand.type);
    const naam = String(bestelling.confirmation_pdf_name || 'orderbevestiging.pdf')
      .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || 'orderbevestiging.pdf';
    return { bytes, naam };
  }

  async function getOrderRows() {
    const orders = check(await supabase
      .from('orders')
      .select('id,order_number,created_at,team,status,requester_name,requester_email,reference,delivery_date,expected_delivery_date,leys_order_number,confirmation_pdf_url,confirmation_pdf_path,confirmation_pdf_name,confirmation_in_map,in_warehouse_since,order_items(*)')
      .order('created_at', { ascending: false })) || [];

    const rows = [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      for (const line of order.order_items || []) {
        rows.push({
          ID: line.source_line_id || line.id,
          RegelId: line.id,          // altijd de echte order_items.id, nodig voor nalevering
          Title: order.order_number,
          listProductFoto: line.product_image_url || '',
          listAantal: line.quantity,
          listOmschrijving: line.description,
          listEAN: line.ean_code || '',
          listStatus: normalizeStatus(line.status || order.status),
          PrijsPS: line.price_per_unit,
          VerpaktPer: line.packaged_per,
          OrderbevestigingInOrdermapTekst: order.confirmation_in_map ? 'Ja' : 'Nee',
          InMagazijnSinds: order.in_warehouse_since || '',
          BesteldDoor: order.requester_name || '',
          Referentie: order.reference || '',
          Leverdatum: order.delivery_date || '',
          VerwachteLeverdatum: order.expected_delivery_date || '',
          AanvragerEmail: order.requester_email || '',
          LeysNummer: order.leys_order_number || '',
          // Alleen beschikbaarheid doorgeven; de bytes worden pas bij openen geladen.
          OrderbevestigingPdfAanwezig: Boolean(order.confirmation_pdf_path || order.confirmation_pdf_url),
          OrderbevestigingPdfUrl: '',
          OrderbevestigingPdfNaam: order.confirmation_pdf_name || '',
        // Gebruik voor de besteldatum altijd de datum van de bestelling zelf.
        Datum: order.created_at,
        Created: line.created_at || order.created_at
        });
      }
    }
    return rows;
  }

  async function getCorrectionRows() {
    const rows = check(await supabase
      .from('order_corrections')
      .select('id,order_number,correction_type,description,ean_code,correct_quantity,note,resolved,created_at')
      .order('created_at', { ascending: false })) || [];
    return rows.map(row => ({
      id: row.id,
      orderId: row.order_number,
      soort: row.correction_type,
      naam: row.description,
      eanCode: row.ean_code || '',
      juisteAantal: row.correct_quantity,
      toelichting: row.note || '',
      opgelost: !!row.resolved
    }));
  }

  async function getStatusDatumRows() {
    const rows = check(await supabase
      .from('order_status_dates')
      .select('order_number,status,bereikt_op')) || [];
    return rows.map(row => ({
      orderId: row.order_number,
      status: row.status,
      datum: row.bereikt_op
    }));
  }

  async function getRetourRows() {
    const rows = check(await supabase
      .from('retour_items')
      .select('id,order_number,description,ean_code,jb_code,quantity,unit,product_image_url,reason,created_at')
      .order('created_at', { ascending: false })) || [];
    return rows.map(row => ({
      id: row.id,
      orderId: row.order_number,
      naam: row.description,
      eanCode: row.ean_code || '',
      jbCode: row.jb_code || '',
      aantal: row.quantity,
      eenheid: row.unit || 'st',
      foto: row.product_image_url || '',
      reden: row.reason || ''
    }));
  }

  async function syncCart(items = []) {
    const normalized = (Array.isArray(items) ? items : [])
      .map(item => ({
        product_id: Number(item.SharePointProductId || item.ProductId || item.product_id || 0),
        quantity: Number(item.Aantal ?? item.quantity ?? 0)
      }))
      .filter(item => Number.isSafeInteger(item.product_id) && item.product_id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
    return check(await supabase.rpc('binnenapp_sync_cart', { p_items: normalized }));
  }

  async function updateConfirmation(payload = {}) {
    const confirmed = typeof payload.confirmed === 'boolean'
      ? payload.confirmed
      : payload.ordermapTekst != null
        ? payload.ordermapTekst === 'Ja'
        : payload.orderbevestigingInOrdermapTekst != null
          ? payload.orderbevestigingInOrdermapTekst === 'Ja'
          : null;
    return check(await supabase.rpc('binnenapp_update_order_confirmation', {
      p_order_number: String(payload.orderNumber || ''),
      p_confirmed: confirmed,
      p_leys_order_number: payload.leysOrderNumber || payload.leysNummer || null,
      p_pdf_path: payload.pdfPath || null,
      p_pdf_url: payload.pdfUrl || payload.orderConfirmationPdfUrl || null,
      p_pdf_name: payload.pdfName || payload.orderConfirmationPdfName || null
    }));
  }

  ipcMain.handle('supabase-auth-session', getSessionSummary);
  ipcMain.handle('supabase-auth-sign-in', async (_event, credentials = {}) => {
    const email = String(credentials.email || '').trim().toLowerCase();
    const password = String(credentials.password || '');
    if (!email || !password) throw new Error('Vul je e-mailadres en wachtwoord in.');
    logAuth('inloggen gestart', { email });
    const data = check(await supabase.auth.signInWithPassword({ email, password }), 'Inloggen mislukt');
    logAuth('wachtwoord geaccepteerd', { email, sessie: !!data?.session });
    const membership = check(await supabase.rpc('binnenapp_membership_status')) || {};
    if (!membership.active) {
      logAuth('inloggen geweigerd - lid niet actief', { email, antwoord: membership });
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Dit account is nog niet goedgekeurd voor BinnenApp.');
    }
    logAuth('inloggen voltooid', { email, rol: membership.role });
    void startCartRealtime(data?.session?.access_token);
    return { user: maakGebruikersSamenvatting(data?.user, membership), role: membership.role || 'member' };
  });
  ipcMain.handle('supabase-auth-sign-up', async (_event, gegevens = {}) => {
    const email = String(gegevens.email || '').trim().toLowerCase();
    const password = String(gegevens.password || '');
    const naam = String(gegevens.naam || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Vul een geldig e-mailadres in.');
    if (password.length < 8) throw new Error('Kies een wachtwoord van minstens 8 tekens.');
    if (naam.length < 2) throw new Error('Vul je naam in.');

    const data = check(await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: naam } }
    }), 'Aanmelden mislukt');

    // Een nieuw account staat standaard op niet-actief en moet worden
    // goedgekeurd. Zonder sessie is e-mailbevestiging nog nodig.
    if (!data?.session) {
      return { bevestigingNodig: true, goedkeuringNodig: true };
    }
    const membership = check(await supabase.rpc('binnenapp_membership_status')) || {};
    if (!membership.active) {
      await supabase.auth.signOut({ scope: 'local' });
      return { bevestigingNodig: false, goedkeuringNodig: true };
    }
    return { bevestigingNodig: false, goedkeuringNodig: false };
  });

  ipcMain.handle('supabase-auth-sign-out', async () => {
    await stopCartRealtime();
    check(await supabase.auth.signOut({ scope: 'local' }));
    return true;
  });

  ipcMain.handle('supabase-cart-realtime-status', () => cartRealtimeStatus);

  ipcMain.handle('supabase-leden-lijst', async () => {
    return check(await supabase.rpc('binnenapp_leden')) || [];
  });

  ipcMain.handle('supabase-keur-lid', async (_event, gegevens = {}) => {
    return check(await supabase.rpc('binnenapp_keur_lid_goed', {
      p_email: String(gegevens.email || ''),
      p_role: gegevens.rol === 'admin' ? 'admin' : 'member'
    }));
  });

  ipcMain.handle('supabase-trek-lid-in', async (_event, gegevens = {}) => {
    return check(await supabase.rpc('binnenapp_trek_lid_in', {
      p_email: String(gegevens.email || '')
    }));
  });

  ipcMain.handle('supabase-request', async (_event, key, payload = {}) => {
    switch (key) {
      case 'getLocationScene':
        return locationScene.load();
      case 'saveLocationScene':
        return locationScene.save(payload);
      case 'getLocationLayout':
        return check(await supabase.rpc('binnenapp_get_location_layout'));
      case 'assignProductLocation':
        return check(await supabase.rpc('binnenapp_assign_product_location', payload));
      case 'saveLocationLayout':
        return check(await supabase.rpc('binnenapp_save_location_layout', {p_racks:payload.racks,p_revision:payload.revision}));
      case 'getProductsAdmin': {
        const producten = check(await supabase.rpc('binnenapp_admin_products')) || [];
        return { items: producten.map(productToLegacyRow) };
      }
      case 'saveProduct': {
        const artikel = valideerArtikelPayload(payload);
        const opgeslagen = check(await supabase.rpc('binnenapp_save_product', {
          p_product_id: artikel.productId,
          p_expected_updated_at: artikel.expectedUpdatedAt,
          p_ean_code: artikel.eanCode,
          p_jb_code: artikel.jbCode,
          p_description: artikel.description,
          p_category: artikel.category,
          p_unit: artikel.unit,
          p_packaged_per: artikel.packagedPer,
          p_price_per_unit: artikel.pricePerUnit,
          p_stock: artikel.stock,
          p_min_stock: artikel.minStock,
          p_product_image_url: artikel.productImageUrl,
          p_source_image_url: artikel.sourceImageUrl,
          p_rack: artikel.rack,
          p_x_axis: artikel.xAxis,
          p_y_axis: artikel.yAxis,
          p_position: artikel.position,
          p_available: artikel.available
        }));
        return productToLegacyRow(opgeslagen || {});
      }
      case 'getStock':
        if (_cache.stock) { const d = _cache.stock; delete _cache.stock; return d; }
        return { items: (await getProducts()).map(productToLegacyRow) };
      case 'getCart':
        if (_cache.cart) { const d = _cache.cart; delete _cache.cart; return d; }
        return { items: await getCartRows() };
      case 'getOrders':
        if (_cache.orders) { const d = _cache.orders; delete _cache.orders; return d; }
        return { items: await getOrderRows() };
      case 'orderConfirmationPdf':
        return haalOrderBevestigingPdf(payload.orderNumber);
      case 'postCart':
        return syncCart(payload.items);
      case 'setStock': {
        const productId = Number(payload.productId || 0);
        const stock = Number(payload.stock);
        const expectedStock = Number(payload.expectedStock);
        if (!Number.isSafeInteger(productId) || productId <= 0) throw new Error('Ongeldig productnummer.');
        if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Ongeldige voorraad.');
        if (!Number.isInteger(expectedStock) || expectedStock < 0 || expectedStock > 1000000) throw new Error('Ongeldige huidige voorraad.');
        return check(await supabase.rpc('binnenapp_set_product_stock', {
          p_product_id: productId,
          p_stock: stock,
          p_expected_stock: expectedStock
        }));
      }
      case 'getRetour':
        if (_cache.retour) { const d = _cache.retour; delete _cache.retour; return { items: d.items }; }
        return { items: await getRetourRows() };
      case 'getCorrections':
        if (_cache.corrections) { const d = _cache.corrections; delete _cache.corrections; return { items: d.items }; }
        return { items: await getCorrectionRows() };
      case 'addCorrection':
        return check(await supabase.rpc('binnenapp_add_order_correction', {
          p_order_number: String(payload.orderNumber || ''),
          p_correction_type: String(payload.soort || ''),
          p_description: String(payload.naam || ''),
          p_ean_code: payload.eanCode || null,
          p_correct_quantity: payload.juisteAantal == null ? null : Number(payload.juisteAantal),
          p_note: payload.toelichting || null
        }));
      case 'resolveCorrection':
        return check(await supabase.rpc('binnenapp_set_order_correction_resolved', {
          p_id: String(payload.id || ''),
          p_resolved: !!payload.opgelost
        }));
      case 'getStatusDatums':
        if (_cache.statusDatums) { const d = _cache.statusDatums; delete _cache.statusDatums; return { items: d.items }; }
        return { items: await getStatusDatumRows() };
      case 'setStatusDatum':
        return check(await supabase.rpc('binnenapp_set_status_datum', {
          p_order_number: String(payload.orderNumber || ''),
          p_status: String(payload.status || ''),
          p_datum: String(payload.datum || '')
        }));
      case 'addNalevering':
        return check(await supabase.rpc('binnenapp_add_to_nalevering', {
          p_order_number: String(payload.orderNumber || ''),
          p_item_id: Number(payload.regelId || 0)
        }));
      case 'updateOrderDate':
        return check(await supabase.rpc('binnenapp_update_order_date', {
          p_order_number: String(payload.orderNumber || ''),
          p_date: String(payload.datum || '')
        }));
      case 'updateExpectedDeliveryDate': {
        const bestelnummer = String(payload.orderNumber || '').trim();
        if (!/^#ORD-[A-Za-z0-9-]{6,40}$/.test(bestelnummer)) {
          throw new Error('Ongeldig bestelnummer voor de verwachte leverdatum.');
        }
        // De oorspronkelijke datum is verplicht om wijzigingen van collega's te beschermen.
        const datum = valideerVerwachteLeverdatum(payload.datum);
        const oorspronkelijkeDatum = valideerVerwachteLeverdatum(payload.verwachteDatum);
        const resultaat = check(await supabase.rpc('binnenapp_update_expected_delivery_date', {
          p_order_number: bestelnummer,
          p_date: datum,
          p_expected_date: oorspronkelijkeDatum
        }));
        delete _cache.orders;
        return resultaat;
      }
      case 'removeCorrection':
        return check(await supabase.rpc('binnenapp_remove_order_correction', {
          p_id: String(payload.id || '')
        }));
      case 'addRetour':
        return check(await supabase.rpc('binnenapp_add_retour_item', {
          p_order_number: String(payload.orderNumber || ''),
          p_description: String(payload.naam || ''),
          p_ean_code: payload.eanCode || null,
          p_jb_code: payload.jbCode || null,
          p_quantity: Number(payload.aantal || 1),
          p_unit: payload.eenheid || null,
          p_product_image_url: payload.foto || null
        }));
      case 'updateRetour':
        return check(await supabase.rpc('binnenapp_update_retour_item', {
          p_id: String(payload.id || ''),
          p_quantity: payload.aantal == null ? null : Number(payload.aantal),
          p_reason: payload.reden == null ? null : String(payload.reden)
        }));
      case 'removeRetour':
        return check(await supabase.rpc('binnenapp_remove_retour_item', {
          p_id: String(payload.id || '')
        }));
      case 'clearRetour':
        return check(await supabase.rpc('binnenapp_clear_retour'));
      case 'submitOrder':
        return check(await supabase.rpc('binnenapp_place_order', {
          p_order_number: String(payload.orderNumber || ''),
          p_requester_name: payload.aanvragerNaam || payload.customerName || '',
          p_requester_email: payload.aanvragerEmail || payload.customerEmail || '',
          p_team: payload.ploeg || payload.team || 'Binnenploeg',
          p_reference: payload.referentie || null,
          p_delivery_date: payload.leverdatum || null
        }));
      case 'orderMailStatus':
        return check(await supabase.rpc('binnenapp_order_mail_status', {
          p_order_number: payload.orderNumber ? String(payload.orderNumber) : null
        })) || [];
      case 'orderMailControle': {
        const { data, error } = await supabase.functions.invoke('send-order-mail', {
          body: { actie: 'status', orderNumber: String(payload.orderNumber || '') }
        });
        if (error) {
          let detail = 'De mailstatus kon niet worden gecontroleerd. Probeer het later opnieuw.';
          try { const antwoord = await error.context?.json?.(); if (antwoord?.error) detail = antwoord.error; }
          catch { /* Het vorige resultaat blijft zichtbaar bij een netwerkfout. */ }
          throw new Error(detail);
        }
        return data || { status: null };
      }
      case 'orderMail': {
        const to = String(payload.aanvragerEmail || payload.customerEmail || '').trim();
        if (!to) return { sent: false, error: 'Geen e-mailadres opgegeven' };

        // Edge Function draait met verify_jwt, dus er moet een sessie zijn
        const session = (await supabase.auth.getSession())?.data?.session || null;
        if (!session) return { sent: false, error: 'Niet ingelogd - geen sessie' };

        const mailItems = (Array.isArray(payload.items) ? payload.items : []).map(item => ({
          omschrijving: item.omschrijving || item.Omschrijving || item.naam || 'Artikel',
          aantal: Number(item.aantal ?? item.Aantal ?? 0),
          eenheid: item.eenheid || item.Eenheid || 'st',
          jbCode: item.jbCode || item.JBCode || '',
          eanCode: item.eanCode || item.EANcode || '',
          foto: item.productFoto || item.ProductFoto || ''
        }));

        const { data, error } = await supabase.functions.invoke('send-order-mail', {
          body: {
            to,
            orderNumber: String(payload.orderNumber || ''),
            besteldDoor: payload.aanvragerNaam || payload.besteldDoor || '',
            referentie: payload.referentie || '',
            leverdatum: payload.leverdatumTekst || payload.leverdatum || '',
            items: mailItems
          }
        });
        if (error) {
          // De echte reden zit in het antwoord van de functie, niet in error.message
          let detail = error.message || 'onbekende fout';
          try {
            const body = await error.context?.json?.();
            if (body?.error) detail = body.error;
          } catch { /* geen JSON-body beschikbaar */ }
          console.warn('[orderMail] versturen mislukt:', detail);
          return { sent: false, onzeker: true, error: detail };
        }
        return data || { sent: false, onzeker: true, error: 'Geen verzendbevestiging ontvangen.' };
      }
      case 'updateOrder':
        return check(await supabase.rpc('binnenapp_update_order_status', {
          p_order_number: String(payload.orderNumber || ''),
          p_status: normalizeStatus(payload.status || payload.listStatus || '')
        }));
      case 'orderMap':
      case 'orderConfirmationMetadata':
        return updateConfirmation(payload);
      default:
        throw new Error('Onbekend Supabase-verzoek.');
    }
  });

  ipcMain.handle('supabase-upload-confirmation', async (_event, input = {}) => {
    const orderNumber = valideerPdfBestelnummer(input.orderNumber);
    const originalName = path.posix.basename(String(input.name || input.fileName || 'orderbevestiging.pdf').replace(/\\/g, '/'))
      .replace(/[\u0000-\u001f\u007f]/g, '').slice(-180) || 'orderbevestiging.pdf';
    const mimeType = String(input.mimeType || input.contentType || 'application/pdf');
    const bytes = leesPdfInvoer(input.bytes);
    valideerPdfBestand(bytes, mimeType);
    // Voorkom een losse upload bij een niet-bestaande of ontoegankelijke order.
    await leesOrderBevestiging(orderNumber);
    const safeOrder = orderNumber.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
    const safeName = originalName.replace(/[^a-z0-9_.-]/gi, '_').slice(-180);
    const objectPath = `${safeOrder}/${Date.now()}-${safeName}`;
    check(await supabase.storage.from('order-confirmations').upload(objectPath, bytes, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false
    }));
    try {
      await updateConfirmation({
        orderNumber,
        confirmed: true,
        leysOrderNumber: input.leysOrderNumber || null,
        pdfPath: objectPath,
        pdfName: originalName
      });
    } catch {
      // De RPC kan ondanks een netwerkfout al geslaagd zijn: nooit automatisch
      // verwijderen of opnieuw uploaden bij een onzekere koppeling.
      throw new Error('De PDF is opgeslagen, maar de koppeling aan de bestelling kon niet worden bevestigd. Ververs de bestelling voordat je opnieuw uploadt; het bestand is niet verwijderd.');
    }
    return { path: objectPath, name: originalName };
  });

  // ─── Prefetch voor splash screen ──────────────────────────────────────

  // Een enkele hangende query mag het opstarten nooit blokkeren. Wat niet op
  // tijd binnen is, wordt overgeslagen; de app haalt het daarna alsnog op via
  // de normale verversing.
  const PREFETCH_TIMEOUT_MS = 12000;

  function metTimeout(promise, naam) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Duurde te lang: ' + naam)), PREFETCH_TIMEOUT_MS);
      })
    ]);
  }

  async function prefetchAll(onProgress) {
    let klaar = 0;
    const onderdelen = [
      { sleutel: 'corrections', naam: 'Foutmeldingen', laad: getCorrectionRows },
      { sleutel: 'statusDatums', naam: 'Statusdatums', laad: getStatusDatumRows },
      { sleutel: 'retour',      naam: 'Retourlijst',   laad: getRetourRows },
      { sleutel: 'stock',       naam: 'Producten',     laad: async () => (await getProducts()).map(productToLegacyRow) },
      { sleutel: 'cart',        naam: 'Winkelwagen',   laad: getCartRows },
      { sleutel: 'orders',      naam: 'Bestellingen',  laad: getOrderRows }
    ];
    const TOTAAL = onderdelen.length;
    const result = { stock: null, cart: null, orders: null, retour: null, corrections: null, statusDatums: null };

    await Promise.all(onderdelen.map(async onderdeel => {
      try {
        const items = await metTimeout(onderdeel.laad(), onderdeel.naam);
        result[onderdeel.sleutel] = { items };
        _cache[onderdeel.sleutel] = { items };
        klaar++;
        onProgress?.(klaar, TOTAAL, onderdeel.naam + ' geladen');
      } catch (err) {
        // Mislukt of te traag: overslaan, niet blokkeren
        console.warn('[prefetch] ' + onderdeel.naam + ' overgeslagen:', err.message);
        klaar++;
        onProgress?.(klaar, TOTAAL, onderdeel.naam + ' overgeslagen');
      }
    }));

    return result;
  }

  return { prefetchAll };
}

module.exports = { registerSupabaseHandlers };
