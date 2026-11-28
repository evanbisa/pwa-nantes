/*
 * FlashMiam : mesure de la fluidité sur un vrai téléphone (iPhone, Android).
 *
 * Chargé seulement avec le lien spécial « ?mesure » (voir index.html) : les visiteurs ne le téléchargent jamais.
 * Rien n'est envoyé nulle part : le résultat s'affiche à l'écran (capture d'écran, ou bouton « Copier le résultat »).
 *
 * Ce qui est mesuré, pendant chaque geste :
 *  - l'horloge d'affichage du navigateur (requestAnimationFrame) : images par seconde, images en retard (plus d'une fois
 *    et demie l'intervalle normal de l'écran : une saccade visible), pire image ;
 *  - la réaction au toucher : du toucher à l'image qui en montre le résultat (deux images plus tard).
 * Les gestes sont reconnus tout seuls : carte qui bouge avec un ou deux doigts (classe « is-moving » posée par la carte),
 * fiches qui s'ouvrent, se ferment, défilent ou sont tirées au doigt (classes « is-open » et « is-dragging »).
 */
(function () {
  'use strict';
  if (window.__fmMesure) return;

  const N = 1 << 15;                         // anneau d'horodatages : environ 9 minutes d'images à 60 par seconde
  const ts = new Float64Array(N);
  let n = 0;
  const wins = [];                           // fenêtres de geste : { type, a, b }
  const taps = [];                           // réactions au toucher : { type, ms }
  const now = () => performance.now();
  const frame = (t) => { ts[n % N] = t; n++; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);

  const LABELS = {
    pan: 'Glisser la carte', zoom: 'Zoomer à deux doigts', open: 'Ouvrir une fiche', close: 'Fermer la fiche',
    offers: 'Ouvrir les offres', scroll: 'Faire défiler la fiche', drag: 'Fiche tirée au doigt', fly: 'Carte qui se recentre',
    offersClose: 'Fermer les offres', story: 'Ouvrir une story',
  };
  const STEPS = [
    ['pan', 'Glisser la carte avec un doigt'],
    ['zoom', 'Zoomer avec deux doigts (écarter, puis rapprocher)'],
    ['open', 'Ouvrir la fiche d\'un restaurant (toucher un repère ; la Pizzeria du Boulevard, fiche d\'exemple, de préférence)'],
    ['close', 'Fermer la fiche (croix, ou glisser vers le bas)'],
    ['offers', 'Ouvrir les offres (onglet « Offres » en bas)'],
  ];
  const done = {};
  const add = (type, a, b) => { wins.push({ type, a, b }); if (!done[type]) { done[type] = true; paintSteps(); } };

  /* ---------- Carte : un doigt (glisser), deux doigts (zoom), aucun (la carte se recentre toute seule) ---------- */
  const map = document.getElementById('map');
  let touchesNow = 0, mapWin = null;
  const onTouch = (e) => { touchesNow = e.touches.length; if (mapWin) mapWin.max = Math.max(mapWin.max, touchesNow); };
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((t) => map.addEventListener(t, onTouch, { passive: true, capture: true }));
  new MutationObserver(() => {
    const moving = map.classList.contains('is-moving');
    if (moving && !mapWin) mapWin = { a: now(), max: touchesNow };
    else if (!moving && mapWin) {
      const w = mapWin, b = now();
      mapWin = null;
      if (b - w.a > 150) add(w.max >= 2 ? 'zoom' : w.max === 1 ? 'pan' : 'fly', w.a, b);
    }
  }).observe(map, { attributes: true, attributeFilter: ['class'] });

  /* ---------- Fiches : ouverture, fermeture, fiche tirée au doigt, défilement ---------- */
  function watchSheet(id, open, close) {
    const el = document.getElementById(id);
    if (!el) return;
    let wasOpen = el.classList.contains('is-open'), dragging = false, dragA = 0;
    new MutationObserver(() => {
      const isOpen = el.classList.contains('is-open'), drag = el.classList.contains('is-dragging'), t = now();
      if (isOpen !== wasOpen) { wasOpen = isOpen; add(isOpen ? open : close, t, t + 700); }
      if (drag !== dragging) { dragging = drag; if (drag) dragA = t; else if (t - dragA > 120) add('drag', dragA, t); }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  watchSheet('shop-sheet', 'open', 'close');
  watchSheet('offers-sheet', 'offers', 'offersClose');
  let scrollWin = null;
  document.addEventListener('scroll', (e) => {
    const tg = e.target;
    if (!(tg instanceof Element) || !tg.closest('#shop-sheet')) return;
    const t = now();
    if (!scrollWin) scrollWin = { a: t, b: t, timer: 0 };
    scrollWin.b = t;
    clearTimeout(scrollWin.timer);
    scrollWin.timer = setTimeout(() => { const w = scrollWin; scrollWin = null; if (w.b - w.a > 150) add('scroll', w.a, w.b + 50); }, 250);
  }, { capture: true, passive: true });

  /* ---------- Réaction au toucher : du toucher à l'image qui montre le résultat ---------- */
  document.addEventListener('click', (e) => {
    const tg = e.target instanceof Element ? e.target : null;
    const ui = document.getElementById('fm-mesure');
    if (!tg || (ui && ui.contains(tg))) return;
    const type = tg.closest('.pin') ? 'open' : tg.closest('#offers-btn') ? 'offers' : tg.closest('#shop-sheet [data-close]') ? 'close'
      : tg.closest('.story-chip, #shop-emoji') ? 'story' : null;
    if (!type) return;
    // Horodatage de l'événement (même horloge que performance.now() sur les navigateurs récents) ; sinon : maintenant
    const t0 = e.timeStamp > 0 && e.timeStamp < now() + 1 && now() - e.timeStamp < 5000 ? e.timeStamp : now();
    requestAnimationFrame(() => requestAnimationFrame((t2) => { if (t2 - t0 >= 0 && t2 - t0 < 10000) taps.push({ type, ms: t2 - t0 }); }));
  }, { capture: true, passive: true });

  /* ---------- Calcul ---------- */
  function frames() {
    const out = [];
    for (let i = Math.max(0, n - N); i < n; i++) out.push(ts[i % N]);
    return out;
  }
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  function compute() {
    const f = frames();
    const iv = [];
    for (let i = 1; i < f.length; i++) { const d = f[i] - f[i - 1]; if (d > 0 && d < 500) iv.push(d); }
    const base = median(iv) || 1000 / 60;   // intervalle normal de l'écran (16,7 ms à 60 images par seconde)
    const late = base * 1.5;
    const lower = (t) => { let lo = 0, hi = f.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f[m] < t) lo = m + 1; else hi = m; } return lo; };
    const rows = {};
    for (const w of wins) {
      const r = rows[w.type] || (rows[w.type] = { count: 0, time: 0, late: 0, worst: 0, times: 0 });
      r.times++;
      for (let i = Math.max(1, lower(w.a)); i < f.length && f[i] <= w.b; i++) {
        const d = f[i] - f[i - 1];
        if (d <= 0 || d >= 500) continue;   // page cachée (changement d'appli) : ignoré
        r.count++; r.time += d; if (d > late) r.late++; if (d > r.worst) r.worst = d;
      }
    }
    const tapRows = {};
    for (const tp of taps) (tapRows[tp.type] || (tapRows[tp.type] = [])).push(tp.ms);
    return { base, rows, tapRows };
  }

  /* ---------- Affichage ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #fm-mesure { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 6px); left: 50%; transform: translateX(-50%);
    z-index: 2147483000; font: 500 14px/1.35 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #16213a;
    width: min(94vw, 400px); display: grid; justify-items: center; pointer-events: none; }
  #fm-mesure > * { pointer-events: auto; }
  #fm-mesure button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; cursor: pointer; }
  .fmm-pill { padding: 7px 14px; color: #fff; background: #16213a; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
  .fmm-pill.is-done { background: #0e7c45; }
  .fmm-panel { margin-top: 8px; width: 100%; max-height: calc(100vh - 90px); max-height: calc(100dvh - env(safe-area-inset-top, 0px) - 80px);
    overflow: auto; padding: 14px 16px; border-radius: 18px; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,.3); }
  .fmm-panel h2 { margin: 0 0 4px; font-size: 18px; }
  .fmm-panel p { margin: 0 0 10px; color: #55607a; }
  .fmm-list { margin: 0 0 12px; padding: 0; list-style: none; display: grid; gap: 8px; }
  .fmm-list li { display: grid; grid-template-columns: 22px 1fr; gap: 6px; align-items: start; }
  .fmm-list li span:first-child { font-weight: 700; }
  .fmm-list li.is-ok { color: #0e7c45; }
  .fmm-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .fmm-actions button { padding: 10px 14px; background: #eef0f4; color: #16213a; }
  .fmm-actions .fmm-main { background: #16213a; color: #fff; }
  .fmm-out table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 13px; }
  .fmm-out th, .fmm-out td { padding: 4px 4px; border-bottom: 1px solid #dfe3ea; text-align: left; vertical-align: top; }
  .fmm-out .fmm-device { margin: 0 0 6px; }
  .fmm-out td:not(:first-child), .fmm-out th:not(:first-child) { text-align: right; white-space: nowrap; }
  .fmm-good { color: #0e7c45; } .fmm-mid { color: #a85a00; } .fmm-bad { color: #d1301f; }
  .fmm-device { font-size: 12.5px; color: #55607a; }
  .fmm-warn { margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: #fff3d6; color: #6b4300; font-size: 13px; }`;
  document.head.appendChild(css);

  const root = document.createElement('div');
  root.id = 'fm-mesure';
  root.innerHTML = '<button class="fmm-pill" type="button" aria-expanded="true">📏 Mesure · 0/5</button>'
    + '<div class="fmm-panel" role="dialog" aria-label="Mesure de fluidité">'
    + '<h2>Mesure de fluidité</h2>'
    + '<p>Attendez que les restaurants s\'affichent, puis faites ces gestes, dans l\'ordre que vous voulez. Chaque case se coche toute seule.</p>'
    + '<ol class="fmm-list"></ol>'
    + '<div class="fmm-actions"><button class="fmm-main fmm-go" type="button">C\'est parti</button><button class="fmm-see" type="button">Voir le résultat</button></div>'
    + '<div class="fmm-out" hidden></div></div>';
  // Les touchers sur la mesure ne remontent pas jusqu'au site (pas de fermeture de fiche, etc.)
  ['click', 'pointerdown', 'touchstart'].forEach((t) => root.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
  const pill = root.querySelector('.fmm-pill'), panel = root.querySelector('.fmm-panel'), out = root.querySelector('.fmm-out');
  const setOpen = (on) => { panel.hidden = !on; pill.setAttribute('aria-expanded', String(on)); };
  const allDone = () => STEPS.every(([type]) => done[type]);
  pill.addEventListener('click', () => { if (allDone()) showResult(); else setOpen(panel.hidden); });
  root.querySelector('.fmm-go').addEventListener('click', () => setOpen(false));
  root.querySelector('.fmm-see').addEventListener('click', showResult);
  (document.body || document.documentElement).appendChild(root);

  function paintSteps() {
    const list = root.querySelector('.fmm-list');
    list.textContent = '';
    let k = 0;
    for (const [type, text] of STEPS) {
      const li = document.createElement('li');
      if (done[type]) { li.className = 'is-ok'; k++; }
      li.innerHTML = '<span aria-hidden="true"></span><span></span>';
      li.firstChild.textContent = done[type] ? '✓' : '○';
      li.lastChild.textContent = text + (done[type] ? ' — mesuré' : '');
      list.appendChild(li);
    }
    pill.textContent = k === STEPS.length ? '✓ 5/5 · Voir le résultat' : '📏 Mesure · ' + k + '/5';
    pill.classList.toggle('is-done', k === STEPS.length);
  }
  paintSteps();

  function device() {
    const ua = navigator.userAgent;
    const ios = /OS (\d+)[._](\d+)/.exec(ua);
    const model = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : 'Ordinateur';
    const sys = /iPhone|iPad/.test(ua) && ios ? 'iOS ' + ios[1] + '.' + ios[2] : (/Android (\d+(\.\d+)?)/.exec(ua) || [])[0] || '';
    const browser = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS|Edg\//.test(ua) ? 'Edge' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Chrome/.test(ua) ? 'Chrome' : '';
    const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    return [model, sys, browser + (standalone ? ' (appli sur l\'écran d\'accueil)' : ''),
      'écran ' + screen.width + '×' + screen.height + ' ×' + (window.devicePixelRatio || 1)].filter(Boolean).join(' · ');
  }
  const fmt = (x) => String(Math.round(x));
  const cls = (ok, mid) => (ok ? 'fmm-good' : mid ? 'fmm-mid' : 'fmm-bad');

  function showResult() {
    const { base, rows, tapRows } = compute();
    const hz = 1000 / base;
    const order = ['pan', 'zoom', 'open', 'close', 'offers', 'scroll', 'drag', 'fly', 'offersClose', 'story'];
    const lines = [];
    let html = '<table><thead><tr><th>Geste</th><th>Images/s</th><th>Saccades</th><th>Pire image</th></tr></thead><tbody>';
    for (const type of order) {
      const r = rows[type];
      if (!r || !r.count) continue;
      const fps = r.count / (r.time / 1000), latePct = 100 * r.late / r.count;
      html += '<tr><td>' + LABELS[type] + (r.times > 1 ? ' (' + r.times + '×)' : '') + '</td>'
        + '<td class="' + cls(fps >= hz * 0.9, fps >= hz * 0.75) + '">' + fmt(fps) + '</td>'
        + '<td class="' + cls(latePct < 5, latePct < 15) + '">' + fmt(latePct) + ' %</td>'
        + '<td class="' + cls(r.worst < 50, r.worst < 100) + '">' + fmt(r.worst) + ' ms</td></tr>';
      lines.push(LABELS[type] + (r.times > 1 ? ' (' + r.times + '×)' : '') + ' : ' + fmt(fps) + ' images/s, ' + fmt(latePct) + ' % de saccades, pire image ' + fmt(r.worst) + ' ms');
    }
    html += '</tbody></table>';
    const tapOrder = ['open', 'close', 'offers', 'story'];
    let tapHtml = '';
    for (const type of tapOrder) {
      const a = tapRows[type];
      if (!a || !a.length) continue;
      const m = median(a);
      tapHtml += '<tr><td>' + LABELS[type] + (a.length > 1 ? ' (' + a.length + '×)' : '') + '</td><td class="' + cls(m <= 200, m <= 500) + '">' + fmt(m) + ' ms</td></tr>';
      lines.push('Réaction au toucher, ' + LABELS[type].toLowerCase() + ' : ' + fmt(m) + ' ms' + (a.length > 1 ? ' (médiane de ' + a.length + ')' : ''));
    }
    if (tapHtml) html += '<table><thead><tr><th>Réaction au toucher</th><th>Temps</th></tr></thead><tbody>' + tapHtml + '</tbody></table>';
    if (!lines.length) html = '<p>Aucun geste mesuré pour l\'instant : faites les gestes de la liste, puis revenez ici.</p>';
    const dev = device(), rate = 'écran à ' + fmt(hz) + ' images/s';
    // Appareil en tête : toujours sur la capture d'écran, même si le tableau est long
    let head = '<p class="fmm-device">' + dev + ' · ' + rate + ' · ' + new Date().toLocaleString('fr-FR') + '</p>';
    if (hz < 40) head += '<p class="fmm-warn">L\'écran tourne à ' + fmt(hz) + ' images/s : le mode Économie d\'énergie est sans doute activé (il bride l\'affichage). Désactivez-le, rechargez la page et recommencez.</p>';
    html = head + html;
    html += '<div class="fmm-actions"><button class="fmm-main fmm-copy" type="button">Copier le résultat</button><button class="fmm-again" type="button">Continuer les gestes</button></div>';
    out.innerHTML = html;
    out.hidden = false;
    root.querySelector('.fmm-list').hidden = true;
    root.querySelector('.fmm-panel > p').hidden = true;
    root.querySelector('.fmm-panel > .fmm-actions').hidden = true;
    root.querySelector('.fmm-panel h2').textContent = 'Résultat de la mesure';
    setOpen(true);
    const text = 'FlashMiam — mesure de fluidité\n' + dev + ' · ' + rate + ' · ' + new Date().toLocaleString('fr-FR') + '\n' + lines.join('\n');
    out.querySelector('.fmm-copy').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const ok = () => { btn.textContent = 'Copié ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => { btn.textContent = 'Copie impossible : faites une capture'; });
      else btn.textContent = 'Copie impossible : faites une capture';
    });
    out.querySelector('.fmm-again').addEventListener('click', () => {
      out.hidden = true;
      root.querySelector('.fmm-list').hidden = false;
      root.querySelector('.fmm-panel > p').hidden = false;
      root.querySelector('.fmm-panel > .fmm-actions').hidden = false;
      root.querySelector('.fmm-panel h2').textContent = 'Mesure de fluidité';
      setOpen(false);
    });
  }

  window.__fmMesure = { compute, wins, taps };
})();
