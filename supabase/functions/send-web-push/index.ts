// Stuurt Web Push vanaf een beveiligde Database Webhook.
// Benodigde secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY en PUSH_WEBHOOK_SECRET.

import webpush from "npm:web-push@3.6.7";

const JSON_HEADERS = { "Content-Type": "application/json" };

interface PushAbonnement {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushLevering {
  event: {
    id: number;
    type: "cart_added" | "order_placed";
    title: string;
    body: string;
    url: string;
  };
  subscriptions: PushAbonnement[];
}

function antwoord(status: number, inhoud: Record<string, unknown>): Response {
  return new Response(JSON.stringify(inhoud), { status, headers: JSON_HEADERS });
}

function geldigeAbonnementen(waarde: unknown): PushAbonnement[] {
  if (!Array.isArray(waarde)) return [];
  return waarde.filter((abonnement): abonnement is PushAbonnement => {
    if (!abonnement || typeof abonnement !== "object") return false;
    const kandidaat = abonnement as PushAbonnement;
    return /^https:\/\//.test(kandidaat.endpoint || "")
      && typeof kandidaat.keys?.p256dh === "string"
      && typeof kandidaat.keys?.auth === "string";
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return antwoord(405, { sent: false, error: "Alleen POST" });

  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
  const ontvangenSecret = req.headers.get("x-binnenapp-webhook-secret") || "";
  if (!webhookSecret || ontvangenSecret !== webhookSecret) {
    return antwoord(401, { sent: false, error: "Ongeldige webhook" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:info@janssen-bouw.nl";
  if (!supabaseUrl || !serviceRole || !vapidPublic || !vapidPrivate) {
    return antwoord(500, { sent: false, error: "Pushconfiguratie ontbreekt" });
  }

  let gebeurtenisId = 0;
  try {
    const webhook = await req.json();
    if (webhook?.type !== "INSERT"
        || webhook?.schema !== "private"
        || webhook?.table !== "push_events") {
      return antwoord(400, { sent: false, error: "Onverwachte webhookgegevens" });
    }
    gebeurtenisId = Number(webhook?.record?.id || 0);
  } catch {
    return antwoord(400, { sent: false, error: "Ongeldige JSON" });
  }
  if (!Number.isSafeInteger(gebeurtenisId) || gebeurtenisId <= 0) {
    return antwoord(400, { sent: false, error: "Ongeldig gebeurtenisnummer" });
  }

  const leveringRespons = await fetch(supabaseUrl + "/rest/v1/rpc/binnenapp_push_delivery", {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: "Bearer " + serviceRole,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_event_id: gebeurtenisId }),
  });
  if (!leveringRespons.ok) {
    console.error("[send-web-push] Levering ophalen mislukt:", leveringRespons.status);
    return antwoord(502, { sent: false, error: "Ontvangers ophalen mislukt" });
  }

  const levering = await leveringRespons.json() as PushLevering;
  const abonnementen = geldigeAbonnementen(levering?.subscriptions);
  if (!levering?.event?.id || !levering.event.title || !levering.event.body) {
    return antwoord(502, { sent: false, error: "Ongeldige leveringsgegevens" });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const bericht = JSON.stringify({
    title: levering.event.title,
    body: levering.event.body,
    url: levering.event.url || "/",
    tag: "binnenapp-" + levering.event.id,
  });

  const resultaten = await Promise.allSettled(abonnementen.map((abonnement) =>
    webpush.sendNotification(abonnement, bericht, { TTL: 3600, urgency: "high" })
  ));
  const verstuurd = resultaten.filter((resultaat) => resultaat.status === "fulfilled").length;
  const mislukt = resultaten.length - verstuurd;

  resultaten.forEach((resultaat, index) => {
    if (resultaat.status !== "rejected") return;
    const status = Number(resultaat.reason?.statusCode || 0);
    console.warn("[send-web-push] Ontvanger mislukt:", index, status || "onbekend");
  });

  return antwoord(200, {
    sent: true,
    eventId: levering.event.id,
    subscriptions: abonnementen.length,
    delivered: verstuurd,
    failed: mislukt,
  });
});
