'use strict';

const https = require('https');
const { valideerUpdateBeleid, vergelijkVersies, isUpdateVerplicht } = require('./update-beleid');

const BELEID_URL = 'https://github.com/ReinJanssenBouw/BinnenApp/releases/latest/download/binnenapp-updatebeleid.json';
const BELEID_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
const CONTROLE_INTERVAL = 120000;
const MAX_WACHTTIJD = 15 * 60000;

// Alleen de vaste openbare releasebijlage lezen; redirects mogen geen willekeurige
// adressen, protocollen of inloggegevens introduceren.
function toegestaneBeleidUrl(waarde) {
  const url = new URL(waarde);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !BELEID_HOSTS.has(url.hostname)) {
    throw new Error('Ongeldig adres voor updatebeleid.');
  }
  if (url.hostname === 'github.com' && !/^\/ReinJanssenBouw\/BinnenApp\/releases\/(?:latest\/download|download\/v\d+\.\d+\.\d+)\/binnenapp-updatebeleid\.json$/.test(url.pathname)) {
    throw new Error('Het updatebeleid komt niet uit de officiële BinnenApp-release.');
  }
  return url;
}

function haalUpdateBeleid({ verbinding = https, timers = globalThis, nu = Date.now } = {}) {
  return new Promise((resolve, reject) => {
    let klaar = false;
    let verzoek = null;
    const noodrem = timers.setTimeout(() => afronden(new Error('Updatecontrole duurde te lang.')), 12000);
    function afronden(fout, waarde) {
      if (klaar) return;
      klaar = true;
      timers.clearTimeout(noodrem);
      if (fout) {
        verzoek?.destroy();
        reject(fout);
      } else resolve(waarde);
    }
    function ophalen(adres, omleidingen) {
      if (klaar) return;
      let url;
      try { url = toegestaneBeleidUrl(adres); } catch (fout) { afronden(fout); return; }
      try {
        verzoek = verbinding.get(url, {
          headers: { 'User-Agent': 'BinnenApp-Updater', 'Accept': 'application/json', 'Cache-Control': 'no-cache, no-store' }
        }, antwoord => {
          if (klaar) { antwoord.resume(); return; }
          antwoord.on('error', fout => afronden(fout));
          if ([301, 302, 303, 307, 308].includes(antwoord.statusCode)) {
            antwoord.resume();
            if (omleidingen >= 4 || !antwoord.headers.location) { afronden(new Error('Te veel omleidingen bij updatecontrole.')); return; }
            try { ophalen(new URL(antwoord.headers.location, url).href, omleidingen + 1); } catch (fout) { afronden(fout); }
            return;
          }
          if (antwoord.statusCode !== 200) { antwoord.resume(); afronden(new Error('Het updatebeleid is tijdelijk niet beschikbaar.')); return; }
          if (Number(antwoord.headers['content-length']) > 32768) { antwoord.resume(); afronden(new Error('Het updatebeleid is te groot.')); return; }
          const delen = [];
          let lengte = 0;
          antwoord.on('data', deel => {
            if (klaar) return;
            lengte += deel.length;
            if (lengte > 32768) { afronden(new Error('Het updatebeleid is te groot.')); return; }
            delen.push(Buffer.from(deel));
          });
          antwoord.on('aborted', () => afronden(new Error('Updatecontrole is onderbroken.')));
          antwoord.on('end', () => {
            if (klaar) return;
            try { afronden(null, valideerUpdateBeleid(JSON.parse(Buffer.concat(delen).toString('utf8')))); }
            catch (fout) { afronden(fout); }
          });
        });
        verzoek.on('error', fout => afronden(fout));
      } catch (fout) { afronden(fout); }
    }
    ophalen(`${BELEID_URL}?controle=${nu()}`, 0);
  });
}

function maakUpdateBeheer({
  updater, versie, actief = true, leesBeleid = haalUpdateBeleid,
  onStatus = () => {}, onVerplichtGereed = () => {},
  logWaarschuwing = () => {}, timers = globalThis, nu = Date.now,
  afsluiten = () => {}
}) {
  vergelijkVersies(versie, versie);
  let status = { fase: 'rust', versie: null, verplicht: false, blokkeren: false, percent: null, fout: null };
  let bezig = null;
  let gestopt = false;
  let gestart = false;
  let volgendeControle = 0;
  let mislukt = 0;
  let klok = null;
  let download = null;
  let gereed = null;
  let installatie = null;
  let installatieNummer = 0;
  let laatstGemeld = null;
  let genegeerdeMislukteAfsluiting = false;
  let mislukteAfsluitTimer = null;

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;

  function publiceer(wijziging) {
    if (gestopt) return;
    status = { ...status, ...wijziging };
    onStatus({ ...status });
  }
  function snapshot() { return { ...status }; }
  function melding(fout) { logWaarschuwing(fout instanceof Error ? fout.message : String(fout)); }
  function toonGereed(fout = null) {
    if (!gereed) return;
    const verplicht = isUpdateVerplicht(gereed.beleid, versie);
    publiceer({ fase: 'gereed', versie: gereed.beleid.versie, verplicht, blokkeren: verplicht, percent: 100, fout });
    if (verplicht && laatstGemeld !== gereed.beleid.versie) {
      laatstGemeld = gereed.beleid.versie;
      onVerplichtGereed();
    }
  }
  function downloadVoortgang(bericht) {
    if (!download || installatie || !Number.isFinite(bericht?.percent)) return;
    publiceer({ percent: Math.max(0, Math.min(100, Math.round(bericht.percent))) });
  }
  function downloadGereed(bericht) {
    if (!download || bericht?.version !== download.beleid.versie) return;
    // Dit evenement wordt pas na de hash-/handtekeningcontrole van de updater
    // afgegeven. Daarnaast wachten we hieronder op de volledige downloadbelofte.
    download.bewezenVersie = bericht.version;
  }
  function installatieFout(fout) {
    if (!installatie || gestopt) return;
    melding(fout);
    timers.clearTimeout(installatie.noodrem);
    if (installatie.afrondTimer) timers.clearTimeout(installatie.afrondTimer);
    if (!installatie.afsluitGevraagd) {
      // BaseUpdater kan zijn setImmediate(app.quit) al ingepland hebben terwijl
      // de startfout eerder binnenkomt. Alleen die korte nasleep onderscheppen.
      genegeerdeMislukteAfsluiting = true;
      timers.clearTimeout(mislukteAfsluitTimer);
      mislukteAfsluitTimer = timers.setTimeout(() => { genegeerdeMislukteAfsluiting = false; }, 1000);
    }
    installatie = null;
    // electron-updater 6.8.3 herstelt deze vlag niet bij een asynchrone NSIS-fout.
    updater.quitAndInstallCalled = false;
    toonGereed('Opnieuw opstarten is niet gelukt. Probeer het opnieuw.');
  }
  function updateFout(fout) {
    if (installatie) { installatieFout(fout); return; }
    if (download) download.fout = fout;
    melding(fout);
  }
  updater.on('download-progress', downloadVoortgang);
  updater.on('update-downloaded', downloadGereed);
  updater.on('error', updateFout);

  async function voerControleUit() {
    try {
      // Een verplichte, gecontroleerde installer blijft beschikbaar tot de
      // gebruiker herstart. Een volgende release mag deze cache niet vervangen
      // en de verplichte blokkade bij een downloadfout niet laten verdwijnen.
      if (gereed && isUpdateVerplicht(gereed.beleid, versie)) return;
      const beleid = valideerUpdateBeleid(await leesBeleid());
      if (gestopt || installatie) return;
      if (vergelijkVersies(beleid.versie, versie) <= 0) {
        // Een al bewezen nieuwer installatiebestand niet door een CDN-terugval
        // vervangen of ontgrendelen; wachten op een bruikbaar nieuw beleid.
        if (!gereed) publiceer({ fase: 'rust', versie: null, verplicht: false, blokkeren: false, percent: null, fout: null });
        mislukt = 0;
        return;
      }
      if (gereed && beleid.versie === gereed.beleid.versie) {
        gereed.beleid = beleid;
        toonGereed(status.fout);
        mislukt = 0;
        return;
      }
      if (gereed && vergelijkVersies(beleid.versie, gereed.beleid.versie) < 0) return;
      const resultaat = await updater.checkForUpdates();
      if (gestopt || installatie) return;
      if (!resultaat?.isUpdateAvailable || resultaat.updateInfo?.version !== beleid.versie) {
        throw new Error('Updatebestand en updatebeleid hebben nog niet dezelfde versie.');
      }
      gereed = null;
      download = { beleid, bewezenVersie: null, fout: null, annuleren: resultaat.cancellationToken };
      publiceer({ fase: 'downloaden', versie: beleid.versie, verplicht: isUpdateVerplicht(beleid, versie), blokkeren: false, percent: 0, fout: null });
      await updater.downloadUpdate(resultaat.cancellationToken);
      if (gestopt) return;
      if (download.fout || download.bewezenVersie !== beleid.versie || !updater.installerPath) {
        throw download.fout || new Error('Het installatiebestand is nog niet volledig gecontroleerd.');
      }
      if (!oorspronkelijkeSpawnLog) {
        throw new Error('Deze updater ondersteunt geen gecontroleerde herstart.');
      }
      gereed = { beleid };
      download = null;
      mislukt = 0;
      toonGereed();
    } catch (fout) {
      if (gestopt) return;
      melding(fout);
      download = null;
      mislukt = Math.min(mislukt + 1, 4);
      if (!gereed) publiceer({ fase: 'fout', versie: null, verplicht: false, blokkeren: false, percent: null, fout: 'Updatecontrole is tijdelijk niet gelukt. BinnenApp probeert het later opnieuw.' });
    } finally {
      volgendeControle = nu() + Math.min(CONTROLE_INTERVAL * 2 ** mislukt, MAX_WACHTTIJD);
    }
  }
  function controleer() {
    if (!actief || gestopt || installatie || nu() < volgendeControle) return Promise.resolve();
    if (bezig) return bezig;
    bezig = voerControleUit().finally(() => { bezig = null; });
    return bezig;
  }
  function planControle() {
    if (gestopt || !gestart) return;
    klok = timers.setTimeout(async () => {
      await controleer();
      planControle();
    }, Math.max(1000, volgendeControle - nu()));
    klok?.unref?.();
  }
  function start() {
    if (gestart || gestopt || !actief) return;
    gestart = true;
    controleer().finally(planControle);
  }

  // NSIS start een apart proces en meldt startfouten asynchroon. De bestaande
  // spawnLog-belofte blijft ongewijzigd; we observeren alleen wanneer die start
  // gelukt is. Zo sluit Electron niet vóór een eventuele startfout af.
  const oorspronkelijkeSpawnLog = typeof updater.spawnLog === 'function' ? updater.spawnLog : null;
  function planInstallatieAfronden() {
    const poging = installatie;
    if (!poging || !poging.afsluitGevraagd || poging.openstaand || !poging.gestart) return;
    if (poging.afrondTimer) timers.clearTimeout(poging.afrondTimer);
    poging.afrondTimer = timers.setTimeout(() => {
      if (installatie !== poging || poging.openstaand || !poging.gestart) return;
      timers.clearTimeout(poging.noodrem);
      poging.magAfsluiten = true;
      afsluiten();
    }, 0);
  }
  const bewaakteSpawnLog = function (...argumenten) {
    const poging = installatie;
    const uitkomst = oorspronkelijkeSpawnLog.apply(this, argumenten);
    if (!poging || !uitkomst || typeof uitkomst.then !== 'function') return uitkomst;
    poging.openstaand++;
    uitkomst.then(() => {
      if (installatie !== poging) return;
      poging.openstaand--;
      poging.gestart = true;
      planInstallatieAfronden();
    }, () => {
      if (installatie !== poging) return;
      poging.openstaand--;
      // De updater mag eerst zelf zijn bestaande elevatiepoging uitvoeren.
      planInstallatieAfronden();
    });
    return uitkomst;
  };
  if (oorspronkelijkeSpawnLog) updater.spawnLog = bewaakteSpawnLog;

  function herstart() {
    if (gestopt || !gereed || !updater.installerPath || status.fase !== 'gereed' || installatie) {
      return { ok: false, fout: 'De update is nog niet gereed om opnieuw op te starten.' };
    }
    if (!oorspronkelijkeSpawnLog) {
      toonGereed('Deze updater kan niet veilig opnieuw opstarten. Sluit BinnenApp en probeer opnieuw.');
      return { ok: false, fout: 'Veilig opnieuw opstarten is niet beschikbaar.' };
    }
    const poging = { nummer: ++installatieNummer, openstaand: 0, gestart: false, afsluitGevraagd: false, magAfsluiten: false, afrondTimer: null };
    genegeerdeMislukteAfsluiting = false;
    timers.clearTimeout(mislukteAfsluitTimer);
    installatie = poging;
    poging.noodrem = timers.setTimeout(() => {
      if (installatie === poging) installatieFout(new Error('Start van het installatieprogramma is niet bevestigd.'));
    }, 15000);
    publiceer({ fase: 'installeren', fout: null });
    try { updater.quitAndInstall(true, true); }
    catch (fout) { installatieFout(fout); }
    return installatie === poging ? { ok: true } : { ok: false, fout: status.fout };
  }
  function voorAfsluiten(gebeurtenis) {
    if (genegeerdeMislukteAfsluiting) {
      genegeerdeMislukteAfsluiting = false;
      timers.clearTimeout(mislukteAfsluitTimer);
      gebeurtenis.preventDefault();
      return;
    }
    if (!installatie || installatie.magAfsluiten) return;
    gebeurtenis.preventDefault();
    installatie.afsluitGevraagd = true;
    planInstallatieAfronden();
  }
  function stop() {
    if (gestopt) return;
    gestopt = true;
    timers.clearTimeout(klok);
    timers.clearTimeout(mislukteAfsluitTimer);
    if (installatie) {
      timers.clearTimeout(installatie.noodrem);
      timers.clearTimeout(installatie.afrondTimer);
    }
    download?.annuleren?.cancel?.();
    updater.removeListener('download-progress', downloadVoortgang);
    updater.removeListener('update-downloaded', downloadGereed);
    updater.removeListener('error', updateFout);
    // Een annulering kan na het opruimen nog een fout uitsturen tijdens afsluiten.
    updater.on('error', melding);
    if (updater.spawnLog === bewaakteSpawnLog) updater.spawnLog = oorspronkelijkeSpawnLog;
  }
  return { start, controleer, snapshot, herstart, voorAfsluiten, stop };
}

module.exports = { maakUpdateBeheer, haalUpdateBeleid, toegestaneBeleidUrl };
