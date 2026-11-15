// The "Lumo is on" layer: one fixed, click-through sheet over the whole page — a very faint navy
// wash with a soft amber glow pulled in from the edges, the same night-and-firefly look as the web
// app (web/app/globals.css: --color-bg #0f1a2c, --color-glow #ffd23a).
//
// It exists for the demo: from the back of the room a judge can see at a glance that the extension
// is on, without hunting for a swapped word. So it has to be true on every site and never cost us
// anything:
//   - `pointer-events: none` so every click, hover and text selection passes straight through;
//   - `position: fixed` + no size, so it can never move the page's own layout by a pixel;
//   - alpha low enough that contrast is untouched (a 0.055 navy wash over white text on black
//     still leaves ~18:1, far above AA);
//   - `!important` on the structural properties, because the host page's CSS is not ours to trust.
//
// It sits one below the hover card's z-index so the card is never washed by it.

/** The "Lumo is on" edge glow. Off by request; the code stays so it can come back with one change. */
export const AMBIENCE_ENABLED = false;

const LAYER_ID = "luci-ambience";
const STYLE_ID = "luci-ambience-style";
/** One below the hover card (2147483647), so the card always reads clean on top. */
const Z = 2147483646;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  const sel = `#${LAYER_ID}`;
  style.textContent =
    `${sel}{` +
    `position:fixed!important;inset:0!important;` +
    `pointer-events:none!important;` +
    `z-index:${Z}!important;` +
    `margin:0!important;padding:0!important;border:0!important;` +
    `width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;` +
    `transform:none!important;filter:none!important;opacity:1!important;` +
    `display:block!important;visibility:visible!important;` +
    // The wash: barely-there navy, so the page reads as "at night" without dimming the text.
    `background:rgba(15,26,44,.055)!important;` +
    // The glow: amber pulled in from the edges, strongest in the corners.
    `box-shadow:inset 0 0 140px 28px rgba(255,210,58,.10),` +
    `inset 0 0 44px 6px rgba(255,210,58,.07)!important;` +
    `}` +
    // Never on paper, and never in the way of a screenshot the judges take.
    `@media print{${sel}{display:none!important}}`;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Show the layer. Safe to call repeatedly: it re-attaches if the host page removed it.
 * Attached to <html>, not <body>, so an SPA replacing the body does not take it with it.
 */
export function showAmbience(): void {
  // Turned off: the yellow edge glow was distracting. Set to true to bring it back (e.g. for a stage demo).
  if (!AMBIENCE_ENABLED) {
    hideAmbience(); // also clears a layer left by an older build in an open tab
    return;
  }
  injectStyle();
  if (document.getElementById(LAYER_ID)) return;
  const el = document.createElement("div");
  el.id = LAYER_ID;
  el.setAttribute("aria-hidden", "true"); // decorative: screen readers must not announce it
  el.dataset.luci = "ambience";
  document.documentElement.appendChild(el);
}

/** Remove it. Called when Lumo is switched off, so the page goes back to exactly as it was. */
export function hideAmbience(): void {
  document.getElementById(LAYER_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}
