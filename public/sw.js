/* Service worker de Punto de Quiebre.
 * - Pantalla "sin conexión" para navegaciones cuando no hay red.
 * - Recepción de notificaciones Web Push (los envíos se programan en el worker del servidor).
 * Nunca cachea páginas autenticadas ni respuestas de la API: solo el shell offline y los íconos.
 */
const CACHE = "pdq-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/maskable-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate") return; // todo lo demás va directo a la red
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" ? data.title.slice(0, 80) : "Punto de Quiebre";
  const body = typeof data.body === "string" ? data.body.slice(0, 240) : "";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/hoy";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/maskable-192.png",
      lang: "es-MX",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/hoy";
  const target = new URL(path, self.location.origin);
  if (target.origin !== self.location.origin) return; // solo rutas propias
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
