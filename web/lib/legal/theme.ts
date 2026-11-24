/** Même clé que la carte (index.html) : le thème choisi sur la carte s'applique aussi aux pages juridiques. */
export const THEME_KEY = "roche-street-food:theme";

/**
 * Thème appliqué avant l'affichage (script en ligne du layout, sans flash de la mauvaise couleur) :
 * « dark » / « light » enregistré, « system » (suit le réglage du téléphone), sinon le mode jour (par défaut).
 * « night » active les classes « dark: » (globals.css).
 */
export const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t!=='light'&&t!=='dark')t='light';document.documentElement.setAttribute('data-theme',t==='dark'?'night':'day')})()`;

/** Même règle que THEME_SCRIPT : nuit si « dark », ou si « system » et le téléphone est en mode sombre. */
export function storedNight(): boolean {
  let t: string | null = null;
  try { t = localStorage.getItem(THEME_KEY); } catch { /* navigation privée */ }
  if (t === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return t === "dark";   // par défaut : mode jour
}
