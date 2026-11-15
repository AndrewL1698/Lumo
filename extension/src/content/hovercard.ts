// Hover card for a swapped word (brief 2.3, specs §5.4).
// Shows the Spanish with its article, the English it replaced, and Knew it / Didn't know.
// A hover only counts after 500 ms, so a mouse passing over the word sends nothing.
//
// TODO(naren): false-friend fun fact once the flag is in wordindex.json (agree source with Karthik).

const HOVER_DELAY_MS = 500;
const CARD_ID = "parrot-hover-card";

export interface HoverTarget {
  lemma: string;
  spanish: string;
  english: string;
  /** The sentence the word appeared in — Andrew's tutor uses this. */
  sentence: string;
}

type Verdict = "knew_it" | "didnt_know";

interface Handlers {
  onHover(t: HoverTarget): void;
  onVerdict(t: HoverTarget, verdict: Verdict): void;
  /** Resolves once the word has been spoken, or false if audio was unavailable. */
  onSpeak(t: HoverTarget): Promise<boolean>;
}

// Luci look (D-010): the web app's night panel, straight from web/app/globals.css
// (--color-panel, --color-ink, --color-muted, --color-line, --color-accent, --color-go).
// Fonts stay system ones, since the host page can't load ours.
//
// The card is dark on purpose, so `muted` and `go` are the web app's LIGHT variants — the previous
// dark-on-cream values (#5f6772, #1f7a45) would be unreadable on navy.
const C = {
  panel: "rgb(14 24 42 / .92)",
  ink: "#f4efe3",
  muted: "#b8c3d4",
  line: "rgb(214 225 240 / .14)",
  /** Amber hairline for the one accented control (the speaker). */
  sunLine: "rgb(255 210 58 / .28)",
  accent: "#f5c94a",
  go: "#7fdca3",
  /** Text sitting ON an amber or green fill: both are light, so it has to be the dark navy. */
  onFill: "#0f1a2c",
};
/** How long the "✓" confirmation stays before the card closes. The event is already sent on click. */
const CONFIRM_MS = 550;

let card: HTMLElement | null = null;
/** Bumped on every render, so a delayed close never hides a card that has since been re-shown for another word. */
let renderId = 0;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
/** One hover event per word per page, so re-hovering does not inflate the count. */
const counted = new Set<string>();

function buildCard(): HTMLElement {
  const el = document.createElement("div");
  el.id = CARD_ID;
  el.setAttribute("role", "dialog");
  el.hidden = true;
  // Inline styles: the host page's CSS must not be able to break this, and we inject no
  // stylesheet of our own beyond the swap highlight.
  Object.assign(el.style, {
    position: "absolute",
    zIndex: "2147483647",
    maxWidth: "260px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: C.panel,
    color: C.ink,
    border: `1px solid ${C.line}`,
    // The page shows through the 8% gap in the panel, blurred — the web app's frosted night panel.
    backdropFilter: "blur(8px)",
    font: "14px/1.4 system-ui, -apple-system, Segoe UI, sans-serif",
    // A firm shadow plus a faint amber halo, so the card reads on light and dark pages alike.
    boxShadow: "0 8px 28px rgba(0,0,0,.45), 0 0 0 4px rgba(245,201,74,.10)",
    pointerEvents: "auto",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  return el;
}

function render(el: HTMLElement, t: HoverTarget, handlers: Handlers): void {
  el.textContent = "";

  const es = document.createElement("div");
  Object.assign(es.style, { fontSize: "17px", fontWeight: "600", display: "flex", gap: "8px", alignItems: "center" });

  const word = document.createElement("span");
  word.textContent = t.spanish;

  const speak = document.createElement("button");
  speak.type = "button";
  speak.append(speakerIcon(true));
  speak.title = `Hear "${t.spanish}"`;
  speak.setAttribute("aria-label", `Hear ${t.spanish}`);
  Object.assign(speak.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    border: `1px solid ${C.sunLine}`,
    borderRadius: "999px",
    background: "transparent",
    color: C.accent,
    padding: "0",
    cursor: "pointer",
    transition: "background-color .15s, box-shadow .15s",
  } satisfies Partial<CSSStyleDeclaration>);
  // Lit, the button fills with amber — so the icon has to flip to the dark navy to stay visible.
  const speakGlow = (on: boolean) => {
    speak.style.background = on ? C.accent : "transparent";
    speak.style.color = on ? C.onFill : C.accent;
    speak.style.boxShadow = on ? "0 0 0 3px rgba(245,201,74,.3)" : "none";
  };
  speak.addEventListener("mouseenter", () => speakGlow(true));
  speak.addEventListener("mouseleave", () => {
    if (!speak.disabled) speakGlow(false);
  });
  speak.addEventListener("click", () => {
    if (speak.disabled) return;
    speak.disabled = true;
    speakGlow(true); // glows while the word plays
    void handlers
      .onSpeak(t)
      .then((played) => {
        // No audio available: say so once rather than leaving a dead button.
        if (!played) {
          speak.replaceChildren(speakerIcon(false));
          speak.style.color = C.muted;
        }
      })
      .finally(() => {
        speak.disabled = false;
        speakGlow(false);
      });
  });

  es.append(word, speak);

  const en = document.createElement("div");
  en.textContent = t.english;
  Object.assign(en.style, { color: C.muted, marginTop: "2px" });

  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", gap: "6px", marginTop: "10px" });

  const myRender = ++renderId;
  const buttons: HTMLButtonElement[] = [];
  for (const [label, done, verdict, tone, halo] of [
    ["Knew it", "✓ Knew it", "knew_it", C.go, "rgba(127,220,163,.26)"],
    ["Didn't know", "✓ Still learning", "didnt_know", C.accent, "rgba(245,201,74,.3)"],
  ] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      flex: "1",
      padding: "6px 8px",
      borderRadius: "6px",
      border: `1px solid ${C.line}`,
      background: "transparent",
      color: C.ink,
      font: "inherit",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "border-color .12s, box-shadow .12s, background-color .12s, color .12s, transform .08s",
    } satisfies Partial<CSSStyleDeclaration>);
    // Outline on hover and on keyboard focus.
    const outline = (on: boolean) => {
      if (btn.disabled) return;
      btn.style.borderColor = on ? tone : C.line;
      btn.style.boxShadow = on ? `0 0 0 3px ${halo}` : "none";
    };
    btn.addEventListener("mouseenter", () => outline(true));
    btn.addEventListener("mouseleave", () => outline(false));
    btn.addEventListener("focus", () => outline(true));
    btn.addEventListener("blur", () => outline(false));
    btn.addEventListener("mousedown", () => (btn.style.transform = "scale(.97)"));
    btn.addEventListener("mouseup", () => (btn.style.transform = ""));
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      handlers.onVerdict(t, verdict); // sent right away, as before
      // Confirm on screen, then close.
      for (const b of buttons) b.disabled = true;
      // `tone` is a light amber or green, so the confirmed label reads in dark navy, not white.
      Object.assign(btn.style, { background: tone, borderColor: tone, color: C.onFill, boxShadow: `0 0 0 3px ${halo}`, transform: "" });
      btn.textContent = done;
      for (const b of buttons) if (b !== btn) b.style.opacity = ".45";
      setTimeout(() => {
        if (renderId === myRender) hide();
      }, CONFIRM_MS);
    });
    buttons.push(btn);
    row.appendChild(btn);
  }

  el.append(es, en, row);
}

/** A drawn speaker (sound waves when audio works, a cross when it doesn't), in the button's colour. */
function speakerIcon(sound: boolean): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const paths = sound
    ? ["M4 9h4l5-4v14l-5-4H4z", "M16.5 8.5a5 5 0 0 1 0 7", "M19 6a8.5 8.5 0 0 1 0 12"]
    : ["M4 9h4l5-4v14l-5-4H4z", "M17 9l5 6", "M22 9l-5 6"];
  for (const d of paths) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", d.startsWith("M4") ? "currentColor" : "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }
  return svg;
}

function place(el: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  el.hidden = false; // must be laid out before we can measure it
  const { offsetWidth: w, offsetHeight: h } = el;
  const margin = 8;

  let left = window.scrollX + r.left;
  left = Math.min(left, window.scrollX + document.documentElement.clientWidth - w - margin);
  left = Math.max(left, window.scrollX + margin);

  // Above the word when there is room, otherwise below it.
  const above = r.top > h + margin;
  const top = above ? window.scrollY + r.top - h - margin : window.scrollY + r.bottom + margin;

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/** Opened by a click: stays open when the mouse leaves the word, until a click elsewhere, Esc or a verdict (D-015). */
let pinned = false;

function hide(): void {
  clearTimeout(hoverTimer);
  pinned = false;
  if (card) card.hidden = true;
}

function targetOf(el: HTMLElement): HoverTarget | null {
  const lemma = el.dataset.parrotLemma;
  const english = el.dataset.parrotEn;
  if (!lemma || !english) return null;
  return {
    lemma,
    spanish: el.textContent ?? "",
    english,
    sentence: el.dataset.parrotSentence ?? "",
  };
}

/** Attach once per page; works for swaps added later because it is delegated. */
export function installHoverCard(markAttr: string, handlers: Handlers): void {
  document.addEventListener("mouseover", (ev) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>(`[${markAttr}]`);
    if (!el) return;
    const t = targetOf(el);
    if (!t) return;

    clearTimeout(hideTimer);
    clearTimeout(hoverTimer);
    if (pinned && card && !card.hidden) return; // a clicked-open card stays put until dismissed
    // The 500 ms rule: only a deliberate hover opens the card and counts.
    hoverTimer = setTimeout(() => show(el, t), HOVER_DELAY_MS);
  });

  /** Open the card for `el` now, and count the look-up once per word (hover or click alike). */
  function show(el: HTMLElement, t: HoverTarget): void {
    card ??= buildCard();
    render(card, t, handlers);
    place(card, el);
    if (!counted.has(t.lemma)) {
      counted.add(t.lemma);
      handlers.onHover(t);
    }
  }

  // Click a swapped word: open its card right away (D-015). Click anywhere else: close it.
  document.addEventListener(
    "click",
    (ev) => {
      const target = ev.target as Element | null;
      if (target?.closest(`#${CARD_ID}`)) return; // clicks inside the card are the card's own
      const el = target?.closest<HTMLElement>(`[${markAttr}]`);
      const t = el ? targetOf(el) : null;
      if (el && t) {
        ev.preventDefault(); // never follow a link the word might sit in
        clearTimeout(hoverTimer);
        clearTimeout(hideTimer);
        show(el, t);
        pinned = true;
        return;
      }
      if (card && !card.hidden) hide();
    },
    true,
  );

  document.addEventListener("mouseout", (ev) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>(`[${markAttr}]`);
    if (!el) return;
    clearTimeout(hoverTimer);
    if (pinned) return;
    // Grace period so moving the pointer into the card itself does not dismiss it.
    hideTimer = setTimeout(hide, 220);
  });

  document.addEventListener("mouseover", (ev) => {
    if ((ev.target as Element | null)?.closest(`#${CARD_ID}`)) clearTimeout(hideTimer);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hide();
  });
}
