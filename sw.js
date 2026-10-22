/*
 * FlashMiam : service worker des alertes (notifications de l'appareil).
 * Pas de cache hors ligne : le site est toujours chargé depuis le réseau.
 *  - « push » : alerte envoyée par la fonction serveur send-push (même FlashMiam fermé) ;
 *  - clic sur une alerte : ouvre FlashMiam sur la bonne fiche (ou l'onglet déjà ouvert).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
