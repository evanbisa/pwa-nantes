/** Même clé que la carte (index.html) : le thème choisi sur la carte s'applique aussi aux pages juridiques. */
export const THEME_KEY = "roche-street-food:theme";

/**
 * Thème appliqué avant l'affichage (script en ligne du layout, sans flash de la mauvaise couleur) :
 * « dark » / « light » enregistré, sinon celui du système. « night » active les classes « dark: » (globals.css).
 */
export const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t==='dark'?'night':'day')})()`;
