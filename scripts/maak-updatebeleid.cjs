'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { valideerUpdateBeleid, vergelijkVersies } = require('../update-beleid');

const REPOSITORY = 'ReinJanssenBouw/BinnenApp';
const BELEID_NAAM = 'binnenapp-updatebeleid.json';
const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const BELEID_URL = `https://github.com/${REPOSITORY}/releases/latest/download/${BELEID_NAAM}`;
const LAATSTE_VERSIE_ZONDER_BELEID = '2.2.69';

function maakUpdateBeleid({ versie, verplicht, vorigBeleid }) {
  vergelijkVersies(versie, versie);
  if (typeof verplicht !== 'boolean') throw new Error('Kies expliciet of de release verplicht is.');
  if (vorigBeleid === undefined) throw new Error('Het vorige updatebeleid ontbreekt.');
  const vorig = vorigBeleid === null ? null : valideerUpdateBeleid(vorigBeleid);
  if (vorig && vergelijkVersies(vorig.versie, versie) >= 0) {
    throw new Error('De nieuwe releaseversie moet hoger zijn dan de laatst gepubliceerde beleidsversie.');
  }
  return valideerUpdateBeleid({
    schema: 1,
    versie,
    verplicht,
    // Ook een optionele opvolger bewaart de verplichte ondergrens. Anders zou
    // iemand een verplichte tussenversie eenvoudig kunnen overslaan.
    minimumVersie: verplicht ? versie : (vorig?.minimumVersie ?? null)
  });
}

function leesArgumenten(argumenten) {
  const opties = {};
  for (let index = 0; index < argumenten.length; index += 1) {
    const vlag = argumenten[index];
    if (!['--verplicht', '--vorig-beleid'].includes(vlag) || Object.hasOwn(opties, vlag)) {
      throw new Error('Gebruik: node scripts/maak-updatebeleid.cjs --verplicht ja|nee [--vorig-beleid bestand.json]');
    }
    const waarde = argumenten[++index];
    if (!waarde || waarde.startsWith('--')) throw new Error(`Er ontbreekt een waarde voor ${vlag}.`);
    opties[vlag] = waarde;
  }
  if (!['ja', 'nee'].includes(opties['--verplicht'])) {
    throw new Error('Vraag eerst aan de gebruiker: moet deze release verplicht zijn? Geef daarna --verplicht ja of --verplicht nee op.');
  }
  return { verplicht: opties['--verplicht'] === 'ja', vorigBestand: opties['--vorig-beleid'] || null };
}

function controleerAdres(adres, soort) {
  const url = new URL(adres);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Een updatebeleid mag alleen via een officiële HTTPS-verbinding worden opgehaald.');
  }
  if (soort === 'api') {
    if (url.href !== RELEASE_API) throw new Error('Onverwacht adres voor de GitHub-releasecontrole.');
  } else {
    const githubPad = url.hostname === 'github.com' && (
      url.pathname === `/${REPOSITORY}/releases/latest/download/${BELEID_NAAM}` ||
      /^\/ReinJanssenBouw\/BinnenApp\/releases\/download\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\/binnenapp-updatebeleid\.json$/.test(url.pathname)
    );
    if (!githubPad && url.hostname !== 'release-assets.githubusercontent.com') {
      throw new Error('Het updatebeleid verwijst buiten de officiële GitHub-downloadservers.');
    }
  }
  return url.href;
}

async function leesBegrensdeTekst(antwoord, maximumBytes) {
  const gemeldeLengte = antwoord.headers.get('content-length');
  if (gemeldeLengte && (!/^\d+$/.test(gemeldeLengte) || Number(gemeldeLengte) > maximumBytes)) {
    throw new Error('Het antwoord voor het updatebeleid is te groot of ongeldig.');
  }
  if (!antwoord.body) throw new Error('Het antwoord voor het updatebeleid is leeg.');
  const lezer = antwoord.body.getReader();
  const delen = [];
  let omvang = 0;
  try {
    while (true) {
      const { done, value } = await lezer.read();
      if (done) break;
      omvang += value.byteLength;
      if (omvang > maximumBytes) throw new Error('Het antwoord voor het updatebeleid is te groot.');
      delen.push(Buffer.from(value));
    }
  } catch (fout) {
    await lezer.cancel().catch(() => {});
    throw fout;
  } finally {
    lezer.releaseLock();
  }
  return Buffer.concat(delen).toString('utf8');
}

async function haalJsonOp(adres, soort, { ophalen = fetch, timeoutMs = 15000 } = {}) {
  const afbreken = new AbortController();
  const wekker = setTimeout(() => afbreken.abort(), timeoutMs);
  wekker.unref?.();
  let volgendAdres = controleerAdres(adres, soort);
  try {
    for (let stap = 0; stap <= 5; stap += 1) {
      const antwoord = await ophalen(volgendAdres, {
        redirect: 'manual', signal: afbreken.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'BinnenApp-releasecontrole' }
      });
      if (antwoord.url && controleerAdres(antwoord.url, soort) !== volgendAdres) {
        throw new Error('De releasecontrole kreeg een onverwacht antwoordadres.');
      }
      if ([301, 302, 303, 307, 308].includes(antwoord.status)) {
        const locatie = antwoord.headers.get('location');
        await antwoord.body?.cancel();
        if (!locatie || stap === 5) throw new Error('Het updatebeleid heeft een ongeldige downloadverwijzing.');
        volgendAdres = controleerAdres(new URL(locatie, volgendAdres).href, soort);
        continue;
      }
      if (antwoord.status === 404) {
        await antwoord.body?.cancel();
        return { ontbreekt: true };
      }
      if (antwoord.status !== 200) {
        await antwoord.body?.cancel();
        throw new Error(`GitHub gaf status ${antwoord.status}; het vorige updatebeleid is niet betrouwbaar opgehaald.`);
      }
      const tekst = await leesBegrensdeTekst(antwoord, soort === 'api' ? 131072 : 16384);
      let waarde;
      try { waarde = JSON.parse(tekst); } catch { throw new Error('GitHub gaf geen geldig JSON-antwoord voor het updatebeleid.'); }
      return { ontbreekt: false, waarde };
    }
    throw new Error('Het updatebeleid kon niet worden opgehaald.');
  } catch (fout) {
    if (afbreken.signal.aborted) throw new Error('Het ophalen van het vorige updatebeleid duurde te lang; er is niets aangemaakt.');
    throw fout;
  } finally {
    clearTimeout(wekker);
  }
}

async function laadVorigUpdateBeleid(nieuweVersie, netwerkOpties) {
  vergelijkVersies(nieuweVersie, nieuweVersie);
  const releaseAntwoord = await haalJsonOp(RELEASE_API, 'api', netwerkOpties);
  if (releaseAntwoord.ontbreekt) throw new Error('De laatste GitHub-release ontbreekt; het vorige updatebeleid kan niet worden gecontroleerd.');
  const release = releaseAntwoord.waarde;
  if (!release || typeof release !== 'object' || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v') ||
      release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets)) {
    throw new Error('De laatste GitHub-release heeft ongeldige of onvolledige gegevens.');
  }
  const vorigeVersie = release.tag_name.slice(1);
  if (vergelijkVersies(vorigeVersie, nieuweVersie) >= 0) throw new Error('Verhoog eerst de appversie boven de laatste GitHub-release.');
  const beleidAntwoord = await haalJsonOp(BELEID_URL, 'beleid', netwerkOpties);
  if (beleidAntwoord.ontbreekt) {
    // Alleen de bekende releases van vóór de invoering mochten dit bestand missen.
    if (vergelijkVersies(vorigeVersie, LAATSTE_VERSIE_ZONDER_BELEID) <= 0 &&
        !release.assets.some(asset => asset?.name === BELEID_NAAM)) return null;
    throw new Error('Het vorige updatebeleid ontbreekt bij een recente release. Publiceren is gestopt om een verplichte ondergrens niet te verliezen.');
  }
  const vorig = valideerUpdateBeleid(beleidAntwoord.waarde);
  if (vorig.versie !== vorigeVersie) throw new Error('De laatste release en het vorige updatebeleid horen niet bij dezelfde versie; probeer opnieuw wanneer de publicatie compleet is.');
  return vorig;
}

async function voerUit(argumenten = process.argv.slice(2)) {
  const opties = leesArgumenten(argumenten);
  const projectMap = path.resolve(__dirname, '..');
  const pakket = JSON.parse(fs.readFileSync(path.join(projectMap, 'package.json'), 'utf8'));
  const vorig = opties.vorigBestand
    ? valideerUpdateBeleid(JSON.parse(fs.readFileSync(path.resolve(opties.vorigBestand), 'utf8')))
    : await laadVorigUpdateBeleid(pakket.version);
  const beleid = maakUpdateBeleid({ versie: pakket.version, verplicht: opties.verplicht, vorigBeleid: vorig });
  const uitvoerMap = path.join(projectMap, 'dist');
  fs.mkdirSync(uitvoerMap, { recursive: true });
  const uitvoerPad = path.join(uitvoerMap, BELEID_NAAM);
  fs.writeFileSync(uitvoerPad, `${JSON.stringify(beleid, null, 2)}\n`, 'utf8');
  console.log(`Updatebeleid gemaakt voor ${beleid.versie}: ${beleid.verplicht ? 'verplicht' : 'optioneel'}, minimale versie ${beleid.minimumVersie ?? 'geen'}.`);
  console.log(`Upload ${BELEID_NAAM} samen met de installer, blockmap en latest.yml.`);
  return beleid;
}

if (require.main === module) {
  voerUit().catch(fout => { console.error(`Geen updatebeleid gemaakt: ${fout.message}`); process.exitCode = 1; });
}

module.exports = { maakUpdateBeleid, leesArgumenten, controleerAdres, haalJsonOp, laadVorigUpdateBeleid, voerUit };
