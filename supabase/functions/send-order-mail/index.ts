import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Verstuurt een bevestigingsmail via Resend.
// Vereist secret: RESEND_API_KEY
// Optioneel secret: ORDER_MAIL_FROM (afzender, standaard Resend's testadres)
// Optioneel secret: ORDER_MAIL_NOTIFY (vast adres dat een melding krijgt)

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://binnenapp-mobiel.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

// BinnenApp huisstijl
const TEAL = "#1e40af";
const INK = "#1e293b";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const WASH = "#f8fafc";

// Klantnummer bij de leverancier, zodat die de bestelling kan thuisbrengen
const KLANTNUMMER = "111850";

// Logo staat in de publieke repo: mailclients blokkeren ingesloten afbeeldingen
const LOGO_URL =
  "https://raw.githubusercontent.com/ReinJanssenBouw/BinnenApp/main/BinnenAppLogoWit.png";

interface MailItem {
  omschrijving?: string;
  aantal?: number | string;
  eenheid?: string;
  jbCode?: string;
  eanCode?: string;
  foto?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Alleen echte http(s)-afbeeldingen kunnen in een mail geladen worden.
function usableImage(url: unknown): string {
  const raw = String(url ?? "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function renderThumb(item: MailItem): string {
  const src = usableImage(item.foto);
  const box =
    `width:72px;height:72px;border-radius:8px;border:1px solid ${LINE};` +
    `background:#ffffff;`;

  if (!src) {
    return `<td style="${box}padding:0;text-align:center;vertical-align:middle;` +
      `color:${FAINT};font-size:10px;font-family:Arial,sans-serif;">geen<br>foto</td>`;
  }

  // De verhouding moet intact blijven, of het artikel nu breed (zaagblad) of
  // hoog is. Daarom in CSS alles op auto met een max van 64px: moderne clients
  // schalen dan passend binnen het vakje. Het width-attribuut blijft staan als
  // terugval voor Outlook, dat max-width/max-height negeert.
  return `<td style="${box}padding:0;text-align:center;vertical-align:middle;">` +
    `<img src="${esc(src)}" alt="${esc(item.omschrijving ?? "Artikel")}" ` +
    `width="64" style="display:block;margin:0 auto;width:auto;height:auto;` +
    `max-width:64px;max-height:64px;border:0;">` +
    `</td>`;
}

function renderRow(item: MailItem): string {
  const naam = esc(item.omschrijving || "Artikel");
  const aantal = esc(item.aantal ?? 0);
  const eenheid = esc(item.eenheid || "st");
  const codes = [item.jbCode, item.eanCode ? `EAN ${item.eanCode}` : ""]
    .filter(Boolean)
    .map((c) => esc(c))
    .join(" &nbsp;·&nbsp; ");

  return `
  <tr>
    ${renderThumb(item)}
    <td style="padding:10px 14px;vertical-align:middle;font-family:Arial,sans-serif;">
      <div style="font-size:14px;font-weight:bold;color:${INK};line-height:1.35;">${naam}</div>
      ${codes ? `<div style="font-size:11px;color:${FAINT};padding-top:3px;">${codes}</div>` : ""}
    </td>
    <td style="padding:10px 0;vertical-align:middle;text-align:right;white-space:nowrap;font-family:Arial,sans-serif;">
      <span style="display:inline-block;background:#eefbf8;color:${TEAL};border-radius:99px;
                   padding:5px 12px;font-size:13px;font-weight:bold;">${aantal} ${eenheid}</span>
    </td>
  </tr>
  <tr><td colspan="3" style="border-bottom:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function renderInfoBlok(referentie: string, leverdatum: string): string {
  const cellen = [
    leverdatum ? ["Gewenste leverdatum", leverdatum] : null,
    referentie ? ["Referentie", referentie] : null,
  ].filter(Boolean) as string[][];

  if (!cellen.length) return "";

  const kolommen = cellen.map(([kop, waarde]) => `
    <td style="padding:12px 14px;background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;
               font-family:Arial,sans-serif;vertical-align:top;">
      <div style="font-size:10px;font-weight:bold;color:${TEAL};letter-spacing:.6px;
                  text-transform:uppercase;">${esc(kop)}</div>
      <div style="font-size:14px;font-weight:bold;color:${INK};padding-top:4px;">${esc(waarde)}</div>
    </td>`).join(`<td style="width:10px;">&nbsp;</td>`);

  return `
  <tr><td style="padding:14px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${kolommen}</tr>
    </table>
  </td></tr>`;
}

function buildHtml(
  orderNumber: string,
  besteldDoor: string,
  items: MailItem[],
  referentie = "",
  leverdatum = "",
  melding = false,
  contactEmail = "",
): string {
  const rows = items.length
    ? items.map(renderRow).join("")
    : `<tr><td colspan="3" style="padding:20px;text-align:center;color:${FAINT};
         font-family:Arial,sans-serif;font-size:13px;">Geen artikelen</td></tr>`;

  const totaalStuks = items.reduce(
    (sum, i) => sum + (Number(i.aantal) || 0),
    0,
  );

  const datum = new Date().toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const meta = [
    orderNumber ? `<strong style="color:${INK};">${esc(orderNumber)}</strong>` : "",
    esc(datum),
    besteldDoor ? esc(besteldDoor) : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${WASH};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WASH};padding:24px 12px;">
<tr><td align="center">

  <table role="presentation" width="760" cellpadding="0" cellspacing="0" border="0"
         style="max-width:760px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;
                border:1px solid ${LINE};">

    <!-- Koptekst -->
    <tr>
      <td style="background:${TEAL};
                 background-image:linear-gradient(135deg,#1e40af 0%,#1d4ed8 45%,#1e3a8a 100%);
                 padding:28px 28px 24px;font-family:Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="color:#ffffff;font-size:19px;font-weight:bold;
                          letter-spacing:.5px;">JANSSEN BOUW</div>
              <div style="color:rgba(255,255,255,.62);font-size:11px;font-weight:bold;
                          letter-spacing:1.2px;text-transform:uppercase;padding-top:2px;">Klantnummer ${KLANTNUMMER} &nbsp;·&nbsp; Binnenploeg</div>
              <div style="color:#ffffff;font-size:24px;font-weight:bold;padding-top:14px;">
                ${melding ? "Nieuwe bestelaanvraag" : "Bestelling voltooid"}
              </div>
              ${melding && besteldDoor ? `<div style="color:rgba(255,255,255,.85);font-size:14px;padding-top:8px;">
                ${esc(besteldDoor)} wil deze bestelling plaatsen
              </div>` : ""}
            </td>
            <td width="56" style="vertical-align:top;text-align:right;width:56px;">
              <img src="${LOGO_URL}" alt="BinnenApp" width="48"
                   style="display:block;width:48px;height:auto;border:0;margin-left:auto;">
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Gegevens -->
    <tr>
      <td style="padding:20px 28px 4px;font-family:Arial,sans-serif;font-size:12px;color:${MUTED};">
        ${meta}
      </td>
    </tr>

    ${melding && contactEmail ? `
    <tr>
      <td style="padding:16px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;
                       border-radius:10px;font-family:Arial,sans-serif;">
              <div style="font-size:10px;font-weight:bold;color:#b45309;letter-spacing:.6px;
                          text-transform:uppercase;">Orderbevestiging sturen naar</div>
              <div style="font-size:16px;font-weight:bold;color:#78350f;padding-top:5px;">
                <a href="mailto:${esc(contactEmail)}" style="color:#78350f;text-decoration:none;">${esc(contactEmail)}</a>
              </div>
              ${besteldDoor ? `<div style="font-size:11.5px;color:#b45309;padding-top:3px;">
                ter attentie van ${esc(besteldDoor)}
              </div>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ""}

    ${renderInfoBlok(referentie, leverdatum)}

    <!-- Artikelen -->
    <tr>
      <td style="padding:14px 28px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td colspan="3" style="border-bottom:1.5px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>
          ${rows}
        </table>
      </td>
    </tr>

    <!-- Totaal -->
    <tr>
      <td style="padding:8px 28px 24px;font-family:Arial,sans-serif;">
        <div style="text-align:right;font-size:13px;color:${MUTED};">
          ${items.length} ${items.length === 1 ? "artikel" : "artikelen"} &nbsp;·&nbsp;
          <strong style="color:${INK};">${totaalStuks} stuks</strong>
        </div>
      </td>
    </tr>

    <!-- Voettekst -->
    <tr>
      <td style="background:${WASH};border-top:1px solid ${LINE};padding:16px 28px;
                 font-family:Arial,sans-serif;font-size:11px;color:${FAINT};text-align:center;">
        <strong style="color:${MUTED};font-size:12px;">Janssen Bouw BV</strong> &nbsp;·&nbsp; Etten-Leur &nbsp;·&nbsp; Klantnummer ${KLANTNUMMER}<br>
        <span style="font-size:10.5px;">Automatisch verstuurd vanuit BinnenApp</span>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

function buildText(
  orderNumber: string,
  besteldDoor: string,
  items: MailItem[],
  referentie = "",
  leverdatum = "",
  melding = false,
  contactEmail = "",
): string {
  const lijst = items
    .map((i) => `- ${i.omschrijving ?? "Artikel"} : ${i.aantal ?? 0} ${i.eenheid ?? "st"}`)
    .join("\n");

  return [
    `JANSSEN BOUW - Binnenploeg - Klantnummer ${KLANTNUMMER}`,
    "",
    melding ? "Nieuwe bestelaanvraag" : "Bestelling voltooid",
    melding && besteldDoor ? besteldDoor + " wil deze bestelling plaatsen" : "",
    "",
    melding && contactEmail ? `Stuur de orderbevestiging naar: ${contactEmail}` : "",
    melding && contactEmail ? "" : null,
    orderNumber ? `Bestelnummer: ${orderNumber}` : "",
    besteldDoor ? `Besteld door: ${besteldDoor}` : "",
    leverdatum ? `Gewenste leverdatum: ${leverdatum}` : "",
    referentie ? `Referentie: ${referentie}` : "",
    "",
    lijst || "Geen artikelen",
    "",
    `Janssen Bouw BV - Etten-Leur - Klantnummer ${KLANTNUMMER}`,
    "Automatisch verstuurd vanuit BinnenApp",
  ].filter((line) => line !== null).join("\n");
}

type MailStatus = "bezig" | "verzonden" | "afgeleverd" | "vertraagd" | "mislukt" | "onbekend";
type MailRegistratie = {
  order_number: string;
  soort: string;
  ontvanger: string;
  status: MailStatus;
  poging_id?: string;
  provider_id?: string;
  fout?: string;
  controle_fout?: string;
  geprobeerd_op?: string;
  gecontroleerd_op?: string;
  mag_versturen?: boolean;
  controleren?: boolean;
};
type MailBeheer = (soort: string, actie: string, gegevens?: Record<string, unknown>) => Promise<MailRegistratie | null>;

function antwoord(status: number, inhoud: Record<string, unknown>): Response {
  return new Response(JSON.stringify(inhoud), { status, headers: JSON_HEADERS });
}

// Provider-id, poging-id en gebruikerscontext blijven uitsluitend op de server.
function veiligeStatus(registratie: MailRegistratie | null) {
  if (!registratie) return null;
  const { order_number, soort, ontvanger, status, fout, controle_fout, geprobeerd_op, gecontroleerd_op } = registratie;
  return { order_number, soort, ontvanger, status, fout, controle_fout, geprobeerd_op, gecontroleerd_op };
}

function providerStatus(gebeurtenis: unknown): { status: MailStatus; fout: string } | null {
  switch (gebeurtenis) {
    case "sent": return { status: "verzonden", fout: "" };
    case "delivered":
    case "opened":
    case "clicked": return { status: "afgeleverd", fout: "" };
    case "delivery_delayed": return { status: "vertraagd", fout: "De ontvangende mailserver heeft de bezorging uitgesteld." };
    case "bounced": return { status: "mislukt", fout: "De ontvangende mailserver heeft de mail geweigerd." };
    case "failed": return { status: "mislukt", fout: "De maildienst kon deze mail niet bezorgen." };
    case "suppressed": return { status: "mislukt", fout: "De maildienst heeft verzending naar dit adres tegengehouden." };
    case "complained": return { status: "afgeleverd", fout: "De ontvanger heeft de mail als spam gemeld." };
    default: return null;
  }
}

async function controleerMail(apiKey: string, beheer: MailBeheer) {
  let registratie = await beheer("leverancier", "controleer");
  if (!registratie?.controleren || !registratie.provider_id) return registratie;
  let controleFout = "De maildienst is tijdelijk niet bereikbaar. De laatst bekende status blijft staan.";
  try {
    const respons = await fetch("https://api.resend.com/emails/" + encodeURIComponent(registratie.provider_id), {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000),
    });
    if (respons.status === 401 || respons.status === 403) {
      controleFout = "De mailkoppeling heeft nog geen toegang tot afleverstatussen. Controleer deze mail in Resend.";
    } else if (respons.ok) {
      const mail = await respons.json();
      const ontvangers = Array.isArray(mail.to) ? mail.to.map((adres: unknown) => String(adres).toLowerCase()) : [];
      const resultaat = providerStatus(mail.last_event);
      // Een resultaat mag uitsluitend bij de geregistreerde leverancier horen.
      if (mail.id === registratie.provider_id && ontvangers.includes(registratie.ontvanger.toLowerCase()) && resultaat) {
        return await beheer("leverancier", "gecontroleerd", { provider_id: registratie.provider_id, ...resultaat });
      }
      controleFout = "De maildienst gaf nog geen herkenbare afleverstatus terug. De laatst bekende status blijft staan.";
    }
  } catch { /* Geen verzendfout maken van een mislukte statuscontrole. */ }
  registratie = await beheer("leverancier", "controlefout", { provider_id: registratie.provider_id, fout: controleFout });
  return registratie;
}

async function verstuurGeregistreerd(
  apiKey: string, beheer: MailBeheer, soort: string,
  mail: { from: string; to: string; subject: string; html: string; text: string },
) {
  const registratie = await beheer(soort, "begin", { ontvanger: mail.to });
  if (!registratie?.mag_versturen) return registratie;
  let status: MailStatus = "onbekend";
  let providerId: string | null = null;
  let fout = "Geen definitieve verzendbevestiging ontvangen. Controleer Resend voordat je opnieuw bestelt.";
  if (!isValidEmail(mail.to)) {
    status = "mislukt";
    fout = "Het opgeslagen e-mailadres is ongeldig.";
  } else {
    try {
      const respons = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `binnenapp/${soort}/${registratie.poging_id}`,
        },
        body: JSON.stringify({ ...mail, to: [mail.to] }),
        signal: AbortSignal.timeout(15000),
      });
      const resultaat = await respons.json().catch(() => ({}));
      if (respons.ok && typeof resultaat.id === "string" && resultaat.id.length > 0) {
        providerId = resultaat.id;
        status = "verzonden";
        fout = "";
      } else if (respons.status >= 400 && respons.status < 500) {
        status = "mislukt";
        fout = respons.status === 429
          ? "De maildienst accepteert tijdelijk geen nieuwe mails. Controleer dit in Resend."
          : "De maildienst heeft deze verzendpoging afgewezen. Controleer het adres en de mailinstellingen in Resend.";
      }
    } catch { /* Bij een time-out kan de mail wel zijn aangenomen: niet opnieuw versturen. */ }
  }
  return await beheer(soort, "resultaat", { poging_id: registratie.poging_id, provider_id: providerId, status, fout });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== "POST") return antwoord(405, { sent: false, error: "Alleen POST" });
  const autorisatie = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(autorisatie)) return antwoord(401, { sent: false, error: "Log eerst in." });
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serverSleutel = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const appSleutel = Deno.env.get("SUPABASE_ANON_KEY") || serverSleutel;
  if (!apiKey || !supabaseUrl || !serverSleutel) return antwoord(500, { sent: false, error: "De mailkoppeling is niet volledig ingesteld." });
  let inhoud;
  try { inhoud = await req.json(); }
  catch { return antwoord(400, { sent: false, error: "Ongeldige JSON." }); }
  const bestelnummer = String(inhoud?.orderNumber || "").trim();
  const actie = inhoud?.actie || "versturen";
  if (!/^#ORD-[A-Za-z0-9-]{6,40}$/.test(bestelnummer) || !["versturen", "status"].includes(actie)) {
    return antwoord(400, { sent: false, error: "Ongeldig bestelnummer of onbekende actie." });
  }
  try {
    // Het gebruikers-id komt van Auth, nooit uit de aanroep of een zelf gelezen JWT.
    const gebruikersHeaders = { apikey: appSleutel, Authorization: autorisatie };
    const identiteit = await fetch(supabaseUrl + "/auth/v1/user", { headers: gebruikersHeaders, signal: AbortSignal.timeout(10000) });
    if (!identiteit.ok) return antwoord(401, { sent: false, error: "Je sessie is verlopen. Log opnieuw in." });
    const gebruiker = await identiteit.json();
    if (!gebruiker.id) return antwoord(401, { sent: false, error: "Geen geldige gebruiker gevonden." });

    // RLS controleert lidmaatschap; alleen de echte, opgeslagen bestelling wordt gemaild.
    const zoekopdracht = new URLSearchParams({
      order_number: "eq." + bestelnummer,
      select: "id,order_number,requester_name,requester_email,reference,delivery_date,order_items(description,quantity,unit,jb_code,ean_code,product_image_url)",
    });
    const orderRespons = await fetch(supabaseUrl + "/rest/v1/orders?" + zoekopdracht, { headers: gebruikersHeaders, signal: AbortSignal.timeout(10000) });
    if (!orderRespons.ok) return antwoord(403, { sent: false, error: "Geen toegang tot deze bestelling." });
    const orders = await orderRespons.json();
    const order = Array.isArray(orders) && orders.length === 1 ? orders[0] : null;
    if (!order) return antwoord(404, { sent: false, error: "Bestelling niet gevonden of geen toegang." });

    const beheer: MailBeheer = async (soort, handeling, gegevens = {}) => {
      const respons = await fetch(supabaseUrl + "/rest/v1/rpc/binnenapp_order_mail_beheer", {
        method: "POST", headers: { apikey: serverSleutel, Authorization: "Bearer " + serverSleutel, "Content-Type": "application/json" },
        body: JSON.stringify({ p_actor_id: gebruiker.id, p_order_number: bestelnummer, p_soort: soort, p_actie: handeling, p_gegevens: gegevens }),
        signal: AbortSignal.timeout(10000),
      });
      if (!respons.ok) throw new Error("De mailregistratie kon niet worden bijgewerkt.");
      return await respons.json();
    };
    if (actie === "status") return antwoord(200, { status: veiligeStatus(await controleerMail(apiKey, beheer)) });

    const afzender = Deno.env.get("ORDER_MAIL_FROM") || "onboarding@resend.dev";
    const leverancier = (Deno.env.get("ORDER_MAIL_NOTIFY") || "ettenleur@leys.nl").trim();
    const besteller = String(order.requester_email || "").trim();
    const naam = String(order.requester_name || "");
    const referentie = String(order.reference || "");
    const leverdatum = order.delivery_date ? new Date(order.delivery_date + "T12:00:00Z").toLocaleDateString("nl-NL") : "";
    const artikelen: MailItem[] = (order.order_items || []).map((regel: Record<string, unknown>) => ({
      omschrijving: String(regel.description || "Artikel"), aantal: Number(regel.quantity || 0),
      eenheid: String(regel.unit || "st"), jbCode: String(regel.jb_code || ""),
      eanCode: String(regel.ean_code || ""), foto: String(regel.product_image_url || ""),
    }));
    // Leveranciersmail gaat eerst; een bevestigingsfout mag deze niet overslaan.
    const melding = await verstuurGeregistreerd(apiKey, beheer, "leverancier", {
      from: afzender, to: leverancier, subject: `Nieuwe order Janssen-Bouw - ${bestelnummer}`,
      html: buildHtml(bestelnummer, naam, artikelen, referentie, leverdatum, true, besteller),
      text: buildText(bestelnummer, naam, artikelen, referentie, leverdatum, true, besteller),
    });
    let bevestiging: MailRegistratie | null = null;
    let bevestigingFout = "";
    if (besteller.toLowerCase() !== leverancier.toLowerCase()) {
      try {
        bevestiging = await verstuurGeregistreerd(apiKey, beheer, "bevestiging", {
          from: afzender, to: besteller, subject: `Bestelling voltooid - ${bestelnummer}`,
          html: buildHtml(bestelnummer, naam, artikelen, referentie, leverdatum),
          text: buildText(bestelnummer, naam, artikelen, referentie, leverdatum),
        });
      } catch { bevestigingFout = "De bevestigingsmail kon niet worden gecontroleerd."; }
    }
    const verzonden = !!melding && ["verzonden", "afgeleverd", "vertraagd"].includes(melding.status);
    return antwoord(200, {
      sent: verzonden, melding: verzonden, status: veiligeStatus(melding),
      onzeker: !melding || ["bezig", "onbekend"].includes(melding.status),
      meldingFout: verzonden ? undefined : melding?.fout || "De verzending aan Leys is nog niet bevestigd.",
      error: verzonden ? undefined : melding?.fout || "De verzending aan Leys is nog niet bevestigd.",
      bevestiging: veiligeStatus(bevestiging), bevestigingFout: bevestigingFout || bevestiging?.fout || undefined,
    });
  } catch {
    // Een onzekere verzenduitkomst is nooit een reden om automatisch opnieuw te mailen.
    return antwoord(502, { sent: false, onzeker: true, error: "De mailstatus kon niet worden bevestigd. Controleer de bestelling en Resend voordat je opnieuw bestelt." });
  }
});
