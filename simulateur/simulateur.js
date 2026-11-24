/**
 * Simulateur de téléphone : le site s'affiche dans un cadre à la taille exacte d'un écran (en pixels CSS du
 * téléphone), réduit si besoin pour tenir dans la fenêtre. Le site lit `FLASHMIAM_SIM.platform` pour se comporter
 * comme sur ce téléphone (iPhone ou Android : conseils d'installation, etc.).
 */
(function () {
  'use strict';
  var DEVICES = [
    { id: 'iphone', label: 'iPhone 14', w: 390, h: 844, platform: 'ios', cls: '' },
    { id: 'iphone-max', label: 'iPhone 15 Pro Max', w: 430, h: 932, platform: 'ios', cls: '' },
    { id: 'iphone-se', label: 'iPhone SE', w: 375, h: 667, platform: 'ios', cls: 'small' },
    { id: 'android', label: 'Android (Pixel 7)', w: 412, h: 915, platform: 'android', cls: 'android' },
  ];
  var BEZEL = 14;
  var KEY = 'flashmiam:simulateur';
  var $ = function (id) { return document.getElementById(id); };
  var current = DEVICES[0];
  try { var saved = localStorage.getItem(KEY); DEVICES.forEach(function (d) { if (d.id === saved) current = d; }); } catch (e) { /* stockage indisponible */ }
  window.FLASHMIAM_SIM = { platform: current.platform };

  function layout() {
    var phone = $('phone'), screen = $('screen'), holder = $('holder'), stage = $('stage');
    var fullW = current.w + BEZEL * 2, fullH = current.h + BEZEL * 2;
    phone.className = 'phone' + (current.cls ? ' ' + current.cls : '');
    screen.style.width = current.w + 'px';
    screen.style.height = current.h + 'px';
    var availW = stage.clientWidth - 32, availH = stage.clientHeight - 32;
    var scale = Math.min(1, availW / fullW, availH / fullH);
    phone.style.transform = 'scale(' + scale + ')';
    holder.style.width = fullW * scale + 'px';
    holder.style.height = fullH * scale + 'px';
  }

  function pick(d) {
    var changedPlatform = d.platform !== current.platform;
    current = d;
    window.FLASHMIAM_SIM.platform = d.platform;
    try { localStorage.setItem(KEY, d.id); } catch (e) { /* stockage indisponible */ }
    document.querySelectorAll('#devices button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === d.id)); });
    layout();
    // Autre système (iPhone ↔ Android) : la page est rechargée pour s'y adapter
    if (changedPlatform) reload();
  }

  function reload() { try { $('app').contentWindow.location.reload(); } catch (e) { $('app').src = $('app').src; } }

  var box = $('devices');
  var label = document.createElement('span'); label.textContent = 'Téléphone'; box.appendChild(label);
  DEVICES.forEach(function (d) {
    var b = document.createElement('button');
    b.type = 'button'; b.dataset.id = d.id; b.textContent = d.label;
    b.setAttribute('aria-pressed', String(d.id === current.id));
    b.addEventListener('click', function () { pick(d); });
    box.appendChild(b);
  });
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { $('app').src = b.dataset.go; });
  });
  $('reload').addEventListener('click', reload);
  window.addEventListener('resize', layout);
  layout();
})();
