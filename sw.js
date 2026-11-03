/*
 * FlashMiam : service worker.
 *  - fichiers du site qui ne changent pas (bibliothèques et polices de vendor/, icônes) : gardés sur l'appareil,
 *    donc chargés instantanément et sans solliciter le serveur aux visites suivantes ;
 *  - pages : toujours demandées au réseau (dernière version) ; réseau coupé ou saturé (pas de réponse en 6 s),
 *    la dernière version gardée s'affiche à la place ;
 *  - jamais de cache pour les données (Supabase) ni pour la carte (tuiles) ;
 *  - « push » : alerte envoyée par la fonction serveur send-push (même FlashMiam fermé) ;
 *  - clic sur une alerte : ouvre FlashMiam sur la bonne fiche (ou l'onglet déjà ouvert).
 */
const CACHE = 'flashmiam-v3';   // à changer si les fichiers de vendor/ changent sans changer de nom
const STATIC = /\/(vendor\/.+|icon-(192|512)\.png)$/;
const PAGE_TIMEOUT = 6000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Navigateurs récents : seules les pages et les fichiers du site passent par ce service worker ; tout le reste
  // (Supabase, tuiles de la carte…) va directement au réseau, sans le moindre détour.
  if (event.addRoutes && self.URLPattern) {
    const here = { protocol: self.location.protocol.slice(0, -1), hostname: self.location.hostname, port: self.location.port };
    event.waitUntil(event.addRoutes([
      { condition: { requestMode: 'navigate' }, source: 'fetch-event' },
      { condition: { urlPattern: new URLPattern({ ...here, pathname: '*/vendor/*' }) }, source: 'fetch-event' },
      { condition: { urlPattern: new URLPattern({ ...here, pathname: '*/icon-*.png' }) }, source: 'fetch-event' },
      { condition: { urlPattern: new URLPattern({}) }, source: 'network' },
    ]).catch(() => {}));
  }
});
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith('flashmiam-') && n !== CACHE).map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (STATIC.test(url.pathname)) event.respondWith(cacheFirst(req));
  else if (req.mode === 'navigate') event.respondWith(networkFirst(req, url));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;            // liens ?r=… : même page
  // (une requête de navigation ne peut pas recevoir de signal d'abandon : course avec un minuteur)
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  const first = await Promise.race([network.catch(() => null), new Promise((r) => setTimeout(r, PAGE_TIMEOUT, null))]);
  if (first) return first;
  const hit = await cache.match(key);
  return hit || network;                            // rien de gardé : on attend le réseau
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'FlashMiam', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    lang: 'fr',
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope);
  if (target.searchParams.get('r')) target.searchParams.set('s', 'notif');   // visite comptée « depuis une notification »
  const url = target.href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (open) {
      open.postMessage({ type: 'open', url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
