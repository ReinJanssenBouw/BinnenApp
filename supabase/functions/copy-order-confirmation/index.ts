// Een wachtrijtoken geeft uitsluitend toegang tot één reeds vastgelegde kopieertaak.
// Deze functie accepteert geen vrije opslagpaden, ontvangers of downloadadressen.
const PROJECT_URL = 'https://binnenapp-nog-instellen.invalid';
const MICROSOFT_HOST = 'default3b64c7b3fe4444f4959224fb18576e.96.environment.api.powerplatform.com';
const MICROSOFT_PAD = '/powerautomate/automations/direct/cu/17/workflows/c9cacb781484404b99f56be517f6d130/triggers/manual/paths/invoke';
const UUID_PATROON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

type Voorwerp = Record<string, unknown>;
type Termijnen = { verzoek: number; database: number; downloaden: number; verzenden: number };
type Afhankelijkheden = { leesOmgeving: (naam: string) => string | undefined; aanvraag?: typeof fetch; termijnen?: Termijnen };
type Kopieertaak = { id: string; poging_id: string; object_id: string; order_number: string; opslagpad: string; bestandsnaam: string };

type DenoOmgeving = { env: { get: (naam: string) => string | undefined }; serve: (afhandelaar: (verzoek: Request) => Promise<Response>) => void };

class VeiligeFout extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'VeiligeFout';
  }
}

function antwoord(status: number, gegevens: Voorwerp): Response {
  return new Response(JSON.stringify(gegevens), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function valideerMicrosoftAdres(waarde: string | undefined): string {
  try {
    if (typeof waarde !== 'string') throw new VeiligeFout('configuratie_ongeldig');
    const adres = new URL(waarde);
    const namen = ['api-version', 'sp', 'sv', 'sig'];
    if (adres.protocol !== 'https:' || adres.hostname !== MICROSOFT_HOST ||
        adres.port || adres.username || adres.password || adres.hash ||
        adres.pathname !== MICROSOFT_PAD || [...adres.searchParams.keys()].length !== 4 ||
        namen.some(naam => adres.searchParams.getAll(naam).length !== 1 ||
          !adres.searchParams.get(naam)?.trim())) {
      throw new VeiligeFout('configuratie_ongeldig');
    }
    return adres.href;
  } catch {
    // Een URL-fout mag nooit het geheime aanroepadres in een foutmelding opnemen.
    throw new VeiligeFout('configuratie_ongeldig');
  }
}

function wachtMetAfbreking<T>(belofte: Promise<T>, signaal: AbortSignal): Promise<T> {
  return new Promise<T>((slagen, mislukken) => {
    const afgebroken = () => {
      signaal.removeEventListener('abort', afgebroken);
      mislukken(new VeiligeFout('wachttijd_verstreken'));
    };
    if (signaal.aborted) return afgebroken();
    signaal.addEventListener('abort', afgebroken, { once: true });
    Promise.resolve(belofte).then(
      waarde => { signaal.removeEventListener('abort', afgebroken); slagen(waarde); },
      fout => { signaal.removeEventListener('abort', afgebroken); mislukken(fout instanceof VeiligeFout ? fout : new VeiligeFout('aanvraag_mislukt')); },
    );
  });
}

async function metTijdslimiet<T>(duur: number, handeling: (signaal: AbortSignal) => Promise<T>): Promise<T> {
  const regelaar = new AbortController();
  const klok = setTimeout(() => regelaar.abort(), duur);
  try {
    return await wachtMetAfbreking(handeling(regelaar.signal), regelaar.signal);
  } finally {
    clearTimeout(klok);
    regelaar.abort();
  }
}

async function leesBegrensd(bericht: Request | Response, maximum: number, signaal: AbortSignal): Promise<Uint8Array> {
  const opgegevenLengte = bericht.headers.get('content-length');
  if (opgegevenLengte !== null && (!/^\d+$/.test(opgegevenLengte) || Number(opgegevenLengte) > maximum)) {
    bericht.body?.cancel().catch(() => {});
    throw new VeiligeFout('bericht_te_groot');
  }
  if (!bericht.body) return new Uint8Array();
  const lezer = bericht.body.getReader();
  const delen: Uint8Array[] = [];
  let lengte = 0;
  try {
    while (true) {
      const deel = await wachtMetAfbreking(lezer.read(), signaal);
      if (deel.done) break;
      lengte += deel.value.byteLength;
      if (lengte > maximum) throw new VeiligeFout('bericht_te_groot');
      delen.push(deel.value);
    }
    const bytes = new Uint8Array(lengte);
    let positie = 0;
    for (const deel of delen) { bytes.set(deel, positie); positie += deel.byteLength; }
    return bytes;
  } catch {
    lezer.cancel().catch(() => {});
    throw new VeiligeFout('bericht_onleesbaar');
  } finally {
    lezer.releaseLock();
  }
}

async function leesJson(bericht: Request | Response, maximum: number, signaal: AbortSignal): Promise<unknown> {
  const bytes = await leesBegrensd(bericht, maximum, signaal);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new VeiligeFout('antwoord_ongeldig'); }
}

function isVoorwerp(waarde: unknown): waarde is Voorwerp {
  return waarde !== null && typeof waarde === 'object' && !Array.isArray(waarde);
}

export function isVeiligeDoelnaam(naam: unknown): naam is string {
  // De leesbare doelnaam staat los van het strikte, bestaande Supabase-bronpad.
  // Oude wachtrijtaken behouden hun oorspronkelijke BinnenApp-bestandsnaam.
  if (typeof naam !== 'string' || new TextEncoder().encode(naam).byteLength > 255 ||
      naam !== naam.trim() || naam.includes('..') || naam.toLowerCase().includes('_vti_') ||
      /[\\/"*:<>?|%#\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(naam) ||
      /[\s.]$/u.test(naam.slice(0, -4))) return false;
  if (/^BinnenApp-ORD-[A-Za-z0-9-]+\.pdf$/.test(naam)) return true;
  const delen = /^leys - [0-9]{6} - order (.+) - (.+)\.pdf$/u.exec(naam);
  return delen !== null && delen[1].trim().length > 0 && delen[2].trim().length > 0;
}

export function valideerTaak(taak: Voorwerp, id: string): string {
  if (!isVoorwerp(taak) || taak.id !== id ||
      typeof taak.poging_id !== 'string' || !UUID_PATROON.test(taak.poging_id) ||
      typeof taak.object_id !== 'string' || !UUID_PATROON.test(taak.object_id) ||
      typeof taak.order_number !== 'string' || !/^#ORD-[A-Za-z0-9-]{6,40}$/.test(taak.order_number) ||
      typeof taak.opslagpad !== 'string' || typeof taak.bestandsnaam !== 'string') {
    throw new VeiligeFout('bronpad_ongeldig');
  }
  const delen = taak.opslagpad.split('/');
  const ordermap = taak.order_number.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
  const veiligeBronnaam = /^[A-Za-z0-9_.-]{1,220}\.pdf$/i;
  if (delen.length !== 2 || delen[0] !== ordermap || !veiligeBronnaam.test(delen[1]) ||
      !isVeiligeDoelnaam(taak.bestandsnaam)) {
    throw new VeiligeFout('bronpad_ongeldig');
  }
  return `${PROJECT_URL}/storage/v1/object/authenticated/order-confirmations/${delen.map(encodeURIComponent).join('/')}`;
}

function naarBase64(bytes: Uint8Array): string {
  let binair = '';
  // Kleine stukken voorkomen een te grote argumentenlijst bij PDF's van 10 MiB.
  for (let positie = 0; positie < bytes.length; positie += 16384) {
    binair += String.fromCharCode(...bytes.subarray(positie, positie + 16384));
  }
  return btoa(binair);
}

export function maakAfhandelaar({
  leesOmgeving,
  aanvraag = fetch,
  termijnen = { verzoek: 5000, database: 12000, downloaden: 20000, verzenden: 35000 },
}: Afhankelijkheden): (verzoek: Request) => Promise<Response> {
  return async function verwerkKopieerverzoek(verzoek: Request): Promise<Response> {
    if (verzoek.method !== 'POST') return antwoord(405, { ok: false, code: 'alleen_post' });
    if (verzoek.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return antwoord(400, { ok: false, code: 'verzoek_ongeldig' });
    }
    let invoer: { id: string; token: string };
    try {
      const gegevens = await metTijdslimiet(termijnen.verzoek, signaal => leesJson(verzoek, 1024, signaal));
      if (!isVoorwerp(gegevens) || Object.keys(gegevens).sort().join(',') !== 'id,token' ||
          typeof gegevens.id !== 'string' || typeof gegevens.token !== 'string' ||
          !UUID_PATROON.test(gegevens.id) || !UUID_PATROON.test(gegevens.token)) {
        throw new VeiligeFout('verzoek_ongeldig');
      }
      invoer = { id: gegevens.id, token: gegevens.token };
    } catch { return antwoord(400, { ok: false, code: 'verzoek_ongeldig' }); }

    let sleutel: string;
    let microsoftAdres: string;
    try {
      const omgevingssleutel = leesOmgeving('SUPABASE_SERVICE_ROLE_KEY');
      if (leesOmgeving('SUPABASE_URL') !== PROJECT_URL || typeof omgevingssleutel !== 'string' || !omgevingssleutel.trim()) {
        throw new VeiligeFout('configuratie_ongeldig');
      }
      sleutel = omgevingssleutel;
      microsoftAdres = valideerMicrosoftAdres(leesOmgeving('ORDER_PDF_POWER_AUTOMATE_URL'));
    } catch { return antwoord(503, { ok: false, code: 'configuratie_ongeldig' }); }

    const beveiligdeHeaders = { apikey: sleutel, Authorization: `Bearer ${sleutel}` };
    const rpc = (actie: string, pogingId: string | null = null, resultaat: string | null = null): Promise<unknown> => metTijdslimiet(termijnen.database, async signaal => {
      const reactie = await aanvraag(`${PROJECT_URL}/rest/v1/rpc/binnenapp_order_pdf_kopie_werk`, {
        method: 'POST', redirect: 'error', signal: signaal,
        headers: { ...beveiligdeHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: invoer.id, p_token: invoer.token, p_actie: actie,
          p_poging_id: pogingId, p_resultaat: resultaat }),
      });
      if (!reactie.ok) {
        reactie.body?.cancel().catch(() => {});
        throw new VeiligeFout('database_niet_beschikbaar');
      }
      return await leesJson(reactie, 16384, signaal);
    });

    let taak: unknown;
    try { taak = await rpc('claim'); }
    catch { return antwoord(503, { ok: false, code: 'wachtrij_niet_beschikbaar' }); }
    // De RPC bevestigt zowel het geheime token als de unieke overgang naar voorbereiden.
    if (!isVoorwerp(taak) || taak.mag_voorbereiden !== true) {
      return antwoord(202, { ok: true, status: 'geen_nieuwe_poging' });
    }

    const geclaimdeTaak = taak;
    const meldVoorbereidingsfout = async (code: string): Promise<Response> => {
      try {
        if (typeof geclaimdeTaak.poging_id === 'string' && UUID_PATROON.test(geclaimdeTaak.poging_id)) {
          await rpc('voorbereidingsfout', geclaimdeTaak.poging_id, code);
        }
      } catch { /* De wachtrij herstelt achtergebleven voorbereiding na de bewaakte termijn. */ }
      return antwoord(503, { ok: false, code });
    };
    let inhoud: string;
    let gevalideerdeTaak: Kopieertaak;
    try {
      const bronAdres = valideerTaak(taak, invoer.id);
      gevalideerdeTaak = taak as Kopieertaak;
      let bytes;
      try {
        bytes = await metTijdslimiet(termijnen.downloaden, async signaal => {
          const reactie = await aanvraag(bronAdres, {
            method: 'GET', headers: beveiligdeHeaders, redirect: 'error', signal: signaal,
          });
          if (!reactie.ok) {
            reactie.body?.cancel().catch(() => {});
            throw new VeiligeFout('bron_niet_beschikbaar');
          }
          if (reactie.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') {
            reactie.body?.cancel().catch(() => {});
            throw new VeiligeFout('pdf_ongeldig');
          }
          try { return await leesBegrensd(reactie, MAX_PDF_BYTES, signaal); }
          catch { throw new VeiligeFout('pdf_ongeldig'); }
        });
      } catch (fout) {
        if (fout instanceof VeiligeFout && fout.message === 'pdf_ongeldig') throw fout;
        throw new VeiligeFout('bron_niet_beschikbaar');
      }
      const begin = String.fromCharCode(...bytes.subarray(0, 1024));
      if (!bytes.length || !/%PDF-[12]\.\d/.test(begin)) throw new VeiligeFout('pdf_ongeldig');
      inhoud = JSON.stringify({ orderNumber: taak.order_number, fileName: taak.bestandsnaam, fileContent: naarBase64(bytes) });
    } catch (fout) {
      const code = fout instanceof VeiligeFout && ['bronpad_ongeldig', 'bron_niet_beschikbaar', 'pdf_ongeldig'].includes(fout.message)
        ? fout.message : 'voorbereiding_mislukt';
      return await meldVoorbereidingsfout(code);
    }

    // Deze vastgelegde reservering voorkomt dubbele POST's, ook na crashes en time-outs.
    // SQL controleert hier opnieuw of de order nog aan hetzelfde onveranderlijke opslagobject is gekoppeld.
    try {
      const toestemming = await rpc('verzenden', gevalideerdeTaak.poging_id);
      if (!isVoorwerp(toestemming) || toestemming.mag_verzenden !== true ||
          toestemming.id !== taak.id || toestemming.poging_id !== taak.poging_id) {
        return antwoord(202, { ok: true, status: 'niet_verzonden' });
      }
    } catch {
      // Bij een onzekere reservering is opnieuw versturen onveilig: de wachtrij beslist verder.
      return antwoord(503, { ok: false, code: 'verzendreservering_onbekend' });
    }

    let opgeslagen = false;
    try {
      opgeslagen = await metTijdslimiet(termijnen.verzenden, async signaal => {
        const reactie = await aanvraag(microsoftAdres, {
          method: 'POST', redirect: 'error', signal: signaal,
          // Microsoft krijgt uitsluitend de PDF en bestandsnaam, nooit een Supabase-sleutel.
          headers: { 'Content-Type': 'application/json' }, body: inhoud,
        });
        if (reactie.status !== 200) {
          reactie.body?.cancel().catch(() => {});
          return false;
        }
        const uitslag = await leesJson(reactie, 4096, signaal);
        return isVoorwerp(uitslag) && Object.keys(uitslag).sort().join(',') === 'file,ok' &&
          uitslag.ok === true && uitslag.file === 'uploaded';
      });
    } catch { /* Na iedere onzekere externe poging volgt géén automatische herhaling. */ }

    try { await rpc('resultaat', gevalideerdeTaak.poging_id, opgeslagen ? 'opgeslagen' : 'onbekend'); }
    catch {
      return antwoord(503, { ok: false, code: 'resultaatregistratie_onbekend' });
    }
    return opgeslagen
      ? antwoord(200, { ok: true, status: 'opgeslagen' })
      : antwoord(202, { ok: false, status: 'onbekend' });
  };
}

const denoOmgeving = (globalThis as typeof globalThis & { Deno?: DenoOmgeving }).Deno;
if (denoOmgeving) {
  denoOmgeving.serve(maakAfhandelaar({ leesOmgeving: naam => denoOmgeving.env.get(naam) }));
}
