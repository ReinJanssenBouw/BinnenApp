const CACHE_VERSIE = "binnenapp-push-20260924-1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const sleutels = await caches.keys();
    await Promise.all(sleutels
      .filter((sleutel) => sleutel.startsWith("binnenapp-push-") && sleutel !== CACHE_VERSIE)
      .map((sleutel) => caches.delete(sleutel)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let bericht = {};
  try {
    bericht = event.data?.json() || {};
  } catch {
    bericht = { body: event.data?.text() || "Er is iets gewijzigd in BinnenApp." };
  }

  const titel = String(bericht.title || "BinnenApp");
  const opties = {
    body: String(bericht.body || "Er is iets gewijzigd in BinnenApp."),
    icon: "/BinnenAppLogoWit.png",
    badge: "/BinnenAppLogoWit.png",
    tag: String(bericht.tag || "binnenapp-update"),
    renotify: true,
    data: { url: String(bericht.url || "/") },
  };
  event.waitUntil((async () => {
    // Een push is alleen nuttig wanneer BinnenApp op dit apparaat niet
    // zichtbaar is. Zo krijgt iemand tijdens het toevoegen geen melding van
    // de handeling die al voor zijn neus in de app gebeurt.
    const vensters = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const appIsZichtbaar = vensters.some((venster) =>
      new URL(venster.url).origin === self.location.origin
      && venster.visibilityState === "visible"
    );
    if (appIsZichtbaar) return;

    await self.registration.showNotification(titel, opties);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const bestemming = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil((async () => {
    const vensters = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const bestaand = vensters.find((venster) => new URL(venster.url).origin === self.location.origin);
    if (bestaand) {
      bestaand.postMessage({ type: "binnenapp-open-bestemming", url: bestemming });
      return bestaand.focus();
    }
    return self.clients.openWindow(bestemming);
  })());
});
