'use strict';

// Het releasebeleid heeft bewust een klein, gesloten schema. Een onleesbaar
// beleid mag nooit stil veranderen in een optionele update.
const BELEID_SLEUTELS = ['minimumVersie', 'schema', 'verplicht', 'versie'];

function versieOnderdelen(versie) {
  if (typeof versie !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(versie) || versie.length > 80) {
    throw new Error('Ongeldig versienummer: gebruik drie gehele getallen, bijvoorbeeld 2.2.70.');
  }
  return versie.split('.').map(deel => BigInt(deel));
}

function vergelijkVersies(eerste, tweede) {
  const links = versieOnderdelen(eerste);
  const rechts = versieOnderdelen(tweede);
  for (let index = 0; index < links.length; index += 1) {
    if (links[index] < rechts[index]) return -1;
    if (links[index] > rechts[index]) return 1;
  }
  return 0;
}

function valideerUpdateBeleid(waarde) {
  if (!waarde || typeof waarde !== 'object' || Array.isArray(waarde)) {
    throw new Error('Het updatebeleid moet een JSON-object zijn.');
  }
  const sleutels = Object.keys(waarde).sort();
  if (sleutels.length !== BELEID_SLEUTELS.length || sleutels.some((sleutel, index) => sleutel !== BELEID_SLEUTELS[index])) {
    throw new Error('Het updatebeleid heeft ontbrekende of onbekende velden.');
  }
  if (waarde.schema !== 1 || typeof waarde.verplicht !== 'boolean') {
    throw new Error('Het updatebeleid heeft een ongeldig schema of een ongeldige verplicht-keuze.');
  }
  versieOnderdelen(waarde.versie);
  if (waarde.minimumVersie !== null) {
    versieOnderdelen(waarde.minimumVersie);
    if (vergelijkVersies(waarde.minimumVersie, waarde.versie) > 0) {
      throw new Error('De minimale versie mag niet hoger zijn dan de releaseversie.');
    }
  }
  if (waarde.verplicht && waarde.minimumVersie !== waarde.versie) {
    throw new Error('Een verplichte release moet zijn eigen versie als minimale versie vastleggen.');
  }
  return {
    schema: 1,
    versie: waarde.versie,
    verplicht: waarde.verplicht,
    minimumVersie: waarde.minimumVersie
  };
}

function isUpdateVerplicht(beleid, lokaleVersie) {
  const geldig = valideerUpdateBeleid(beleid);
  versieOnderdelen(lokaleVersie);
  return geldig.minimumVersie !== null && vergelijkVersies(lokaleVersie, geldig.minimumVersie) < 0;
}

module.exports = { valideerUpdateBeleid, vergelijkVersies, isUpdateVerplicht };
