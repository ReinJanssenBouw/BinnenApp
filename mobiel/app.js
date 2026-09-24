import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://guurncfxhcxwvgnzoeyp.supabase.co";
const SUPABASE_KEY = "sb_publishable_iomMmjLjzETZ_RLIq5bemA_e02lXOOk";
// Wordt vóór publicatie vervangen door de publieke VAPID-sleutel. De private
// sleutel blijft uitsluitend als Supabase-secret op de server staan.
const VAPID_PUBLIC_KEY = "__BINNENAPP_PUSH_NOG_NIET_INGESTELD__";
const PUSH_TABBLADEN = ["winkel", "wagen", "bestellingen", "voorraad", "retour"];

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// In de geïnstalleerde iOS-app valt de gemelde viewport een statusbalk te kort.
// Deze klasse activeert alleen daar de compensatie voor de onderste lege strook.
if (window.navigator.standalone === true) {
  document.documentElement.classList.add("ios-standalone");
}

const STATUSSEN = ["Mail Verstuurd", "Orderbevestiging gekregen", "Geleverd", "In magazijn"];
const STAPPEN = STATUSSEN.filter((s) => s !== "In magazijn");
const SORTEERWIJZEN = ["jb", "positie", "naam"];
const NATUURLIJKE_VOLGORDE = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });
const bewaardeSortering = localStorage.getItem("binnenapp_sortering");

// ── Toestand ────────────────────────────────────────────────────────────
const staat = {
  gebruiker: null,
  beheerder: false,
  tab: "winkel",
  producten: [],
  wagen: {},          // product_id -> aantal
  orders: [],
  retour: [],
  statusDatums: [],
  zoek: "",
  categorie: "Alles",
  sortering: SORTEERWIJZEN.includes(bewaardeSortering) ? bewaardeSortering : "jb",
  voorraadBezig: new Set(),
  bezig: false,
  laadfout: "",   // gevuld = laden mislukt; lijsten zijn dan onbetrouwbaar
};

// ── Hulp ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function geld(v) {
  return Number(v || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

function datum(v) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function zoekTekst(v) {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

let toastTimer;
function melden(tekst) {
  const el = $("toast");
  el.textContent = tekst;
  el.classList.add("zicht");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("zicht"), 2600);
}

// ── iOS- en webpushmeldingen ───────────────────────────────────────────
let serviceWorkerBelofte = null;

function pushOndersteund() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function draaitAlsApp() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function vapidNaarBytes(sleutel) {
  const aanvulling = "=".repeat((4 - sleutel.length % 4) % 4);
  const basis64 = (sleutel + aanvulling).replace(/-/g, "+").replace(/_/g, "/");
  const ruw = atob(basis64);
  return Uint8Array.from([...ruw].map((teken) => teken.charCodeAt(0)));
}

async function serviceWorkerRegistratie() {
  if (!("serviceWorker" in navigator)) return null;
  if (!serviceWorkerBelofte) {
    serviceWorkerBelofte = navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .catch((error) => {
        serviceWorkerBelofte = null;
        throw error;
      });
  }
  return serviceWorkerBelofte;
}

async function leesPushStatus() {
  const status = {
    ondersteund: pushOndersteund(),
    toestemming: "onbeschikbaar",
    abonnement: null,
    ios: isIOS(),
    standalone: draaitAlsApp(),
  };
  if (!status.ondersteund) return status;
  status.toestemming = Notification.permission;
  try {
    const registratie = await serviceWorkerRegistratie();
    status.abonnement = await registratie?.pushManager.getSubscription() || null;
  } catch (error) {
    console.warn("Meldingstatus ophalen gaf een fout:", error);
  }
  return status;
}

function meldingenMarkup(status) {
  const actief = Boolean(status.abonnement && status.toestemming === "granted");
  let titel = actief ? "Meldingen staan aan" : "Meldingen staan uit";
  let uitleg = actief
    ? "Je krijgt een melding wanneer iemand artikelen toevoegt of een bestelling plaatst."
    : "Zet meldingen aan om wijzigingen ook te zien wanneer BinnenApp niet geopend is.";
  let actie = actief
    ? `<button type="button" class="knop leeg" data-push-actie="uit">Meldingen uitzetten</button>`
    : `<button type="button" class="knop" data-push-actie="aan">Meldingen inschakelen</button>`;

  if (VAPID_PUBLIC_KEY.startsWith('__')) {
    titel = "Meldingen nog niet beschikbaar";
    uitleg = "Pushmeldingen zijn voor BinnenApp nog niet ingesteld.";
    actie = "";
  } else if (!status.ondersteund || (status.ios && !status.standalone)) {
    titel = "Open BinnenApp vanaf je beginscherm";
    uitleg = status.ios
      ? "Open deze website in Safari, kies Deel en daarna Zet op beginscherm. Open vervolgens die app om meldingen aan te zetten."
      : "Deze browser ondersteunt geen webmeldingen voor BinnenApp.";
    actie = "";
  } else if (status.toestemming === "denied") {
    titel = "Meldingen zijn geblokkeerd";
    uitleg = "Sta meldingen voor BinnenApp weer toe via Instellingen > Meldingen op je iPhone.";
    actie = "";
  }

  return `
    <div class="melding-kop">
      <div>
        <h2>Meldingen</h2>
        <p class="blad-sub">Winkelwagen en bestellingen</p>
      </div>
      <button type="button" class="scanner-sluit" id="meldingenSluit" aria-label="Sluiten">&times;</button>
    </div>
    <div class="melding-statuskaart ${actief ? "actief" : ""}">
      <span class="melding-statusicoon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </span>
      <div><strong>${titel}</strong><p>${uitleg}</p></div>
    </div>
    <div class="melding-soorten">
      <div><span>+</span><p><strong>Winkelwagen</strong><small>Een artikel of extra aantal is toegevoegd</small></p></div>
      <div><span>&check;</span><p><strong>Bestelling</strong><small>Een nieuwe bestelling is geplaatst</small></p></div>
    </div>
    ${actie}
    <p class="melding-privacy">Alleen ingelogde en goedgekeurde BinnenApp-leden kunnen deze meldingen ontvangen.</p>
  `;
}

async function toonMeldingen() {
  bladOpen(`<div class="melding-laden"><span class="spinner"></span><p>Meldingstatus ophalen...</p></div>`);
  const status = await leesPushStatus();
  if (!$("blad").classList.contains("open")) return;
  bladOpen(meldingenMarkup(status));
}

async function meldingenAanzetten() {
  if (!pushOndersteund()) return melden("Meldingen worden op dit apparaat niet ondersteund.");
  if (isIOS() && !draaitAlsApp()) return toonMeldingen();

  // iOS staat de toestemmingsvraag alleen direct na deze tik toe. Daarom staat
  // deze aanroep bewust vóór iedere andere asynchrone bewerking.
  let toestemming = Notification.permission;
  if (toestemming !== "granted") toestemming = await Notification.requestPermission();
  if (toestemming !== "granted") {
    await toonMeldingen();
    return;
  }
  if (VAPID_PUBLIC_KEY.startsWith("__")) throw new Error("De meldingssleutel is nog niet ingesteld.");

  const registratie = await serviceWorkerRegistratie();
  let abonnement = await registratie.pushManager.getSubscription();
  const nieuwAbonnement = !abonnement;
  if (!abonnement) {
    abonnement = await registratie.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidNaarBytes(VAPID_PUBLIC_KEY),
    });
  }

  const gegevens = abonnement.toJSON();
  if (!gegevens.endpoint || !gegevens.keys?.p256dh || !gegevens.keys?.auth) {
    if (nieuwAbonnement) await abonnement.unsubscribe();
    throw new Error("Het meldingsabonnement is onvolledig.");
  }

  const { error } = await db.rpc("binnenapp_register_push_subscription", {
    p_subscription: gegevens,
  });
  if (error) {
    if (nieuwAbonnement) await abonnement.unsubscribe();
    throw error;
  }
  localStorage.setItem("binnenapp_push_gebruiker", staat.gebruiker?.id || "");
  await werkMeldingKnopBij();
  await toonMeldingen();
  melden("Meldingen staan aan.");
}

async function meldingenUitzetten() {
  const status = await leesPushStatus();
  if (status.abonnement) {
    const { error } = await db.rpc("binnenapp_unregister_push_subscription", {
      p_endpoint: status.abonnement.endpoint,
    });
    await status.abonnement.unsubscribe();
    if (error) throw error;
  }
  localStorage.removeItem("binnenapp_push_gebruiker");
  await werkMeldingKnopBij();
  await toonMeldingen();
  melden("Meldingen staan uit.");
}

async function werkMeldingKnopBij() {
  const knop = $("meldingenKnop");
  if (!knop) return;
  const status = await leesPushStatus();
  const actief = Boolean(status.abonnement && status.toestemming === "granted");
  knop.classList.toggle("actief", actief);
  knop.title = actief ? "Meldingen staan aan" : "Meldingen instellen";
  knop.setAttribute("aria-label", knop.title);
}

function openPushBestemming(bestemming) {
  const url = new URL(bestemming || "/", location.origin);
  const tab = url.searchParams.get("tab");
  if (!PUSH_TABBLADEN.includes(tab)) return;
  staat.tab = tab;
  staat.zoek = "";
  if (staat.gebruiker) zetTab();
  if (url.origin === location.origin) history.replaceState({}, "", url.pathname);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "binnenapp-open-bestemming") openPushBestemming(event.data.url);
  });
}

const FOUT_NL = {
  "Invalid login credentials": "E-mailadres of wachtwoord klopt niet.",
  "Email not confirmed": "Dit account is nog niet bevestigd.",
  "Failed to fetch": "Geen verbinding. Controleer je internet.",
  "User already registered": "Er bestaat al een account met dit e-mailadres.",
  "Password should be at least 6 characters.": "Kies een langer wachtwoord.",
  "Signup requires a valid password": "Vul een wachtwoord in.",
};

function foutTekst(error) {
  const ruw = String(error?.message || error || "").split("Error: ").pop().trim();
  return FOUT_NL[ruw] || ruw || "Er ging iets mis";
}

function fotoBlok(url, naam) {
  const src = String(url || "").trim();
  if (!/^https?:\/\//i.test(src)) return `<div class="artikel-foto"><span>geen<br>foto</span></div>`;
  return `<div class="artikel-foto"><img src="${esc(src)}" alt="${esc(naam)}" loading="lazy" decoding="async"
    onerror="this.parentElement.innerHTML='<span>geen<br>foto</span>'"></div>`;
}

// Prijs geldt per verpakking, het aantal in stuks
function regelBedrag(prijs, aantal, perVerpakking) {
  const per = Math.max(1, Number(perVerpakking || 1));
  return (Number(aantal || 0) / per) * Number(prijs || 0);
}

function stapVan(status) {
  const i = STAPPEN.indexOf(status);
  if (i >= 0) return i;
  return status === "In magazijn" ? STAPPEN.length : 0;
}

function artikelPositie(item = {}) {
  const volledig = String(item.position || "").trim();
  if (volledig) return volledig;
  return [item.rack, item.x_axis, item.y_axis]
    .map((deel) => String(deel || "").trim())
    .filter(Boolean)
    .join(" / ");
}

function actueelProductVoor(item = {}) {
  if (item.p?.id) return item.p;
  const productId = Number(item.product_id || 0);
  if (productId) {
    const opId = staat.producten.find((p) => Number(p.id) === productId);
    if (opId) return opId;
  }
  const jb = zoekTekst(item.jb_code);
  const ean = zoekTekst(item.ean_code);
  return staat.producten.find((p) =>
    (jb && zoekTekst(p.jb_code) === jb) || (ean && zoekTekst(p.ean_code) === ean)
  ) || {};
}

function sorteerBron(item = {}) {
  const actueel = actueelProductVoor(item);
  return {
    id: item.id ?? actueel.id ?? "",
    description: item.description || actueel.description || "",
    jb_code: item.jb_code || actueel.jb_code || "",
    position: item.position || actueel.position || "",
    rack: item.rack || actueel.rack || "",
    x_axis: item.x_axis || actueel.x_axis || "",
    y_axis: item.y_axis || actueel.y_axis || "",
  };
}

function vergelijkSorteerWaarde(links, rechts) {
  const a = String(links || "").trim();
  const b = String(rechts || "").trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return NATUURLIJKE_VOLGORDE.compare(a, b);
}

function vergelijkArtikelen(links, rechts) {
  const a = sorteerBron(links);
  const b = sorteerBron(rechts);
  let verschil = 0;
  if (staat.sortering === "jb") verschil = vergelijkSorteerWaarde(a.jb_code, b.jb_code);
  else if (staat.sortering === "positie") verschil = vergelijkSorteerWaarde(artikelPositie(a), artikelPositie(b));
  else verschil = vergelijkSorteerWaarde(a.description, b.description);
  if (verschil) return verschil;

  verschil = vergelijkSorteerWaarde(a.description, b.description);
  if (verschil) return verschil;
  verschil = vergelijkSorteerWaarde(a.jb_code, b.jb_code);
  if (verschil) return verschil;
  return vergelijkSorteerWaarde(a.id, b.id);
}

function sorteerArtikelen(lijst = []) {
  return [...lijst].sort(vergelijkArtikelen);
}

function sorteerLabel(modus = staat.sortering) {
  if (modus === "positie") return "Positie";
  if (modus === "naam") return "Naam";
  return "JB-nummer";
}

// Lange lijsten bewegen pas wanneer een onderdeel in beeld komt. Zo krijgt elk
// onderdeel een animatie zonder alle productkaarten tegelijk te laten tekenen.
const verschijnObservers = {};

function animatieOnderdelen(container) {
  const toegestaan = ".zoekbalk,.chips,.filter-rij,.sorteer-regel,.telling,.kaart,.lege-staat,.knop,.blad-greep,h2,.blad-sub,.detail-rij,.veld,.scanner-kop,.scanner-beeld,.scanner-status,.scanner-laatste,.scanner-acties,.categorie-kop,.categorie-zoek,.categorie-opties,.sorteer-opties";
  return [...container.children].flatMap((kind) =>
    kind.id === "lijst" ? [...kind.children] : [kind]
  ).filter((kind) => kind.matches(toegestaan));
}

function activeerVerschijnAnimaties(container, sleutel) {
  verschijnObservers[sleutel]?.disconnect();
  verschijnObservers[sleutel] = null;
  if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((regels) => {
    regels.forEach((regel) => {
      if (!regel.isIntersecting) return;
      const onderdeel = regel.target;
      onderdeel.classList.add("in-beeld");
      observer.unobserve(onderdeel);
      window.setTimeout(() => {
        onderdeel.classList.remove("verschijn", "in-beeld");
        onderdeel.style.removeProperty("--verschijn-vertraging");
      }, 760);
    });
  }, { root: container, threshold: 0.04, rootMargin: "0px 0px -4% 0px" });

  animatieOnderdelen(container).forEach((onderdeel, index) => {
    onderdeel.classList.add("verschijn");
    onderdeel.style.setProperty("--verschijn-vertraging", `${(index % 4) * 38}ms`);
    observer.observe(onderdeel);
  });
  verschijnObservers[sleutel] = observer;
}

// ── Blad (onderin openschuivend paneel) ─────────────────────────────────
let scannerBediening = null;
let scannerModuleBelofte = null;
let scannerSessie = 0;
let scannerResultaatBezig = false;
const scannerVergrendeldeCodes = new Set();
let scannerLaatstGezienOp = 0;
let scannerOntgrendelTimer = null;
let scannerWagenGewijzigd = false;

function scannerStoppen() {
  scannerSessie++;
  clearTimeout(scannerOntgrendelTimer);
  scannerOntgrendelTimer = null;
  scannerVergrendeldeCodes.clear();
  scannerLaatstGezienOp = 0;
  try {
    scannerBediening?.stop();
  } catch (error) {
    console.warn("Scanner stoppen gaf een fout:", error);
  }
  scannerBediening = null;

  const video = $("scannerVideo");
  video?.srcObject?.getTracks().forEach((spoor) => spoor.stop());
  if (video) video.srcObject = null;
}

function bladOpen(html) {
  $("bladInhoud").innerHTML = `<div class="blad-greep"></div>` + html;
  $("blad").classList.add("open");
  requestAnimationFrame(() => activeerVerschijnAnimaties($("bladInhoud"), "blad"));
}
function bladDicht() {
  const scannerWasOpen = Boolean($("scannerVideo"));
  scannerStoppen();
  $("blad").classList.remove("open");
  verschijnObservers.blad?.disconnect();
  verschijnObservers.blad = null;
  if (scannerWasOpen && scannerWagenGewijzigd) {
    wagenOpslaan(0);
    scannerWagenGewijzigd = false;
    tekenScherm();
    badges();
  }
}
$("blad").addEventListener("click", (e) => {
  if (e.target !== $("blad")) return;
  if ($("sorteerKiezer")) sluitSorteerKiezer();
  else bladDicht();
});

// ── Gegevens laden ──────────────────────────────────────────────────────
async function laadAlles() {
  const leverdatumVersieBijStart = leverdatumSchrijfVersie;
  const [prod, wagen, orders, retour, datums] = await Promise.all([
    db.from("products").select("*").eq("available", true).order("description"),
    db.from("cart_items").select("product_id,quantity"),
    db.from("orders").select(
      "id,order_number,created_at,status,requester_name,reference,delivery_date,expected_delivery_date," +
      "leys_order_number,confirmation_pdf_path,confirmation_pdf_url,confirmation_pdf_name," +
      "in_warehouse_since,order_items(*)"
    ).order("created_at", { ascending: false }),
    db.from("retour_items").select("*").order("created_at", { ascending: false }),
    db.from("order_status_dates").select("order_number,status,bereikt_op"),
  ]);

  staat.producten = prod.data || [];
  staat.wagen = {};
  (wagen.data || []).forEach((r) => { staat.wagen[r.product_id] = r.quantity; });
  staat.orders = (orders.data || []).map((order) => {
    const bewerking = leverdatumBewerkingen.get(order.order_number);
    // Een al lopende laadactie mag een net opgeslagen datum niet terugdraaien.
    return bewerking?.schrijfVersie > leverdatumVersieBijStart
      ? { ...order, expected_delivery_date: bewerking.basis }
      : order;
  });
  staat.retour = retour.data || [];
  staat.statusDatums = datums.data || [];

  const eersteFout = [prod, wagen, orders, retour, datums].find((r) => r.error);
  if (eersteFout) {
    // Op een telefoon is er geen console: zonder zichtbare melding is een
    // mislukte query niet te onderscheiden van een lijst die echt leeg is.
    console.warn("Laden gaf een fout:", eersteFout.error.message);
    staat.laadfout = foutTekst(eersteFout.error);
    melden("Laden mislukt: " + staat.laadfout);
  } else {
    staat.laadfout = "";
  }
  // Mailstatus staat los van de handmatig bijgehouden bestelstappen.
  // Alleen de statusblokken bijwerken: een open formulier blijft ongemoeid.
  void laadMailStatussen();
  const leverdatumBlok = $("orderLeverdatum");
  if (leverdatumBlok && !leverdatumBewerkingen.get(leverdatumBlok.dataset.leverdatumOrder)?.bewerken) {
    werkLeverdatumBlokBij(leverdatumBlok.dataset.leverdatumOrder);
  }
}

function product(id) {
  return staat.producten.find((p) => p.id === Number(id)) || {};
}

// ── Winkelwagen ─────────────────────────────────────────────────────────
function wagenAantal() {
  return Object.values(staat.wagen).reduce((a, b) => a + Number(b || 0), 0);
}

function wagenRegels() {
  return sorteerArtikelen(Object.entries(staat.wagen)
    .filter(([, aantal]) => Number(aantal) > 0)
    .map(([id, aantal]) => ({ p: product(id), aantal: Number(aantal) }))
    .filter((r) => r.p.id));
}

let wagenTimer = null;
let wagenOpslaanBezig = false;
let wagenOpslaanOpnieuw = false;
let wagenLokaleVersie = 0;
let wagenLokaleWijzigingTot = 0;
let wagenVerversTimer = null;
let wagenRealtimeKanaal = null;
let wagenRealtimeStatus = "CLOSED";
let wagenFallbackTimer = null;

function wagensGelijk(a, b) {
  const aSleutels = Object.keys(a).sort();
  const bSleutels = Object.keys(b).sort();
  if (aSleutels.length !== bSleutels.length) return false;
  return aSleutels.every((id, index) =>
    id === bSleutels[index] && Number(a[id] || 0) === Number(b[id] || 0));
}

function planWagenVerversing(vertraging = 60) {
  clearTimeout(wagenVerversTimer);
  wagenVerversTimer = setTimeout(() => {
    wagenVerversTimer = null;
    laadWagenVanServer();
  }, Math.max(0, vertraging));
}

async function laadWagenVanServer() {
  if (!staat.gebruiker || document.hidden) return;
  const lokaleWachttijd = Math.max(0, wagenLokaleWijzigingTot - Date.now());
  if (wagenOpslaanBezig || wagenTimer || lokaleWachttijd > 0) {
    planWagenVerversing(lokaleWachttijd > 0 ? Math.min(220, lokaleWachttijd + 20) : 70);
    return;
  }

  const versieVoorOphalen = wagenLokaleVersie;
  const antwoord = await db.from("cart_items").select("product_id,quantity");
  if (antwoord.error) {
    console.warn("Winkelwagen live ophalen mislukt:", antwoord.error.message);
    return;
  }
  if (versieVoorOphalen !== wagenLokaleVersie || wagenOpslaanBezig || wagenTimer) {
    planWagenVerversing(70);
    return;
  }

  const volgendeWagen = {};
  (antwoord.data || []).forEach((regel) => {
    const aantal = Number(regel.quantity || 0);
    if (aantal > 0) volgendeWagen[regel.product_id] = aantal;
  });
  if (wagensGelijk(staat.wagen, volgendeWagen)) return;
  staat.wagen = volgendeWagen;
  laatsteVerversing = Date.now();
  badges();
  tekenScherm(true);
}

async function voerWagenOpslaanUit() {
  if (wagenOpslaanBezig) {
    wagenOpslaanOpnieuw = true;
    return;
  }
  wagenOpslaanBezig = true;
  const items = wagenRegels().map((r) => ({ product_id: r.p.id, quantity: r.aantal }));
  try {
    const { error } = await db.rpc("binnenapp_sync_cart", { p_items: items });
    if (error) melden(foutTekst(error));
    else planWagenVerversing(60);
  } catch (error) {
    melden(foutTekst(error));
  } finally {
    wagenOpslaanBezig = false;
  }
  if (wagenOpslaanOpnieuw) {
    wagenOpslaanOpnieuw = false;
    wagenOpslaan(0);
  }
}

function wagenOpslaan(vertraging = 100) {
  wagenLokaleVersie += 1;
  wagenLokaleWijzigingTot = Date.now() + 650;
  clearTimeout(wagenTimer);
  wagenTimer = setTimeout(() => {
    wagenTimer = null;
    voerWagenOpslaanUit();
  }, vertraging);
}

function beheerWagenFallback(status) {
  const volgendeStatus = String(status || "CLOSED");
  if (volgendeStatus !== wagenRealtimeStatus) console.info("[realtime] winkelwagen:", volgendeStatus);
  wagenRealtimeStatus = volgendeStatus;
  if (wagenRealtimeStatus === "SUBSCRIBED") {
    clearInterval(wagenFallbackTimer);
    wagenFallbackTimer = null;
    planWagenVerversing(0);
    return;
  }
  if (wagenFallbackTimer) return;
  wagenFallbackTimer = setInterval(() => {
    if (document.hidden || !staat.gebruiker || wagenVerversTimer) return;
    planWagenVerversing(0);
  }, 500);
}

function startWagenRealtime() {
  if (wagenRealtimeKanaal) return;
  beheerWagenFallback("CONNECTING");
  const uniek = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  wagenRealtimeKanaal = db
    .channel(`binnenapp-mobiel-winkelwagen-${uniek}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "cart_items",
    }, () => planWagenVerversing(60))
    .subscribe((status) => beheerWagenFallback(status));
}

function stap(p) {
  return Math.max(1, Number(p.packaged_per || 1));
}

function wijzigAantal(id, richting) {
  const p = product(id);
  const s = stap(p);
  const nu = Number(staat.wagen[id] || 0);
  const nieuw = Math.max(0, nu + richting * s);
  if (nieuw > 0) staat.wagen[id] = nieuw; else delete staat.wagen[id];
  wagenOpslaan();
  tekenScherm(true);
  badges();
}

function zetAantal(id, waarde) {
  const p = product(id);
  const s = stap(p);
  let n = Math.max(0, Math.round(Number(waarde) || 0));
  if (s > 1 && n % s !== 0) n = Math.ceil(n / s) * s;   // afronden op verpakking
  if (n > 0) staat.wagen[id] = n; else delete staat.wagen[id];
  wagenOpslaan();
  tekenScherm(true);
  badges();
}

// ── Schermen ────────────────────────────────────────────────────────────
function badges() {
  const w = wagenAantal();
  $("wagenBadge").hidden = w === 0;
  $("wagenBadge").textContent = w;
  $("retourBadge").hidden = staat.retour.length === 0;
  $("retourBadge").textContent = staat.retour.length;
}

const TITELS = {
  winkel: "Winkel", wagen: "Winkelwagen", bestellingen: "Bestellingen",
  voorraad: "Voorraad", retour: "Retour",
};

function tekenScherm(bewaarScroll = false) {
  $("topbarTitel").textContent = TITELS[staat.tab] || "BinnenApp";
  const el = $("scherm");
  const positie = bewaarScroll ? el.scrollTop : 0;
  if (staat.tab === "winkel") el.innerHTML = schermWinkel();
  else if (staat.tab === "wagen") el.innerHTML = schermWagen();
  else if (staat.tab === "bestellingen") el.innerHTML = schermBestellingen();
  else if (staat.tab === "voorraad") el.innerHTML = schermVoorraad();
  else if (staat.tab === "retour") el.innerHTML = schermRetour();
  if (bewaarScroll) el.scrollTop = positie;
  else activeerVerschijnAnimaties(el, "scherm");
}

function categorieen() {
  const set = new Set(staat.producten.map((p) => p.category || "Overig"));
  return ["Alles", ...[...set].sort((a, b) => a.localeCompare(b, "nl"))];
}

function categorieAantal(categorie) {
  if (categorie === "Alles") return staat.producten.length;
  return staat.producten.filter((p) => (p.category || "Overig") === categorie).length;
}

function categorieOpties(zoek = "") {
  const q = zoekTekst(zoek);
  const opties = categorieen().filter((categorie) =>
    !q || zoekTekst(categorie === "Alles" ? "Alle categorieën" : categorie).includes(q));

  if (!opties.length) {
    return `<div class="categorie-geen"><strong>Geen categorie gevonden</strong>Probeer een andere zoekterm</div>`;
  }

  return opties.map((categorie) => {
    const actief = categorie === staat.categorie;
    const naam = categorie === "Alles" ? "Alle categorieën" : categorie;
    const aantal = categorieAantal(categorie);
    return `<button type="button" class="categorie-optie ${actief ? "actief" : ""}"
      data-filter-cat="${esc(categorie)}" aria-pressed="${actief}">
      <span class="categorie-optie-tekst">
        <strong>${esc(naam)}</strong>
        <small>${aantal} ${aantal === 1 ? "artikel" : "artikelen"}</small>
      </span>
      <span class="categorie-vink" aria-hidden="true">
        ${actief ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg>` : ""}
      </span>
    </button>`;
  }).join("");
}

function categorieKiezerOpenen() {
  bladOpen(`
    <div class="categorie-kop">
      <div>
        <h2>Filter op categorie</h2>
        <div class="blad-sub">Kies wat je wilt bekijken in de Winkel.</div>
      </div>
      <button type="button" class="scanner-sluit" id="categorieSluit" aria-label="Categoriefilter sluiten">&times;</button>
    </div>
    <div class="categorie-zoek">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="categorieZoek" type="search" placeholder="Zoek een categorie" autocomplete="off">
    </div>
    <div class="categorie-opties" id="categorieOpties">${categorieOpties()}</div>
  `);
}

function sorteerKnopMarkup(extraKlasse = "", orderNummer = "") {
  return `<button type="button" class="sorteer-keuze ${extraKlasse}" data-sorteer-open
    ${orderNummer ? `data-sorteer-order="${esc(orderNummer)}"` : ""} aria-haspopup="dialog">
    <span class="sorteer-icoon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h12M4 12h9M4 17h6"/><path d="m17 14 3 3 3-3M20 17V5"/></svg>
    </span>
    <span class="sorteer-tekst"><small>Sorteren op</small><strong>${esc(sorteerLabel())}</strong></span>
    <svg class="sorteer-pijl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
  </button>`;
}

let sorteerTerugOrder = "";

function sorteerOpties() {
  const opties = [
    { key: "jb", label: "JB-nummer", sub: "Natuurlijke volgorde, bijvoorbeeld JB9 vóór JB10", icoon: "#" },
    { key: "positie", label: "Positie", sub: "Op magazijnpositie: rek, X- en Y-as", icoon: "⌖" },
    { key: "naam", label: "Naam", sub: "Alfabetisch op artikelnaam", icoon: "A" },
  ];
  return opties.map((optie) => {
    const actief = optie.key === staat.sortering;
    return `<button type="button" class="sorteer-optie ${actief ? "actief" : ""}" data-sortering="${optie.key}" aria-pressed="${actief}">
      <span class="sorteer-optie-icoon" aria-hidden="true">${optie.icoon}</span>
      <span class="sorteer-optie-tekst"><strong>${optie.label}</strong><small>${optie.sub}</small></span>
      <span class="categorie-vink" aria-hidden="true">
        ${actief ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg>` : ""}
      </span>
    </button>`;
  }).join("");
}

function sorteerKiezerOpenen(orderNummer = "") {
  sorteerTerugOrder = orderNummer;
  bladOpen(`
    <div class="categorie-kop" id="sorteerKiezer">
      <div>
        <h2>Artikelen sorteren</h2>
        <div class="blad-sub">Deze keuze geldt meteen in de hele app.</div>
      </div>
      <button type="button" class="scanner-sluit" id="sorteerSluit" aria-label="Sorteermenu sluiten">&times;</button>
    </div>
    <div class="sorteer-opties">${sorteerOpties()}</div>
  `);
}

function sluitSorteerKiezer() {
  const orderNummer = sorteerTerugOrder;
  sorteerTerugOrder = "";
  bladDicht();
  if (orderNummer) toonOrder(orderNummer);
}

function kiesSortering(modus) {
  if (!SORTEERWIJZEN.includes(modus)) return;
  staat.sortering = modus;
  localStorage.setItem("binnenapp_sortering", modus);
  const terugNaarOrder = sorteerTerugOrder;
  sluitSorteerKiezer();
  if (!terugNaarOrder) {
    $("scherm").scrollTop = 0;
    tekenScherm();
  }
}

function gefilterd() {
  const q = zoekTekst(staat.zoek);
  return sorteerArtikelen(staat.producten.filter((p) => {
    if (staat.categorie !== "Alles" && (p.category || "Overig") !== staat.categorie) return false;
    if (!q) return true;
    return zoekTekst([p.description, p.jb_code, p.ean_code, p.category].join(" ")).includes(q);
  }));
}

function artikelKaart(p, toonVoorraad) {
  const inWagen = Number(staat.wagen[p.id] || 0);
  const voorraad = Number(p.stock || 0);
  const min = Number(p.min_stock || 0);
  const positie = artikelPositie(p);
  const staatChip = min > 0 && voorraad <= 0
    ? `<span class="artikel-chip leeg-voorraad">Leeg</span>`
    : (min > 0 && voorraad < min)
      ? `<span class="artikel-chip laag">Laag &middot; ${voorraad}</span>`
      : `<span class="artikel-chip op">${voorraad} op voorraad</span>`;

  return `<div class="kaart ${inWagen ? "in-wagen" : ""}">
    <div class="artikel">
      ${fotoBlok(p.product_image_url, p.description)}
      <div class="artikel-info">
        <div class="artikel-naam">${esc(p.description)}</div>
        <div class="artikel-meta">
          ${p.jb_code ? `<span class="artikel-chip">${esc(p.jb_code)}</span>` : ""}
          ${staat.sortering === "positie" && positie ? `<span class="artikel-chip">${esc(positie)}</span>` : ""}
          ${toonVoorraad ? staatChip : ""}
          <span class="artikel-chip">per ${esc(stap(p))} ${esc(p.unit || "st")}</span>
        </div>
      </div>
    </div>
    <div class="aantal">
      <button class="aantal-knop" data-min="${p.id}" ${inWagen ? "" : "disabled"}>&minus;</button>
      <input class="aantal-veld" type="number" inputmode="numeric" min="0" step="${stap(p)}"
             value="${inWagen}" data-veld="${p.id}">
      <button class="aantal-knop" data-plus="${p.id}">+</button>
      <span class="aantal-eenheid">${esc(p.unit || "st")}</span>
    </div>
  </div>`;
}

function lijstWinkel() {
  const lijst = gefilterd();
  const leegUitleg = staat.zoek
    ? "Probeer een andere zoekterm"
    : staat.categorie !== "Alles" ? "Kies een andere categorie of toon alles" : "Er zijn geen artikelen beschikbaar";
  return `<div class="telling">${lijst.length} ${lijst.length === 1 ? "artikel" : "artikelen"}</div>`
    + (lijst.length
      ? lijst.map((p) => artikelKaart(p, true)).join("")
      : `<div class="lege-staat"><strong>Niets gevonden</strong>${leegUitleg}
          ${staat.categorie !== "Alles" ? `<button type="button" class="knop leeg klein" data-filter-wis>Toon alle categorieën</button>` : ""}
        </div>`);
}

function schermWinkel() {
  return `
    <div class="zoekbalk">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="zoekVeld" type="search" placeholder="Zoek artikel, JB-code of EAN" value="${esc(staat.zoek)}">
      <button type="button" class="scan-knop" id="scanKnop" aria-label="Barcode scannen" title="Barcode scannen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/>
          <path d="M8 8v8M11 8v8M14 8v8M16.5 8v8"/>
        </svg>
      </button>
    </div>
    <div class="filter-rij">
      <button type="button" class="filter-keuze ${staat.categorie !== "Alles" ? "actief" : ""}" id="categorieKnop" aria-haspopup="dialog">
        <span class="filter-icoon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M7 12h10M10 19h4"/></svg>
        </span>
        <span class="filter-tekst">
          <small>Categorie</small>
          <strong>${esc(staat.categorie === "Alles" ? "Alle categorieën" : staat.categorie)}</strong>
        </span>
        <span class="filter-aantal">${categorieAantal(staat.categorie)}</span>
        <svg class="filter-pijl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      ${sorteerKnopMarkup("in-filter")}
      ${staat.categorie !== "Alles" ? `<button type="button" class="filter-wis" data-filter-wis aria-label="Categoriefilter wissen">&times;</button>` : ""}
    </div>
    <div id="lijst">${lijstWinkel()}</div>
  `;
}

// De scanner wordt pas geladen wanneer iemand hem opent. Zo blijft de Winkel
// snel en hoeft de camera nooit actief te zijn buiten het scanvenster.
function scannerFoutTekst(error) {
  if (!window.isSecureContext) return "Barcodes scannen werkt alleen via een beveiligde verbinding.";
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Geef BinnenApp toestemming voor de camera in de instellingen van je telefoon.";
  }
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "Er is geen geschikte camera gevonden.";
  }
  if (error?.name === "NotReadableError" || error?.name === "AbortError") {
    return "De camera is al in gebruik door een andere app.";
  }
  return "De scanner kon niet worden gestart. Controleer je verbinding en probeer het opnieuw.";
}

function toonScannerFout(tekst) {
  const status = $("scannerStatus");
  const statusTekst = $("scannerStatusTekst");
  if (status) status.classList.add("fout");
  if (statusTekst) statusTekst.textContent = tekst;
  $("scannerOpnieuw")?.classList.remove("hidden");
}

function barcodeOpschonen(waarde) {
  return String(waarde ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function productBijBarcode(barcode) {
  const code = barcodeOpschonen(barcode);
  const varianten = new Set([code]);

  // Een UPC-A wordt soms als 12 cijfers en soms als EAN-13 met voorloopnul
  // aangeleverd. Beide vormen moeten hetzelfde artikel kunnen vinden.
  if (/^\d{12}$/.test(code)) varianten.add(`0${code}`);
  if (/^0\d{12}$/.test(code)) varianten.add(code.slice(1));

  return staat.producten.find((p) => varianten.has(barcodeOpschonen(p.ean_code)));
}

function barcodeGevonden(ruweCode) {
  const code = barcodeOpschonen(ruweCode);
  if (!code) return;

  // Zolang dezelfde barcode in beeld blijft, meldt de camera hem steeds
  // opnieuw. Pas nadat hij even uit beeld is geweest mag dezelfde code nog
  // een keer als nieuw artikel worden geteld.
  scannerLaatstGezienOp = Date.now();
  scannerOntgrendelingPlannen();
  if (scannerVergrendeldeCodes.has(code)) return;
  if (scannerResultaatBezig) return;
  scannerResultaatBezig = true;
  scannerVergrendeldeCodes.add(code);

  const gevonden = productBijBarcode(code);
  if (!gevonden) {
    toonLaatstGescand(null, code, 0, 0);
    zetScannerStatus(`Barcode ${code} is niet bekend. Probeer een ander artikel.`, "waarschuwing");
    if (navigator.vibrate) navigator.vibrate([45, 45, 45]);
    scannerResultaatBezig = false;
    return;
  }

  const toegevoegd = stap(gevonden);
  const nieuwAantal = Number(staat.wagen[gevonden.id] || 0) + toegevoegd;
  staat.wagen[gevonden.id] = nieuwAantal;
  scannerWagenGewijzigd = true;

  // binnenapp_sync_cart vervangt de volledige gedeelde wagen. De bestaande
  // opslagfunctie bouwt daarom na iedere scan weer de complete inhoud op en
  // bundelt snel opeenvolgende scans binnen de rate limit.
  wagenOpslaan();
  badges();
  toonLaatstGescand(gevonden, code, toegevoegd, nieuwAantal);
  zetScannerStatus("Toegevoegd. Haal de barcode kort uit beeld voor een volgende scan.", "succes");
  if (navigator.vibrate) navigator.vibrate(70);
  scannerResultaatBezig = false;
}

function scannerOntgrendelingPlannen() {
  clearTimeout(scannerOntgrendelTimer);
  const wachttijd = 1050;
  scannerOntgrendelTimer = window.setTimeout(() => {
    if (Date.now() - scannerLaatstGezienOp < wachttijd) {
      scannerOntgrendelingPlannen();
      return;
    }
    scannerVergrendeldeCodes.clear();
    scannerLaatstGezienOp = 0;
    zetScannerStatus("Klaar voor de volgende barcode.");
  }, wachttijd);
}

function zetScannerStatus(tekst, soort = "") {
  const status = $("scannerStatus");
  const statusTekst = $("scannerStatusTekst");
  if (!status || !statusTekst) return;
  status.classList.remove("succes", "waarschuwing", "fout");
  if (soort) status.classList.add(soort);
  statusTekst.textContent = tekst;
}

function toonLaatstGescand(productRij, code, toegevoegd, nieuwAantal) {
  const vak = $("scannerLaatste");
  if (!vak) return;

  vak.classList.remove("leeg", "succes", "onbekend", "ververst");
  vak.classList.add(productRij ? "succes" : "onbekend");
  vak.innerHTML = productRij ? `
    <div class="scanner-laatste-label">Laatst gescand</div>
    <div class="scanner-laatste-regel">
      ${fotoBlok(productRij.product_image_url, productRij.description)}
      <div class="scanner-laatste-info">
        <strong>${esc(productRij.description)}</strong>
        <span>${esc(productRij.jb_code || code)} &middot; ${nieuwAantal} ${esc(productRij.unit || "st")} in wagen</span>
      </div>
      <div class="scanner-toegevoegd">+${toegevoegd}</div>
    </div>
  ` : `
    <div class="scanner-laatste-label">Laatste scan</div>
    <div class="scanner-onbekend">
      <strong>Artikel niet gevonden</strong>
      <span>${esc(code)}</span>
    </div>
  `;

  vak.classList.remove("ververst");
  void vak.offsetWidth;
  vak.classList.add("ververst");
}

async function scannerOpenen() {
  scannerStoppen();
  scannerResultaatBezig = false;
  scannerWagenGewijzigd = false;
  const sessie = scannerSessie;

  bladOpen(`
    <div class="scanner-kop">
      <div>
        <h2>Barcode scannen</h2>
        <div class="blad-sub">Richt de achtercamera op de barcode van het artikel.</div>
      </div>
      <button type="button" class="scanner-sluit" id="scannerSluit" aria-label="Scanner sluiten">&times;</button>
    </div>
    <div class="scanner-beeld">
      <video id="scannerVideo" muted playsinline aria-label="Camerabeeld voor de barcodescanner"></video>
      <div class="scanner-kader" aria-hidden="true"><span></span></div>
    </div>
    <div class="scanner-status" id="scannerStatus">
      <span class="scanner-statuspunt" aria-hidden="true"></span>
      <span id="scannerStatusTekst">Camera starten&hellip;</span>
    </div>
    <div class="scanner-laatste leeg" id="scannerLaatste">
      <div class="scanner-laatste-label">Laatst gescand</div>
      <div class="scanner-laatste-leeg">Nog geen artikel gescand</div>
    </div>
    <div class="scanner-acties">
      <button type="button" class="knop leeg klein hidden" id="scannerOpnieuw">Opnieuw proberen</button>
      <button type="button" class="knop leeg klein" id="scannerAnnuleer">Sluiten</button>
    </div>
  `);

  if (!navigator.mediaDevices?.getUserMedia) {
    toonScannerFout("Deze telefoon of browser geeft geen toegang tot de camera.");
    return;
  }

  const video = $("scannerVideo");
  try {
    scannerModuleBelofte ||= import("https://esm.sh/@zxing/browser@0.2.0");
    const { BrowserMultiFormatReader } = await scannerModuleBelofte;
    if (sessie !== scannerSessie || !video?.isConnected) return;

    const lezer = new BrowserMultiFormatReader();
    const bediening = await lezer.decodeFromConstraints({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }, video, (resultaat) => {
      if (!resultaat) return;
      const tekst = typeof resultaat.getText === "function" ? resultaat.getText() : resultaat.text;
      barcodeGevonden(tekst);
    });

    if (sessie !== scannerSessie || !video.isConnected) {
      bediening?.stop();
      return;
    }
    scannerBediening = bediening;
    zetScannerStatus("Richt de barcode binnen het kader.");
  } catch (error) {
    if (sessie !== scannerSessie) return;
    console.error("Scanner starten mislukt:", error);
    scannerModuleBelofte = null;
    scannerStoppen();
    toonScannerFout(scannerFoutTekst(error));
  }
}

function schermWagen() {
  const regels = wagenRegels();
  if (!regels.length) {
    return `<div class="lege-staat"><strong>Je wagen is leeg</strong>Voeg artikelen toe via de Winkel</div>`;
  }
  const totaal = regels.reduce((s, r) => s + regelBedrag(r.p.price_per_unit, r.aantal, r.p.packaged_per), 0);
  const stuks = regels.reduce((s, r) => s + r.aantal, 0);

  return `
    <div class="sorteer-regel">${sorteerKnopMarkup()}</div>
    <div class="telling">${regels.length} ${regels.length === 1 ? "artikel" : "artikelen"} &middot; ${stuks} stuks</div>
    ${regels.map((r) => artikelKaart(r.p, false)).join("")}
    <div class="kaart">
      <div class="detail-rij"><span>Totaal</span><span>${esc(geld(totaal))}</span></div>
    </div>
    <button class="knop" id="bestelKnop">Bestelling plaatsen</button>
  `;
}

function lijstVoorraad() {
  const q = zoekTekst(staat.zoek);
  const lijst = sorteerArtikelen(staat.producten.filter((p) =>
    !q || zoekTekst([p.description, p.jb_code, p.ean_code].join(" ")).includes(q)));

  return `<div class="telling">${lijst.length} ${lijst.length === 1 ? "artikel" : "artikelen"}</div>` + (lijst.length ? lijst.map((p) => {
    const voorraad = Number(p.stock || 0);
    const min = Number(p.min_stock || 0);
    const bezig = staat.voorraadBezig.has(Number(p.id));
    const chip = min > 0 && voorraad <= 0 ? `<span class="artikel-chip leeg-voorraad">Leeg</span>`
      : (min > 0 && voorraad < min) ? `<span class="artikel-chip laag">Laag</span>`
      : `<span class="artikel-chip op">Goed</span>`;
    const plek = artikelPositie(p);
    const eenheid = p.unit || "st";
    return `<div class="kaart voorraad-kaart ${bezig ? "voorraad-bezig" : ""}" data-voorraad-kaart="${p.id}"><div class="artikel">
      ${fotoBlok(p.product_image_url, p.description)}
      <div class="artikel-info">
        <div class="artikel-naam">${esc(p.description)}</div>
        <div class="artikel-meta">
          ${chip}
          ${p.jb_code ? `<span class="artikel-chip">${esc(p.jb_code)}</span>` : ""}
          <span class="artikel-chip">Minimum ${min} ${esc(eenheid)}</span>
          <span class="artikel-chip">Aanvulvoorraad ${Number(p.target_stock ?? min)} ${esc(eenheid)}</span>
          ${plek ? `<span class="artikel-chip">${esc(plek)}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="voorraad-bediening">
      <button type="button" class="voorraad-knop" data-voorraad-richting="-1" data-voorraad-id="${p.id}"
        aria-label="Voorraad van ${esc(p.description)} met één verlagen" ${bezig || voorraad <= 0 ? "disabled" : ""}>&minus;</button>
      <label class="voorraad-invoer">
        <span class="visueel-verborgen">Voorraad van ${esc(p.description)}</span>
        <input type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${voorraad}"
          data-voorraad-veld="${p.id}" aria-label="Huidige voorraad van ${esc(p.description)}" ${bezig ? "disabled" : ""}>
        <span>${esc(eenheid)}</span>
      </label>
      <button type="button" class="voorraad-knop" data-voorraad-richting="1" data-voorraad-id="${p.id}"
        aria-label="Voorraad van ${esc(p.description)} met één verhogen" ${bezig ? "disabled" : ""}>+</button>
      <button type="button" class="voorraad-opslaan" data-voorraad-opslaan="${p.id}"
        aria-label="Nieuwe voorraad van ${esc(p.description)} opslaan" disabled>
        ${bezig
          ? `<span class="voorraad-lader" aria-hidden="true"></span>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`}
      </button>
    </div>
    <div class="voorraad-hint">Pas met &minus; of + aan, of vul het exacte aantal in.</div>
    ${staat.beheerder ? `<details class="voorraad-grenzen"><summary>Minimum en aanvulvoorraad aanpassen</summary>
      <p>Onder het minimum bestellen we bij tot de aanvulvoorraad.</p>
      <div class="voorraad-grenzen-velden">
        <label>Minimumvoorraad<input id="minimum-${p.id}" type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${min}"></label>
        <label>Aanvulvoorraad<input id="aanvul-${p.id}" type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${Number(p.target_stock ?? min)}"></label>
      </div><button type="button" class="knop klein" data-grenzen-opslaan="${p.id}">Opslaan</button>
    </details>` : ""}
    </div>`;
  }).join("") : (staat.laadfout
    ? `<div class="lege-staat"><strong>Voorraad kon niet worden geladen</strong>${esc(staat.laadfout)}</div>`
    : `<div class="lege-staat"><strong>Geen artikelen gevonden</strong>Probeer een andere zoekterm</div>`));
}

function hertekenVoorraadLijst() {
  const lijst = $("lijst");
  if (lijst) lijst.innerHTML = lijstVoorraad();
}

async function voorraadGrenzenOpslaan(id, knop) {
  const p = product(Number(id));
  if (!staat.beheerder || !p.id || knop.disabled) return;
  const minimumTekst = $("minimum-" + p.id).value;
  const aanvulTekst = $("aanvul-" + p.id).value;
  const minimum = Number(minimumTekst), aanvul = Number(aanvulTekst);
  if (!minimumTekst || !aanvulTekst || !Number.isInteger(minimum) || !Number.isInteger(aanvul) || minimum < 0 || aanvul < minimum || aanvul > 1000000) {
    return melden("Vul hele aantallen in. Aanvulvoorraad moet minstens gelijk zijn aan het minimum (max. 1.000.000).");
  }
  knop.disabled = true;
  try {
    const {data, error} = await db.rpc("binnenapp_set_stock_levels", {
      p_product_id: p.id, p_min_stock: minimum, p_target_stock: aanvul,
      p_expected_min: Number(p.min_stock || 0), p_expected_target: Number(p.target_stock ?? p.min_stock ?? 0),
    });
    if (error) throw error;
    Object.assign(p, data);
    tekenScherm();
    melden("Minimum en aanvulvoorraad opgeslagen.");
  } catch (error) {
    melden(foutTekst(error));
  } finally { knop.disabled = false; }
}

function leesVoorraadVeld(id) {
  return document.querySelector(`[data-voorraad-veld="${Number(id)}"]`);
}

async function voorraadOpslaan(id, waarde) {
  const productId = Number(id);
  const p = product(productId);
  if (!p.id || staat.voorraadBezig.has(productId)) return;

  const oudeVoorraad = Number(p.stock || 0);
  const nieuweVoorraad = Number(waarde);
  if (!Number.isFinite(nieuweVoorraad) || !Number.isInteger(nieuweVoorraad)
      || nieuweVoorraad < 0 || nieuweVoorraad > 1000000) {
    melden("Vul een heel aantal tussen 0 en 1.000.000 in.");
    hertekenVoorraadLijst();
    return;
  }
  if (nieuweVoorraad === oudeVoorraad) {
    hertekenVoorraadLijst();
    return;
  }

  staat.voorraadBezig.add(productId);
  p.stock = nieuweVoorraad;
  hertekenVoorraadLijst();

  try {
    const { data, error } = await db.rpc("binnenapp_set_product_stock", {
      p_product_id: productId,
      p_stock: nieuweVoorraad,
      p_expected_stock: oudeVoorraad,
    });
    if (error) throw error;
    p.stock = Number(data?.stock ?? nieuweVoorraad);
    melden(`Voorraad aangepast naar ${p.stock} ${p.unit || "st"}.`);
  } catch (error) {
    const { data: actueel } = await db.from("products").select("*").eq("id", productId).maybeSingle();
    if (actueel) Object.assign(p, actueel);
    else p.stock = oudeVoorraad;
    melden(foutTekst(error));
  } finally {
    staat.voorraadBezig.delete(productId);
    hertekenVoorraadLijst();
  }
}

function wijzigVoorraad(id, richting) {
  const p = product(Number(id));
  if (!p.id) return;
  const veld = leesVoorraadVeld(id);
  const ingevuld = Number(veld?.value);
  const basis = Number.isFinite(ingevuld) && ingevuld >= 0 ? ingevuld : Number(p.stock || 0);
  voorraadOpslaan(id, Math.max(0, basis + Number(richting)));
}

function schermVoorraad() {
  const tekort = staat.producten.filter((p) => {
    const min = Number(p.min_stock || 0);
    return min > 0 && Number(p.stock || 0) < min;
  });

  return `
    <div class="zoekbalk">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="zoekVeld" type="search" placeholder="Zoek artikel" value="${esc(staat.zoek)}">
    </div>
    <div class="sorteer-regel">${sorteerKnopMarkup()}</div>
    ${tekort.length ? `<button class="knop leeg klein" id="aanvulKnop" style="margin-bottom:14px">
      ${tekort.length} ${tekort.length === 1 ? "artikel" : "artikelen"} aanvullen tot aanvulvoorraad</button>` : ""}
    <div id="lijst">${lijstVoorraad()}</div>
  `;
}

function orderDatum(nummer, status) {
  return staat.statusDatums.find((d) => d.order_number === nummer && d.status === status)?.bereikt_op || "";
}

function orderBedrag(o) {
  return (o.order_items || []).reduce(
    (s, r) => s + regelBedrag(r.price_per_unit, r.quantity, r.packaged_per), 0);
}

// De workflowstap 'Mail Verstuurd' is geen bewijs dat de leverancier mail ontving.
const mailStatussen = new Map();
const mailControles = new Set();
const mailControleMomenten = new Map();
const mailControleFouten = new Map();
const MAIL_STATUS_NAMEN = {
  bezig: "Wordt verzonden", verzonden: "Verzonden", afgeleverd: "Afgeleverd",
  vertraagd: "Vertraagd", mislukt: "Mislukt", onbekend: "Onbekend",
};
let mailStatusLaadbelofte = null;
let mailStatusGeladenOp = 0;
let mailStatusLaadfout = "";

function bewaarMailStatus(record) {
  if (!record || record.soort !== "leverancier" || !record.order_number) return;
  const bestaand = mailStatussen.get(record.order_number);
  const tijd = (r) => Math.max(Date.parse(r?.gecontroleerd_op) || 0, Date.parse(r?.geprobeerd_op) || 0);
  // Een trage lijstaanvraag mag een zojuist gecontroleerde status niet terugdraaien.
  if (bestaand && tijd(bestaand) > tijd(record)) return;
  mailStatussen.set(record.order_number, record);
}

function mailTijd(waarde) {
  if (!waarde) return "";
  const tijd = new Date(waarde);
  return Number.isNaN(tijd.getTime()) ? "" : tijd.toLocaleString("nl-NL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function mailStatusInhoud(nummer, detail = false) {
  const record = mailStatussen.get(nummer);
  const status = Object.hasOwn(MAIL_STATUS_NAMEN, record?.status) ? record.status : "onbekend";
  const bezig = mailControles.has(nummer);
  const fout = mailControleFouten.get(nummer) || record?.controle_fout || (!record ? mailStatusLaadfout : "");
  const tijd = mailTijd(record?.gecontroleerd_op || record?.geprobeerd_op);
  const uitleg = {
    bezig: "De verzendpoging wordt verwerkt. Controleer straks opnieuw.",
    verzonden: "De maildienst heeft de mail geaccepteerd. Aflevering bij Leys is nog niet bevestigd.",
    afgeleverd: "De mailserver van de ontvanger heeft de mail aangenomen. Dit betekent niet dat de mail is gelezen.",
    vertraagd: "Aflevering loopt vertraging op. De maildienst probeert het opnieuw.",
    mislukt: "De mail is niet verzonden of kon niet worden afgeleverd. De bestelling zelf is wel opgeslagen.",
    onbekend: "Er is nog geen betrouwbare mailstatus vastgelegd. De bestelstap hierboven is geen verzendbewijs.",
  }[status];
  return `<div class="order-mail-kop">
      <span class="order-mail-titel">Mail aan Leys</span>
      <span class="order-mail-status ${status}">${esc(MAIL_STATUS_NAMEN[status])}</span>
    </div>
    ${record?.ontvanger ? `<div class="order-mail-ontvanger">${esc(record.ontvanger)}</div>` : ""}
    ${tijd ? `<div class="order-mail-tijd">${record?.gecontroleerd_op ? "Gecontroleerd" : "Verzendpoging"}: ${esc(tijd)}</div>` : ""}
    ${detail ? `<p class="order-mail-uitleg">${esc(uitleg)}</p>
      ${record?.fout ? `<p class="order-mail-fout">${esc(record.fout)}</p>` : ""}
      ${fout ? `<p class="order-mail-fout" role="status">Controle niet gelukt: ${esc(fout)} De laatst bekende status blijft staan.</p>` : ""}
      <button type="button" class="knop leeg klein order-mail-controleer" data-mail-controleer="${esc(nummer)}" aria-disabled="${bezig}" aria-busy="${bezig}">
        ${bezig ? "Status controleren..." : "Opnieuw controleren"}
      </button>` : ""}`;
}

function mailStatusMarkup(nummer, detail = false) {
  return `<div class="order-mail ${detail ? "detail" : "compact"}" data-mail-order="${esc(nummer)}" data-mail-detail="${detail}" aria-live="polite" aria-atomic="true">${mailStatusInhoud(nummer, detail)}</div>`;
}

function werkMailStatusBlokkenBij(nummer = null) {
  document.querySelectorAll("[data-mail-order]").forEach((blok) => {
    if (nummer && blok.dataset.mailOrder !== nummer) return;
    const oudeKnop = blok.querySelector("[data-mail-controleer]");
    const hadFocus = oudeKnop && document.activeElement === oudeKnop;
    blok.innerHTML = mailStatusInhoud(blok.dataset.mailOrder, blok.dataset.mailDetail === "true");
    // Alleen de eigen knop terugfocussen; nooit focus uit een invoerveld halen.
    if (hadFocus) blok.querySelector("[data-mail-controleer]")?.focus({ preventScroll: true });
  });
}

async function laadMailStatussen(forceer = false) {
  if (!staat.gebruiker) return;
  if (mailStatusLaadbelofte) return mailStatusLaadbelofte;
  if (!forceer && Date.now() - mailStatusGeladenOp < 20000) return;
  mailStatusGeladenOp = Date.now();
  mailStatusLaadbelofte = (async () => {
    try {
      const { data, error } = await db.rpc("binnenapp_order_mail_status", { p_order_number: null });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("De mailstatus kon niet worden gelezen.");
      data.forEach(bewaarMailStatus);
      mailStatusLaadfout = "";
    } catch (error) {
      mailStatusLaadfout = foutTekst(error);
      console.warn("Mailstatus laden gaf een fout:", error);
    } finally {
      werkMailStatusBlokkenBij();
      mailStatusLaadbelofte = null;
    }
  })();
  return mailStatusLaadbelofte;
}

async function controleerMailStatus(nummer, handmatig = false) {
  if (!staat.orders.some((o) => o.order_number === nummer) || mailControles.has(nummer)) return;
  if (Date.now() - (mailControleMomenten.get(nummer) || 0) < 20000) {
    if (handmatig) melden("De mailstatus is zojuist gecontroleerd. Probeer het over enkele seconden opnieuw.");
    return;
  }
  mailControles.add(nummer);
  mailControleMomenten.set(nummer, Date.now());
  mailControleFouten.delete(nummer);
  werkMailStatusBlokkenBij(nummer);
  try {
    // Deze actie vraagt alleen de afleverstatus op; hij verstuurt nooit een mail.
    const { data, error } = await db.functions.invoke("send-order-mail", {
      body: { actie: "status", orderNumber: nummer },
    });
    if (error) throw error;
    if (!data || data.error) throw new Error(data?.error || "De mailstatus kon niet worden gecontroleerd.");
    if (data.status) bewaarMailStatus(data.status);
  } catch (error) {
    mailControleFouten.set(nummer, foutTekst(error));
    console.warn("Mailstatus controleren gaf een fout:", error);
  } finally {
    mailControles.delete(nummer);
    werkMailStatusBlokkenBij(nummer);
  }
}

function orderKaart(o) {
  const stapNr = stapVan(o.status);
  const isNalevering = String(o.order_number).toUpperCase().endsWith("NALEVERING");
  const regels = (o.order_items || []).length;

  const stapper = `<div class="stapper">${STAPPEN.map((s, i) => {
    const klasse = i < stapNr ? "gedaan" : i === stapNr ? "nu" : "komt";
    return `<div class="stap ${klasse}">
      <div class="stap-rail">
        <span class="stap-lijn links ${i <= stapNr ? "vol" : ""}"></span>
        <span class="stap-dot"></span>
        <span class="stap-lijn rechts ${i < stapNr ? "vol" : ""}"></span>
      </div>
      <div class="stap-naam">${esc(s)}</div>
    </div>`;
  }).join("")}</div>`;

  return `<div class="kaart order s${stapNr + 1}" data-order="${esc(o.order_number)}">
    <div class="order-kop">
      <div>
        <div class="order-nr">${esc(o.order_number)}</div>
        <div class="order-sub">${esc(datum(o.created_at))}${o.leys_order_number ? " &middot; Leys " + esc(o.leys_order_number) : ""}</div>
      </div>
      <div class="order-bedrag">${esc(geld(orderBedrag(o)))}</div>
    </div>
    ${o.expected_delivery_date ? `<div class="order-leverdatum-kort">Verwacht ${esc(datum(o.expected_delivery_date))}</div>` : ""}
    ${mailStatusMarkup(o.order_number)}
    ${o.status === "In magazijn" ? "" : stapper}
    <div class="order-voet">
      <span>${regels} ${regels === 1 ? "regel" : "regels"} &middot; ${esc(o.requester_name || "")}</span>
      <span>${isNalevering ? `<span class="nalev-chip">Nalevering</span>` : ""}
      ${o.status === "In magazijn" ? `<span class="artikel-chip op">In magazijn</span>` : ""}</span>
    </div>
  </div>`;
}

function schermBestellingen() {
  const lopend = staat.orders.filter((o) => o.status !== "In magazijn");
  const binnen = staat.orders.filter((o) => o.status === "In magazijn");
  if (!staat.orders.length) {
    return `<div class="lege-staat"><strong>Nog geen bestellingen</strong>Plaats er een via de Winkel</div>`;
  }
  return `
    ${lopend.length ? `<div class="telling">${lopend.length} lopend</div>${lopend.map(orderKaart).join("")}` : ""}
    ${binnen.length ? `<div class="telling" style="margin-top:18px">${binnen.length} in magazijn</div>${binnen.map(orderKaart).join("")}` : ""}
  `;
}

function schermRetour() {
  if (!staat.retour.length) {
    return `<div class="lege-staat"><strong>Retourlijst is leeg</strong>Open een bestelling en zet artikelen op retour</div>`;
  }
  const regels = sorteerArtikelen(staat.retour);
  return `
    <div class="sorteer-regel">${sorteerKnopMarkup()}</div>
    <div class="telling">${regels.length} ${regels.length === 1 ? "regel" : "regels"}</div>
    ${regels.map((r) => {
      const bron = sorteerBron(r);
      const positie = artikelPositie(bron);
      return `<div class="kaart">
      <div class="artikel">
        ${fotoBlok(r.product_image_url, r.description)}
        <div class="artikel-info">
          <div class="artikel-naam">${esc(r.description)}</div>
          <div class="artikel-meta">
            <span class="artikel-chip">${esc(r.order_number)}</span>
            <span class="artikel-chip op">${esc(r.quantity)} ${esc(r.unit || "st")}</span>
            ${bron.jb_code ? `<span class="artikel-chip">${esc(bron.jb_code)}</span>` : ""}
            ${positie ? `<span class="artikel-chip">${esc(positie)}</span>` : ""}
          </div>
          ${r.reason ? `<div class="order-sub" style="margin-top:6px">${esc(r.reason)}</div>` : ""}
        </div>
      </div>
      <button class="knop rood klein" data-retour-weg="${esc(r.id)}" style="margin-top:11px">Van lijst halen</button>
    </div>`;
    }).join("")}
  `;
}

// ── Bestellingsdetail ───────────────────────────────────────────────────
function orderPdfKaart(order) {
  const beschikbaar = Boolean(String(order.confirmation_pdf_path || "").trim()
    || String(order.confirmation_pdf_url || "").trim());
  return `<section class="order-document" aria-label="Orderbevestiging">
    <div class="order-document-kop">
      <span class="order-document-icoon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>
      </span>
      <div>
        <h3>Orderbevestiging</h3>
        <p class="order-document-bestand">${beschikbaar
          ? esc(order.confirmation_pdf_name || "PDF van Leys")
          : "Nog geen orderbevestiging beschikbaar"}</p>
      </div>
    </div>
    ${beschikbaar
      ? `<button type="button" class="knop leeg klein order-document-bekijken" data-order-pdf="${esc(order.order_number)}" aria-label="Orderbevestiging van ${esc(order.order_number)} bekijken">PDF bekijken</button>`
      : `<p class="order-document-uitleg">Voeg de PDF toe bij deze bestelling in de pc-app. Daarna kun je hem hier bekijken.</p>`}
  </section>`;
}

async function laadOrderPdf(orderId) {
  // Controleer de bestelling opnieuw onder de huidige sessie, ook bij opnieuw proberen.
  const { data: order, error: orderFout } = await db.from("orders")
    .select("id,order_number,confirmation_pdf_path,confirmation_pdf_url,confirmation_pdf_name")
    .eq("id", orderId).maybeSingle();
  if (orderFout) throw new Error("De bestelling kon niet worden gecontroleerd. Controleer je verbinding en of je bent ingelogd.");
  if (!order) throw new Error("Deze bestelling bestaat niet meer of je hebt geen toegang.");

  const pad = String(order.confirmation_pdf_path || "").trim();
  if (!pad) {
    if (order.confirmation_pdf_url) {
      throw new Error("Deze PDF heeft alleen een oude documentlink. Upload de orderbevestiging opnieuw bij deze bestelling in de pc-app.");
    }
    throw new Error("Er is nog geen orderbevestiging aan deze bestelling toegevoegd.");
  }
  // Alleen een object in onze privéopslag lezen, nooit een losse externe URL ophalen.
  if (pad.length > 1024 || /^[a-z][a-z\d+.-]*:/i.test(pad) || /[\\%?#\u0000-\u001f\u007f]/.test(pad)
    || pad.split("/").some((deel) => !deel || deel === "." || deel === "..")) {
    throw new Error("De opgeslagen PDF-verwijzing is ongeldig. Upload de orderbevestiging opnieuw in de pc-app.");
  }

  const { data: bestand, error: downloadFout } = await db.storage.from("order-confirmations").download(pad);
  if (downloadFout || !bestand) {
    throw new Error("De PDF kon niet worden opgehaald. Probeer opnieuw of laat de orderbevestiging opnieuw uploaden in de pc-app.");
  }
  if (!bestand.size) throw new Error("De opgeslagen PDF is leeg.");
  if (bestand.size > 10 * 1024 * 1024) throw new Error("De PDF mag maximaal 10 MB zijn.");
  if (String(bestand.type || "").split(";")[0].trim().toLowerCase() !== "application/pdf") {
    throw new Error("Het opgeslagen document is geen PDF. Upload de juiste orderbevestiging in de pc-app.");
  }
  const bytes = new Uint8Array(await bestand.arrayBuffer());
  if (!new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    throw new Error("Het opgeslagen document is geen geldig PDF-bestand. Upload de juiste orderbevestiging in de pc-app.");
  }
  return { bytes, naam: String(order.confirmation_pdf_name || "Orderbevestiging.pdf") };
}

async function bekijkOrderPdf(nummer) {
  const order = staat.orders.find((o) => o.order_number === nummer);
  if (!order?.id) throw new Error("De bestelling is niet meer beschikbaar. Open de bestellingen opnieuw.");
  if (!window.BinnenPdf?.open) throw new Error("De PDF-viewer is nog niet geladen. Open BinnenApp opnieuw.");
  await window.BinnenPdf.open({
    titel: "Orderbevestiging",
    bestandsnaam: String(order.confirmation_pdf_name || "Orderbevestiging.pdf"),
    bestelnummer: order.order_number,
    laden: () => laadOrderPdf(order.id),
  });
}

function toonOrder(nummer) {
  const o = staat.orders.find((x) => x.order_number === nummer);
  if (!o) return;
  const regels = sorteerArtikelen(o.order_items || []);

  bladOpen(`
    <h2>${esc(o.order_number)}</h2>
    <div class="blad-sub">${esc(datum(o.created_at))} &middot; ${esc(o.requester_name || "")}</div>

    <div class="detail-rij"><span>Status</span><span>${esc(o.status)}</span></div>
    ${o.delivery_date ? `<div class="detail-rij"><span>Gewenste leverdatum</span><span>${esc(datum(o.delivery_date))}</span></div>` : ""}
    ${o.reference ? `<div class="detail-rij"><span>Referentie</span><span>${esc(o.reference)}</span></div>` : ""}
    ${o.leys_order_number ? `<div class="detail-rij"><span>Leys-nummer</span><span>${esc(o.leys_order_number)}</span></div>` : ""}
    <div class="detail-rij"><span>Totaal</span><span>${esc(geld(orderBedrag(o)))}</span></div>
    <section class="order-leverdatum" id="orderLeverdatum" data-leverdatum-order="${esc(o.order_number)}" aria-label="Verwachte leverdatum">${leverdatumInhoud(o)}</section>
    ${orderPdfKaart(o)}
    ${mailStatusMarkup(o.order_number, true)}

    <h2 style="margin-top:22px;font-size:15px">Artikelen</h2>
    <div class="blad-sub">${regels.length} ${regels.length === 1 ? "regel" : "regels"}</div>
    <div class="sorteer-regel in-blad">${sorteerKnopMarkup("", o.order_number)}</div>
    ${regels.map((r) => {
      const bron = sorteerBron(r);
      const positie = artikelPositie(bron);
      return `<div class="kaart">
      <div class="artikel">
        ${fotoBlok(r.product_image_url, r.description)}
        <div class="artikel-info">
          <div class="artikel-naam">${esc(r.description)}</div>
          <div class="artikel-meta">
            <span class="artikel-chip op">${esc(r.quantity)} ${esc(r.unit || "st")}</span>
            ${bron.jb_code ? `<span class="artikel-chip">${esc(bron.jb_code)}</span>` : ""}
            ${positie ? `<span class="artikel-chip">${esc(positie)}</span>` : ""}
            ${r.ean_code ? `<span class="artikel-chip">EAN ${esc(r.ean_code)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="regel" style="margin-top:11px">
        <button class="knop leeg klein" data-retour="${esc(r.id)}">Retour</button>
        ${String(o.order_number).toUpperCase().endsWith("NALEVERING") ? "" :
          `<button class="knop leeg klein" data-nalever="${esc(r.id)}" data-order="${esc(o.order_number)}">Nalevering</button>`}
      </div>
    </div>`;
    }).join("")}
  `);
  initLeverdatumKiezer(o.order_number);
  void controleerMailStatus(o.order_number);
}

// De verwachte datum staat los van de gewenste datum op de oorspronkelijke bestelling.
const leverdatumBewerkingen = new Map();
let leverdatumSchrijfVersie = 0;

function leesLeverdatum(waarde) {
  if (typeof waarde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(waarde)) return null;
  const [jaar, maand, dag] = waarde.split("-").map(Number);
  const gekozen = new Date(jaar, maand - 1, dag);
  return jaar >= 2020 && jaar <= 2100 && naarISO(gekozen) === waarde ? gekozen : null;
}

function leverdatumInhoud(order) {
  const bewerking = leverdatumBewerkingen.get(order.order_number);
  const nummer = esc(order.order_number);
  const huidigeDatum = order.expected_delivery_date || null;
  if (!bewerking?.bewerken) {
    return `<div class="order-leverdatum-kop"><div><h3>Verwachte leverdatum</h3>
      <p class="order-leverdatum-waarde">${huidigeDatum ? esc(datum(huidigeDatum)) : "Nog niet bekend"}</p></div>
      <button type="button" class="knop leeg klein" data-leverdatum-actie="bewerken" data-leverdatum-nummer="${nummer}">${huidigeDatum ? "Wijzigen" : "Datum kiezen"}</button></div>
      <p class="order-leverdatum-uitleg">Wanneer verwacht je deze bestelling van Leys?</p>`;
  }
  const ongewijzigd = bewerking.concept === bewerking.basis;
  const opslaanGeblokkeerd = bewerking.bezig || ongewijzigd || bewerking.conflict
    || (!bewerking.wissen && !leesLeverdatum(bewerking.concept));
  return `<div class="order-leverdatum-kop"><div><h3 id="oVerwachtVeldLabel">Verwachte leverdatum</h3>
    <p class="order-leverdatum-uitleg">Je keuze wordt pas bewaard met Opslaan. De gewenste leverdatum blijft staan.</p></div></div>
    <fieldset class="order-leverdatum-velden" ${bewerking.bezig ? "disabled" : ""}>
      ${datepickMarkup("oVerwacht", { resetTekst: "Keuze leegmaken" })}
      <div class="order-leverdatum-acties">
        <button type="button" class="knop klein" data-leverdatum-actie="opslaan" data-leverdatum-nummer="${nummer}" ${opslaanGeblokkeerd ? "disabled" : ""}>${bewerking.bezig ? "Bezig..." : "Opslaan"}</button>
        <button type="button" class="knop leeg klein" data-leverdatum-actie="wissen" data-leverdatum-nummer="${nummer}" ${bewerking.bezig || (!bewerking.basis && !bewerking.concept) ? "disabled" : ""}>Wissen</button>
        <button type="button" class="knop leeg klein" data-leverdatum-actie="annuleren" data-leverdatum-nummer="${nummer}" ${bewerking.bezig ? "disabled" : ""}>Annuleren</button>
      </div>
    </fieldset>
    ${bewerking.wissen && !bewerking.fout ? '<p class="order-leverdatum-uitleg" role="status">De datum wordt verwijderd wanneer je op Opslaan klikt.</p>' : ""}
    ${bewerking.fout ? `<p class="order-leverdatum-fout" role="alert">${esc(bewerking.fout)}</p>` : ""}
    ${bewerking.conflict ? `<button type="button" class="knop leeg klein order-leverdatum-ophalen" data-leverdatum-actie="ophalen" data-leverdatum-nummer="${nummer}" ${bewerking.bezig ? "disabled" : ""}>Actuele datum ophalen</button>` : ""}
    ${bewerking.opgehaald ? `<p class="order-leverdatum-uitleg" role="status">Nu opgeslagen: ${bewerking.basis ? esc(datum(bewerking.basis)) : "geen datum"}. Je eigen keuze staat nog in de kalender. Controleer die voordat je opnieuw opslaat.</p>` : ""}`;
}

function initLeverdatumKiezer(nummer) {
  const bewerking = leverdatumBewerkingen.get(nummer);
  if (!bewerking?.bewerken || !$("oVerwacht")) return;
  datepickInit("oVerwacht", {
    min: new Date(2020, 0, 1), max: new Date(2100, 11, 31),
    leegToegestaan: true, waarde: leesLeverdatum(bewerking.concept), standaard: () => null,
    bijWijziging: (gekozen) => {
      if (bewerking.bezig || leverdatumBewerkingen.get(nummer) !== bewerking) return;
      bewerking.concept = gekozen ? naarISO(gekozen) : null;
      bewerking.wissen = !gekozen && Boolean(bewerking.basis);
      if (!bewerking.conflict) bewerking.fout = "";
      werkLeverdatumBlokBij(nummer);
    },
  });
}

function werkLeverdatumBlokBij(nummer) {
  const blok = $("orderLeverdatum");
  const order = staat.orders.find((o) => o.order_number === nummer);
  // Alleen het eigen, nog geopende formulier bijwerken; nooit een ander bestelblad.
  if (!order || !blok || blok.dataset.leverdatumOrder !== nummer || !$("blad").classList.contains("open")) return;
  blok.innerHTML = leverdatumInhoud(order);
  initLeverdatumKiezer(nummer);
}

function leverdatumActie(nummer, actie) {
  const order = staat.orders.find((o) => o.order_number === nummer);
  if (!order) return;
  let bewerking = leverdatumBewerkingen.get(nummer);
  if (bewerking?.bezig) return;
  if (actie === "bewerken") {
    bewerking = { basis: order.expected_delivery_date || null, concept: order.expected_delivery_date || null,
      bewerken: true, bezig: false, wissen: false, fout: "", conflict: false, opgehaald: false,
      schrijfVersie: bewerking?.schrijfVersie || 0 };
    leverdatumBewerkingen.set(nummer, bewerking);
  } else if (!bewerking?.bewerken) return;
  else if (actie === "annuleren") bewerking.bewerken = false;
  else if (actie === "wissen") {
    bewerking.concept = null;
    bewerking.wissen = Boolean(bewerking.basis);
    if (!bewerking.conflict) bewerking.fout = "";
  } else if (actie === "opslaan") {
    void slaLeverdatumOp(nummer, bewerking);
    return;
  } else if (actie === "ophalen") {
    void haalActueleLeverdatumOp(nummer, bewerking);
    return;
  }
  werkLeverdatumBlokBij(nummer);
}

async function slaLeverdatumOp(nummer, bewerking) {
  if (bewerking.bezig || bewerking.conflict || bewerking.concept === bewerking.basis) return;
  if (!bewerking.wissen && !leesLeverdatum(bewerking.concept)) return;
  const gekozen = bewerking.wissen ? null : bewerking.concept;
  const gebruikerId = staat.gebruiker?.id;
  bewerking.bezig = true;
  bewerking.fout = "";
  werkLeverdatumBlokBij(nummer);
  try {
    const { data, error } = await db.rpc("binnenapp_update_expected_delivery_date", {
      p_order_number: nummer, p_date: gekozen, p_expected_date: bewerking.basis,
    });
    if (error) throw error;
    if (data?.orderNumber !== nummer || data.expectedDeliveryDate !== gekozen) {
      throw new Error("Opslaan kon niet worden bevestigd. Haal de actuele datum op voordat je opnieuw probeert.");
    }
    if (staat.gebruiker?.id !== gebruikerId || leverdatumBewerkingen.get(nummer) !== bewerking) return;
    const order = staat.orders.find((o) => o.order_number === nummer);
    if (order) order.expected_delivery_date = gekozen;
    bewerking.basis = gekozen;
    bewerking.concept = gekozen;
    bewerking.schrijfVersie = ++leverdatumSchrijfVersie;
    bewerking.bewerken = false;
    bewerking.opgehaald = false;
    tekenScherm(true);
    melden(gekozen ? "Verwachte leverdatum opgeslagen." : "Verwachte leverdatum verwijderd.");
  } catch (error) {
    // Ook bij een onzekere netwerkuitkomst eerst lezen; nooit vanzelf nogmaals schrijven.
    bewerking.conflict = true;
    bewerking.fout = error?.code === "40001" || /gewijzigd|conflict/i.test(foutTekst(error))
      ? "De verwachte leverdatum is ondertussen gewijzigd. Je eigen keuze blijft bewaard. Haal eerst de actuele datum op."
      : "Opslaan is niet bevestigd: " + foutTekst(error) + " Je eigen keuze blijft bewaard. Haal de actuele datum op voordat je opnieuw opslaat.";
  } finally {
    bewerking.bezig = false;
    if (staat.gebruiker?.id === gebruikerId) werkLeverdatumBlokBij(nummer);
  }
}

async function haalActueleLeverdatumOp(nummer, bewerking) {
  if (bewerking.bezig) return;
  const gebruikerId = staat.gebruiker?.id;
  bewerking.bezig = true;
  werkLeverdatumBlokBij(nummer);
  try {
    const { data, error } = await db.from("orders").select("order_number,expected_delivery_date")
      .eq("order_number", nummer).single();
    if (error) throw error;
    if (data?.order_number !== nummer || (data.expected_delivery_date !== null && !leesLeverdatum(data.expected_delivery_date))) {
      throw new Error("De actuele datum kon niet betrouwbaar worden gelezen.");
    }
    if (staat.gebruiker?.id !== gebruikerId || leverdatumBewerkingen.get(nummer) !== bewerking) return;
    const order = staat.orders.find((o) => o.order_number === nummer);
    if (order) order.expected_delivery_date = data.expected_delivery_date;
    bewerking.basis = data.expected_delivery_date;
    bewerking.wissen = !bewerking.concept && Boolean(bewerking.basis);
    bewerking.schrijfVersie = ++leverdatumSchrijfVersie;
    bewerking.conflict = false;
    bewerking.fout = "";
    bewerking.opgehaald = true;
    tekenScherm(true);
  } catch (error) {
    bewerking.fout = "Actuele datum ophalen is niet gelukt: " + foutTekst(error) + " Je eigen keuze blijft bewaard.";
  } finally {
    bewerking.bezig = false;
    if (staat.gebruiker?.id === gebruikerId) werkLeverdatumBlokBij(nummer);
  }
}

// ── Bestellen ───────────────────────────────────────────────────────────
function standaardLeverdatum() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function naarISO(d) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Eigen datumkiezer, zodat het bestelblad op elke telefoon dezelfde bediening heeft.
const DATUMKIEZERS = {};

function startVanDag(waarde) {
  const d = new Date(waarde);
  d.setHours(0, 0, 0, 0);
  return d;
}

function langeDatum(d) {
  return d.toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function datepickMarkup(id, opties = {}) {
  return `<div class="datepick" id="${esc(id)}">
    <button type="button" class="datepick-trigger" data-datepick-toggle="${esc(id)}"
            aria-expanded="false" aria-controls="${esc(id)}Kalender" aria-labelledby="${esc(id)}VeldLabel ${esc(id)}Waarde">
      <span id="${esc(id)}Waarde">Kies een datum</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>
      </svg>
    </button>
    <div class="datepick-pop" id="${esc(id)}Kalender">
      <div class="datepick-head">
        <button type="button" class="datepick-nav" data-datepick-verschuif="-1" data-datepick-id="${esc(id)}" aria-label="Vorige maand">&#8249;</button>
        <span id="${esc(id)}Maand"></span>
        <button type="button" class="datepick-nav" data-datepick-verschuif="1" data-datepick-id="${esc(id)}" aria-label="Volgende maand">&#8250;</button>
      </div>
      <div class="datepick-weekdays" aria-hidden="true"><span>ma</span><span>di</span><span>wo</span><span>do</span><span>vr</span><span>za</span><span>zo</span></div>
      <div class="datepick-grid" id="${esc(id)}Raster"></div>
      <button type="button" class="datepick-reset" data-datepick-reset="${esc(id)}">${esc(opties.resetTekst || "Terug naar standaard")}</button>
    </div>
  </div>`;
}

function datepickInit(id, opties = {}) {
  DATUMKIEZERS[id] = {
    datum: null,
    maand: null,
    min: opties.min ? startVanDag(opties.min) : null,
    max: opties.max ? startVanDag(opties.max) : null,
    standaard: opties.standaard || (() => startVanDag(new Date())),
    leegToegestaan: opties.leegToegestaan === true,
    bijWijziging: opties.bijWijziging,
  };
  datepickSet(id, opties.leegToegestaan ? opties.waarde : opties.waarde || DATUMKIEZERS[id].standaard());
}

function datepickSet(id, waarde) {
  const kiezer = DATUMKIEZERS[id];
  if (!kiezer) return;
  if (waarde == null && kiezer.leegToegestaan) {
    kiezer.datum = null;
    const vandaag = new Date();
    kiezer.maand = new Date(vandaag.getFullYear(), vandaag.getMonth(), 1);
    const label = $(id + "Waarde");
    if (label) label.textContent = "Kies een datum";
    datepickRender(id);
    return;
  }
  let gekozen = startVanDag(waarde);
  if (kiezer.min && gekozen < kiezer.min) gekozen = new Date(kiezer.min);
  if (kiezer.max && gekozen > kiezer.max) gekozen = new Date(kiezer.max);
  kiezer.datum = gekozen;
  kiezer.maand = new Date(gekozen.getFullYear(), gekozen.getMonth(), 1);
  const label = $(id + "Waarde");
  if (label) label.textContent = langeDatum(gekozen);
  datepickRender(id);
}

function datepickValue(id) {
  return DATUMKIEZERS[id]?.datum || null;
}

function datepickRender(id) {
  const kiezer = DATUMKIEZERS[id];
  const raster = $(id + "Raster");
  const maandLabel = $(id + "Maand");
  if (!kiezer || !raster || !kiezer.maand) return;

  maandLabel.textContent = kiezer.maand.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  const jaar = kiezer.maand.getFullYear();
  const maand = kiezer.maand.getMonth();
  const eerste = new Date(jaar, maand, 1);
  const aantalDagen = new Date(jaar, maand + 1, 0).getDate();
  const offset = (eerste.getDay() + 6) % 7;
  const vandaag = startVanDag(new Date());
  let html = "";

  for (let i = 0; i < offset; i++) {
    html += '<button type="button" class="datepick-day empty" disabled aria-hidden="true"></button>';
  }

  for (let dag = 1; dag <= aantalDagen; dag++) {
    const datum = new Date(jaar, maand, dag);
    const buitenBereik = (kiezer.min && datum < kiezer.min) || (kiezer.max && datum > kiezer.max);
    const klassen = ["datepick-day"];
    if (datum.getDay() === 0 || datum.getDay() === 6) klassen.push("weekend");
    if (datum.getTime() === vandaag.getTime()) klassen.push("today");
    if (kiezer.datum && datum.getTime() === kiezer.datum.getTime()) klassen.push("selected");
    html += `<button type="button" class="${klassen.join(" ")}" data-datepick-dag="${naarISO(datum)}" data-datepick-id="${esc(id)}"
      aria-label="${esc(langeDatum(datum))}" ${kiezer.datum?.getTime() === datum.getTime() ? 'aria-pressed="true"' : ""}
      ${datum.getTime() === vandaag.getTime() ? 'aria-current="date"' : ""} ${buitenBereik ? "disabled" : ""}>${dag}</button>`;
  }
  raster.innerHTML = html;
}

function datepickToggle(id) {
  const element = $(id);
  const kiezer = DATUMKIEZERS[id];
  if (!element || !kiezer) return;
  const open = !element.classList.contains("open");
  document.querySelectorAll(".datepick.open").forEach((ander) => {
    ander.classList.remove("open");
    ander.querySelector(".datepick-trigger")?.setAttribute("aria-expanded", "false");
  });
  element.classList.toggle("open", open);
  element.querySelector(".datepick-trigger")?.setAttribute("aria-expanded", String(open));
  if (open) datepickRender(id);
}

function datepickVerschuif(id, richting) {
  const kiezer = DATUMKIEZERS[id];
  if (!kiezer?.maand) return;
  kiezer.maand = new Date(kiezer.maand.getFullYear(), kiezer.maand.getMonth() + richting, 1);
  datepickRender(id);
}

function datepickKies(id, isoDatum) {
  if ($(id)?.closest("fieldset")?.disabled) return;
  const [jaar, maand, dag] = String(isoDatum).split("-").map(Number);
  if (!jaar || !maand || !dag) return;
  datepickSet(id, new Date(jaar, maand - 1, dag));
  const element = $(id);
  element?.classList.remove("open");
  element?.querySelector(".datepick-trigger")?.setAttribute("aria-expanded", "false");
  DATUMKIEZERS[id]?.bijWijziging?.(datepickValue(id));
}

function datepickReset(id) {
  if ($(id)?.closest("fieldset")?.disabled) return;
  const kiezer = DATUMKIEZERS[id];
  if (!kiezer) return;
  datepickSet(id, kiezer.standaard());
  const element = $(id);
  element?.classList.remove("open");
  element?.querySelector(".datepick-trigger")?.setAttribute("aria-expanded", "false");
  kiezer.bijWijziging?.(datepickValue(id));
}

function bestelFormulier() {
  const bewaard = JSON.parse(localStorage.getItem("binnenapp_besteller") || "{}");
  const regels = wagenRegels();
  const totaal = regels.reduce((s, r) => s + regelBedrag(r.p.price_per_unit, r.aantal, r.p.packaged_per), 0);

  bladOpen(`
    <h2>Bestelling plaatsen</h2>
    <div class="blad-sub">${regels.length} artikelen &middot; ${esc(geld(totaal))}</div>
    <div class="veld">
      <label for="bNaam">Naam</label>
      <input id="bNaam" type="text" autocomplete="name" value="${esc(bewaard.naam || staat.gebruiker?.email?.split("@")[0] || "")}" placeholder="Jouw naam">
    </div>
    <div class="veld">
      <label for="bMail">E-mail voor de bevestiging</label>
      <input id="bMail" type="email" inputmode="email" autocomplete="email" value="${esc(bewaard.mail || staat.gebruiker?.email || "")}" placeholder="jij@janssen-bouw.nl">
    </div>
    <div class="veld">
      <label for="bRef">Referentie</label>
      <input id="bRef" type="text" value="${esc(bewaard.referentie || "")}" placeholder="Werknummer of project">
    </div>
    <div class="veld">
      <label id="bDatumVeldLabel">Gewenste leverdatum</label>
      ${datepickMarkup("bDatum")}
    </div>
    <button class="knop" id="bVerstuur">Bestelling versturen</button>
  `);
  datepickInit("bDatum", {
    min: new Date(),
    standaard: standaardLeverdatum,
    waarde: standaardLeverdatum(),
  });
}

async function bestelVersturen() {
  if (staat.bezig) return;
  const naam = $("bNaam").value.trim();
  const mail = $("bMail").value.trim();
  const referentie = $("bRef").value.trim();
  const gekozenLeverdatum = datepickValue("bDatum");
  const leverdatum = gekozenLeverdatum ? naarISO(gekozenLeverdatum) : "";

  if (naam.length < 2) return melden("Vul je naam in.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return melden("Vul een geldig e-mailadres in.");

  staat.bezig = true;
  const knop = $("bVerstuur");
  knop.disabled = true;
  knop.textContent = "Bezig met versturen...";

  const pad = (v) => String(v).padStart(2, "0");
  const nu = new Date();
  const nummer = "#ORD-" + nu.getFullYear() + pad(nu.getMonth() + 1) + pad(nu.getDate()) +
    pad(nu.getHours()) + pad(nu.getMinutes()) + pad(nu.getSeconds());

  const regels = wagenRegels();

  try {
    // Winkelwagen eerst zeker weten gelijkzetten, de RPC leest die server-side
    const { error: wagenFout } = await db.rpc("binnenapp_sync_cart", {
      p_items: regels.map((r) => ({ product_id: r.p.id, quantity: r.aantal })),
    });
    if (wagenFout) throw wagenFout;

    const { error } = await db.rpc("binnenapp_place_order", {
      p_order_number: nummer,
      p_requester_name: naam,
      p_requester_email: mail,
      p_team: "Binnenploeg",
      p_reference: referentie || null,
      p_delivery_date: leverdatum || null,
    });
    if (error) throw error;

    localStorage.setItem("binnenapp_besteller", JSON.stringify({ naam, mail, referentie }));

    // De bestelling blijft bewaard als mailen mislukt; meld dat wel zichtbaar.
    let mailWaarschuwing = "";
    try {
      const { data: mailResultaat, error: mailFout } = await db.functions.invoke("send-order-mail", {
        body: {
          to: mail,
          orderNumber: nummer,
          besteldDoor: naam,
          referentie,
          leverdatum: gekozenLeverdatum
            ? gekozenLeverdatum.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            : "",
          items: regels.map((r) => ({
            omschrijving: r.p.description,
            aantal: r.aantal,
            eenheid: r.p.unit || "st",
            jbCode: r.p.jb_code || "",
            eanCode: r.p.ean_code || "",
            foto: r.p.product_image_url || "",
          })),
        },
      });
      if (mailResultaat?.status) bewaarMailStatus(mailResultaat.status);
      if (mailFout) throw mailFout;
      if (mailResultaat?.onzeker === true || ["bezig", "onbekend"].includes(mailResultaat?.status?.status)) {
        mailWaarschuwing = "Bestelling opgeslagen. De mailverzending kon niet worden bevestigd; bekijk de mailstatus bij de bestelling.";
      } else if (mailResultaat?.melding === false) {
        mailWaarschuwing = "Bestelling opgeslagen, maar de mail aan Leys is niet verzonden. Bekijk de mailstatus bij de bestelling.";
      } else if (mailResultaat?.sent === false) {
        mailWaarschuwing = mailResultaat?.melding === true
          ? "Bestelling opgeslagen en mail aan Leys verzonden, maar je bevestigingsmail is niet verzonden."
          : "Bestelling opgeslagen, maar de mail is niet verzonden. Bekijk de mailstatus bij de bestelling.";
      } else if (mailResultaat?.sent === true && mailResultaat?.bevestigingFout) {
        mailWaarschuwing = "Bestelling opgeslagen en mail aan Leys verzonden, maar je bevestigingsmail is niet verzonden.";
      } else if (mailResultaat?.sent !== true) {
        mailWaarschuwing = "Bestelling opgeslagen. De mailverzending kon niet worden bevestigd; bekijk de mailstatus bij de bestelling.";
      }
    } catch (mailFout) {
      console.warn("Mail mislukt:", mailFout);
      mailWaarschuwing = "Bestelling opgeslagen. De mailverzending kon niet worden bevestigd; bekijk de mailstatus bij de bestelling.";
    }

    bladDicht();
    await laadAlles();
    void laadMailStatussen(true);
    staat.tab = "bestellingen";
    zetTab();
    melden(mailWaarschuwing || "Bestelling " + nummer + " geplaatst.");
  } catch (e) {
    melden(foutTekst(e));
  } finally {
    staat.bezig = false;
    if ($("bVerstuur")) {
      $("bVerstuur").disabled = false;
      $("bVerstuur").textContent = "Bestelling versturen";
    }
  }
}

// ── Acties ──────────────────────────────────────────────────────────────
async function retourToevoegen(itemId) {
  const regel = staat.orders.flatMap((o) => o.order_items || []).find((r) => String(r.id) === String(itemId));
  const order = staat.orders.find((o) => (o.order_items || []).some((r) => String(r.id) === String(itemId)));
  if (!regel || !order) return;
  try {
    const { error } = await db.rpc("binnenapp_add_retour_item", {
      p_order_number: order.order_number,
      p_description: regel.description,
      p_ean_code: regel.ean_code,
      p_jb_code: regel.jb_code,
      p_quantity: regel.quantity,
      p_unit: regel.unit,
      p_product_image_url: regel.product_image_url,
    });
    if (error) throw error;
    await laadAlles();
    badges();
    melden("Toegevoegd aan retour.");
  } catch (e) { melden(foutTekst(e)); }
}

async function retourWeg(id) {
  try {
    const { error } = await db.rpc("binnenapp_remove_retour_item", { p_id: id });
    if (error) throw error;
    await laadAlles();
    tekenScherm();
    badges();
  } catch (e) { melden(foutTekst(e)); }
}

async function naleveren(orderNummer, itemId) {
  try {
    const { data, error } = await db.rpc("binnenapp_add_to_nalevering", {
      p_order_number: orderNummer,
      p_item_id: Number(itemId),
    });
    if (error) throw error;
    bladDicht();
    await laadAlles();
    tekenScherm();
    melden(data?.nieuweBestelling ? "Nalevering " + data.orderNumber + " aangemaakt." : "Toegevoegd aan de nalevering.");
  } catch (e) { melden(foutTekst(e)); }
}

function voorraadAanvullen() {
  const tekorten = staat.producten.filter((p) => {
    const min = Number(p.min_stock || 0);
    return min > 0 && Number(p.stock || 0) < min;
  });
  let aantalToegevoegd = 0;
  tekorten.forEach((p) => {
    const tekort = Number(p.target_stock ?? p.min_stock ?? 0) - Number(p.stock || 0);
    const s = stap(p);
    const nodig = s > 1 ? Math.ceil(tekort / s) * s : Math.ceil(tekort);
    if (nodig > Number(staat.wagen[p.id] || 0)) {
      staat.wagen[p.id] = nodig;
      aantalToegevoegd++;
    }
  });
  if (!aantalToegevoegd) return melden("De wagen dekt de tekorten al.");
  wagenOpslaan();
  badges();
  melden(aantalToegevoegd + " artikelen aangevuld in de wagen.");
}

// ── Navigatie ───────────────────────────────────────────────────────────
let tabIndicatorKlaar = false;
let tabIndicatorFrame = 0;
let tabSleep = null;
let tabSleepFrame = 0;
let tabKlikRemTot = 0;

function werkTabIndicatorBij(direct = false) {
  cancelAnimationFrame(tabIndicatorFrame);
  if (tabSleep?.actief) return;
  tabIndicatorFrame = requestAnimationFrame(() => {
    if (tabSleep?.actief) return;
    const balk = $("tabbar");
    const actief = balk?.querySelector(`.tab[data-tab="${staat.tab}"]`);
    if (!balk || !actief) return;

    const zonderOvergang = direct || !tabIndicatorKlaar;
    if (zonderOvergang) balk.classList.add("indicator-direct");
    balk.style.setProperty("--tab-x", `${actief.offsetLeft}px`);
    balk.style.setProperty("--tab-breedte", `${actief.offsetWidth}px`);
    tabIndicatorKlaar = true;
    if (zonderOvergang) requestAnimationFrame(() => balk.classList.remove("indicator-direct"));
  });
}

function tabSleepToegestaan() {
  return Boolean(staat.gebruiker) && !document.hidden && !$("app").classList.contains("hidden")
    && !$("blad").classList.contains("open");
}

function tekenTabSleep() {
  if (!tabSleep?.actief) return;
  const { balk, x, breedte, doel } = tabSleep;
  balk.style.setProperty("--tab-x", `${x}px`);
  balk.style.setProperty("--tab-breedte", `${breedte}px`);
  balk.querySelectorAll(".tab").forEach((knop) =>
    knop.classList.toggle("sleep-doel", knop.dataset.tab === doel));
}

function verplaatsTabSleep(e) {
  if (!tabSleep || e.pointerId !== tabSleep.pointerId) return;
  if (!tabSleepToegestaan()) return stopTabSleep();
  const sleep = tabSleep;
  const afstandX = e.clientX - sleep.beginX;
  const afstandY = e.clientY - sleep.beginY;
  if (!sleep.actief) {
    // Een tik blijft een tik; verticaal bewegen blijft voor de browser.
    if (Math.abs(afstandY) >= 8 && Math.abs(afstandY) > Math.abs(afstandX)) return stopTabSleep();
    if (Math.abs(afstandX) < 8) return;
    sleep.actief = true;
    cancelAnimationFrame(tabIndicatorFrame);
    sleep.balk.classList.add("tab-slepen");
  }
  if (e.cancelable) e.preventDefault();
  const eerste = sleep.knoppen[0];
  const laatste = sleep.knoppen[sleep.knoppen.length - 1];
  sleep.x = Math.max(eerste.x, Math.min(laatste.x, sleep.beginPositie + afstandX / sleep.schaal));
  const midden = sleep.x + sleep.breedte / 2;
  const dichtstbij = sleep.knoppen.reduce((beste, knop) =>
    Math.abs(knop.midden - midden) < Math.abs(beste.midden - midden) ? knop : beste);
  sleep.doel = dichtstbij.tab;
  cancelAnimationFrame(tabSleepFrame);
  tabSleepFrame = requestAnimationFrame(tekenTabSleep);
}

function stopTabSleep(kiezen = false) {
  if (!tabSleep) return;
  const sleep = tabSleep;
  tabSleep = null;
  cancelAnimationFrame(tabSleepFrame);
  // Ook een afgebroken veeg mag achteraf geen klik en zoekreset veroorzaken.
  if (sleep.actief || !kiezen) tabKlikRemTot = Date.now() + 800;
  if (sleep.actief) {
    sleep.balk.style.setProperty("--tab-x", `${sleep.x}px`);
    sleep.balk.style.setProperty("--tab-breedte", `${sleep.breedte}px`);
  }
  sleep.balk.classList.remove("tab-slepen");
  sleep.balk.querySelectorAll(".sleep-doel").forEach((knop) => knop.classList.remove("sleep-doel"));
  if (sleep.knop.hasPointerCapture?.(sleep.pointerId)) sleep.knop.releasePointerCapture(sleep.pointerId);
  if (kiezen && sleep.actief && sleep.doel !== staat.tab && tabSleepToegestaan()) {
    staat.tab = sleep.doel;
    staat.zoek = "";
    zetTab();
  } else {
    werkTabIndicatorBij();
  }
}

$("tabbar").addEventListener("pointerdown", (e) => {
  if (tabSleep) {
    if (e.pointerId !== tabSleep.pointerId) stopTabSleep();
    return;
  }
  // Een volgende bewuste tik mag altijd meteen werken, ook vlak na een sleepbeweging.
  tabKlikRemTot = 0;
  const knop = e.target.closest(".tab");
  if (!knop?.classList.contains("actief") || e.button !== 0 || !e.isPrimary || !tabSleepToegestaan()) return;
  const balk = $("tabbar");
  const rechthoek = balk.getBoundingClientRect();
  const knoppen = Array.from(balk.querySelectorAll(".tab"), (item) => ({
    tab: item.dataset.tab, x: item.offsetLeft, midden: item.offsetLeft + item.offsetWidth / 2,
  }));
  tabSleep = {
    pointerId: e.pointerId, knop, balk, rechthoek, knoppen, actief: false,
    beginX: e.clientX, beginY: e.clientY, beginPositie: knop.offsetLeft,
    schaal: rechthoek.width / balk.offsetWidth || 1,
    x: knop.offsetLeft, breedte: knop.offsetWidth, doel: staat.tab,
  };
  // Vastleggen op de knop houdt normale tikken intact en volgt de vinger buiten de knop.
  try { knop.setPointerCapture(e.pointerId); } catch { /* Vensterhandlers vangen de beweging ook op. */ }
});

window.addEventListener("pointermove", verplaatsTabSleep, { passive: false });
window.addEventListener("pointerup", (e) => {
  if (!tabSleep || e.pointerId !== tabSleep.pointerId) return;
  verplaatsTabSleep(e);
  if (!tabSleep) return;
  const { rechthoek } = tabSleep;
  const binnenBalk = e.clientY >= rechthoek.top - 24 && e.clientY <= rechthoek.bottom + 24
    && e.clientX >= rechthoek.left - 24 && e.clientX <= rechthoek.right + 24;
  stopTabSleep(binnenBalk);
});
window.addEventListener("pointercancel", (e) => {
  if (e.pointerId === tabSleep?.pointerId) stopTabSleep();
});
$("tabbar").addEventListener("lostpointercapture", (e) => {
  if (e.pointerId === tabSleep?.pointerId) stopTabSleep();
});
window.addEventListener("pointerdown", (e) => {
  if (tabSleep && e.pointerId !== tabSleep.pointerId) stopTabSleep();
});
window.addEventListener("blur", () => stopTabSleep());
window.addEventListener("pagehide", () => stopTabSleep());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTabSleep();
});

function zetTab() {
  stopTabSleep();
  document.querySelectorAll(".tab").forEach((t) => {
    const actief = t.dataset.tab === staat.tab;
    t.classList.toggle("actief", actief);
    if (actief) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  werkTabIndicatorBij();
  $("scherm").scrollTop = 0;
  tekenScherm();
  if (staat.tab === "bestellingen") void laadMailStatussen();
}

$("tabbar").addEventListener("click", (e) => {
  if (e.detail !== 0 && Date.now() < tabKlikRemTot) {
    tabKlikRemTot = 0;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const knop = e.target.closest(".tab");
  if (!knop || knop.dataset.tab === staat.tab) return;
  staat.tab = knop.dataset.tab;
  staat.zoek = "";
  zetTab();
});

window.addEventListener("resize", () => {
  stopTabSleep();
  werkTabIndicatorBij(true);
}, { passive: true });

// Alle klikken binnen het scherm en het blad
document.addEventListener("click", (e) => {
  const leverdatumKnop = e.target.closest("[data-leverdatum-actie]");
  if (leverdatumKnop) {
    e.preventDefault();
    e.stopPropagation();
    if (!leverdatumKnop.disabled) leverdatumActie(leverdatumKnop.dataset.leverdatumNummer, leverdatumKnop.dataset.leverdatumActie);
    return;
  }
  const pdfKnop = e.target.closest("[data-order-pdf]");
  if (pdfKnop) {
    e.preventDefault();
    e.stopPropagation();
    bekijkOrderPdf(pdfKnop.dataset.orderPdf).catch((error) => melden(foutTekst(error)));
    return;
  }
  const mailKnop = e.target.closest("[data-mail-controleer]");
  if (mailKnop) {
    e.preventDefault();
    e.stopPropagation();
    void controleerMailStatus(mailKnop.dataset.mailControleer, true);
    return;
  }
  if (!e.target.closest(".datepick")) {
    document.querySelectorAll(".datepick.open").forEach((kiezer) => {
      kiezer.classList.remove("open");
      kiezer.querySelector(".datepick-trigger")?.setAttribute("aria-expanded", "false");
    });
  }

  const el = e.target.closest("[data-grenzen-opslaan],[data-plus],[data-min],[data-voorraad-richting],[data-voorraad-opslaan],[data-sorteer-open],[data-sortering],[data-cat],[data-filter-cat],[data-filter-wis],[data-order],[data-retour],[data-retour-weg],[data-nalever],[data-datepick-toggle],[data-datepick-verschuif],[data-datepick-dag],[data-datepick-reset],[data-push-actie],#bestelKnop,#bVerstuur,#aanvulKnop,#scanKnop,#scannerSluit,#scannerAnnuleer,#scannerOpnieuw,#categorieKnop,#categorieSluit,#sorteerSluit,#meldingenSluit");
  if (!el) return;

  if (el.dataset.grenzenOpslaan) voorraadGrenzenOpslaan(el.dataset.grenzenOpslaan, el);
  else if (el.dataset.pushActie === "aan") meldingenAanzetten().catch((error) => melden(foutTekst(error)));
  else if (el.dataset.pushActie === "uit") meldingenUitzetten().catch((error) => melden(foutTekst(error)));
  else if (el.dataset.datepickToggle) datepickToggle(el.dataset.datepickToggle);
  else if (el.dataset.datepickVerschuif) datepickVerschuif(el.dataset.datepickId, Number(el.dataset.datepickVerschuif));
  else if (el.dataset.datepickDag) datepickKies(el.dataset.datepickId, el.dataset.datepickDag);
  else if (el.dataset.datepickReset) datepickReset(el.dataset.datepickReset);
  else if (el.dataset.voorraadRichting !== undefined) wijzigVoorraad(el.dataset.voorraadId, el.dataset.voorraadRichting);
  else if (el.dataset.voorraadOpslaan !== undefined) {
    const veld = leesVoorraadVeld(el.dataset.voorraadOpslaan);
    voorraadOpslaan(el.dataset.voorraadOpslaan, veld?.value);
  }
  else if (el.dataset.sorteerOpen !== undefined) sorteerKiezerOpenen(el.dataset.sorteerOrder || "");
  else if (el.dataset.sortering !== undefined) kiesSortering(el.dataset.sortering);
  else if (el.dataset.plus) wijzigAantal(el.dataset.plus, +1);
  else if (el.dataset.min) wijzigAantal(el.dataset.min, -1);
  else if (el.dataset.cat !== undefined) { staat.categorie = el.dataset.cat; tekenScherm(); }
  else if (el.dataset.filterCat !== undefined) {
    staat.categorie = el.dataset.filterCat;
    bladDicht();
    tekenScherm();
  }
  else if (el.dataset.filterWis !== undefined) { staat.categorie = "Alles"; tekenScherm(); }
  else if (el.dataset.retourWeg) retourWeg(el.dataset.retourWeg);
  else if (el.dataset.nalever) naleveren(el.dataset.order, el.dataset.nalever);
  else if (el.dataset.retour) retourToevoegen(el.dataset.retour);
  else if (el.dataset.order) toonOrder(el.dataset.order);
  else if (el.id === "bestelKnop") bestelFormulier();
  else if (el.id === "bVerstuur") bestelVersturen();
  else if (el.id === "aanvulKnop") voorraadAanvullen();
  else if (el.id === "scanKnop" || el.id === "scannerOpnieuw") scannerOpenen();
  else if (el.id === "scannerSluit" || el.id === "scannerAnnuleer") bladDicht();
  else if (el.id === "categorieKnop") categorieKiezerOpenen();
  else if (el.id === "categorieSluit") bladDicht();
  else if (el.id === "sorteerSluit") sluitSorteerKiezer();
  else if (el.id === "meldingenSluit") bladDicht();
});

// Alleen de lijst hertekenen: zou het hele scherm opnieuw opgebouwd worden,
// dan verdwijnt het invoerveld en klapt het toetsenbord op een telefoon dicht.
document.addEventListener("input", (e) => {
  if (e.target.dataset.voorraadVeld !== undefined) {
    const id = Number(e.target.dataset.voorraadVeld);
    const huidig = Number(product(id).stock || 0);
    const nieuw = Number(e.target.value);
    const geldig = Number.isFinite(nieuw) && Number.isInteger(nieuw) && nieuw >= 0 && nieuw <= 1000000;
    e.target.classList.toggle("ongeldig", !geldig);
    const opslaan = document.querySelector(`[data-voorraad-opslaan="${id}"]`);
    if (opslaan) opslaan.disabled = !geldig || nieuw === huidig || staat.voorraadBezig.has(id);
    return;
  }
  if (e.target.id === "categorieZoek") {
    const opties = $("categorieOpties");
    if (opties) opties.innerHTML = categorieOpties(e.target.value);
    return;
  }
  if (e.target.id !== "zoekVeld") return;
  staat.zoek = e.target.value;
  const lijst = $("lijst");
  if (lijst) lijst.innerHTML = staat.tab === "voorraad" ? lijstVoorraad() : lijstWinkel();
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.veld) zetAantal(e.target.dataset.veld, e.target.value);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.dataset.voorraadVeld === undefined) return;
  e.preventDefault();
  voorraadOpslaan(e.target.dataset.voorraadVeld, e.target.value);
});

// ── Inloggen ────────────────────────────────────────────────────────────
let inlogModus = "inloggen";

function zetInlogModus(modus) {
  inlogModus = modus;
  const aanmelden = modus === "aanmelden";
  $("naamRij").hidden = !aanmelden;
  $("loginUitleg").hidden = !aanmelden;
  $("loginKnop").textContent = aanmelden ? "Account aanmaken" : "Inloggen";
  $("loginWissel").textContent = aanmelden ? "Heb je al een account? Inloggen" : "Nog geen account? Aanmelden";
  $("loginWachtwoord").setAttribute("autocomplete", aanmelden ? "new-password" : "current-password");
  $("loginFout").textContent = "";
  $("loginFout").style.color = "";
}

$("loginWissel").addEventListener("click", () => {
  zetInlogModus(inlogModus === "inloggen" ? "aanmelden" : "inloggen");
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const knop = $("loginKnop");
  const fout = $("loginFout");
  const email = $("loginEmail").value.trim().toLowerCase();
  const wachtwoord = $("loginWachtwoord").value;
  const naam = $("loginNaam").value.trim();

  fout.textContent = "";
  fout.style.color = "";
  knop.disabled = true;
  knop.textContent = "Bezig...";

  try {
    if (inlogModus === "aanmelden") {
      if (naam.length < 2) throw new Error("Vul je naam in.");
      if (wachtwoord.length < 8) throw new Error("Kies een wachtwoord van minstens 8 tekens.");

      const { data, error } = await db.auth.signUp({
        email, password: wachtwoord,
        options: { data: { display_name: naam } },
      });
      if (error) throw error;

      // Nieuwe accounts staan op niet-actief tot ze zijn goedgekeurd
      if (!data.session) {
        fout.style.color = "#bbf7d0";
        fout.textContent = "Account aangemaakt. Bevestig eerst je e-mailadres via de mail die je hebt gekregen.";
      } else {
        const { data: lid } = await db.rpc("binnenapp_membership_status");
        if (!lid?.active) {
          await db.auth.signOut({ scope: 'local' });
          fout.style.color = "#bbf7d0";
          fout.textContent = "Account aangemaakt. Je kunt inloggen zodra het is goedgekeurd.";
        } else {
          await start();
          return;
        }
      }
      zetInlogModus("inloggen");
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password: wachtwoord });
      if (error) throw error;
      const { data: lid } = await db.rpc("binnenapp_membership_status");
      if (!lid?.active) {
        await db.auth.signOut({ scope: 'local' });
        throw new Error("Dit account is nog niet goedgekeurd voor BinnenApp.");
      }
      await start();
      return;
    }
  } catch (err) {
    fout.style.color = "";
    fout.textContent = foutTekst(err);
  } finally {
    knop.disabled = false;
    if (inlogModus === "aanmelden") knop.textContent = "Account aanmaken";
    else knop.textContent = "Inloggen";
  }
});

$("uitlogKnop").addEventListener("click", async () => {
  window.BinnenPdf?.sluiten();
  await db.auth.signOut({ scope: 'local' });
  location.reload();
});

$("meldingenKnop").addEventListener("click", () => {
  toonMeldingen().catch((error) => melden(foutTekst(error)));
});

// ── Opstarten ───────────────────────────────────────────────────────────
async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    $("splash").classList.add("hidden");
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }
  staat.gebruiker = session.user;
  const { data: lid } = await db.rpc("binnenapp_membership_status");
  staat.beheerder = lid?.active === true && lid?.role === "admin";
  const gevraagdeTab = new URLSearchParams(location.search).get("tab");
  if (PUSH_TABBLADEN.includes(gevraagdeTab)) staat.tab = gevraagdeTab;
  await laadAlles();
  $("splash").classList.add("hidden");
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  badges();
  zetTab();
  startWagenRealtime();
  serviceWorkerRegistratie()
    .then(() => werkMeldingKnopBij())
    .catch((error) => console.warn("Serviceworker starten gaf een fout:", error));
}

// Bij terugkeer naar de app opnieuw ophalen, zodat je niet naar oude data kijkt
let laatsteVerversing = Date.now();
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    if ($("scannerVideo")) bladDicht();
    return;
  }
  if (!staat.gebruiker) return;
  planWagenVerversing(0);
  if (Date.now() - laatsteVerversing < 15000) return;
  laatsteVerversing = Date.now();
  await laadAlles();
  tekenScherm();
  badges();
});

window.addEventListener("pagehide", scannerStoppen);

start().catch((e) => {
  console.error(e);
  $("splash").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginFout").textContent = foutTekst(e);
});
