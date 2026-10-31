/**
 * Lecture des QR codes pour le scanner du restaurateur (navigateurs sans lecteur intégré : iPhone, Firefox…).
 * Le décodage se fait ici, hors du fil principal : l'image de la caméra et les animations restent fluides.
 * Reçoit { id, buf, w, h } (pixels RGBA) et renvoie { id, text } (texte du QR code, ou null).
 */
importScripts('vendor/jsqr-1.4.0/jsQR.js');
self.onmessage = (ev) => {
  const { id, buf, w, h } = ev.data || {};
  let text = null;
  try {
    const r = self.jsQR(new Uint8ClampedArray(buf), w, h, { inversionAttempts: 'dontInvert' });
    text = r ? r.data : null;
  } catch (e) { text = null; }
  self.postMessage({ id, text });
};
