// Hover card for a swapped word (brief 2.3, specs §5.4).
// Shows the Spanish with its article, the English it replaced, and Knew it / Didn't know.
// A hover only counts after 500 ms, so a mouse passing over the word sends nothing.
//
// TODO(naren): 3.1 speaker button -> SW -> POST /api/tts, cached by lemma.
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

let card: HTMLElement | null = null;
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
    borderRadius: "8px",
    background: "#1c1c1e",
    color: "#fff",
    font: "14px/1.4 system-ui, -apple-system, Segoe UI, sans-serif",
    boxShadow: "0 6px 24px rgba(0,0,0,.28)",
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
  speak.textContent = "🔊";
  speak.title = `Hear "${t.spanish}"`;
  speak.setAttribute("aria-label", `Hear ${t.spanish}`);
  Object.assign(speak.style, {
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontSize: "15px",
    lineHeight: "1",
    padding: "2px 4px",
    cursor: "pointer",
    opacity: ".8",
  } satisfies Partial<CSSStyleDeclaration>);
  speak.addEventListener("click", () => {
    if (speak.disabled) return;
    speak.disabled = true;
    speak.style.opacity = ".4";
    void handlers
      .onSpeak(t)
      .then((played) => {
        // No audio available: say so once rather than leaving a dead button.
        if (!played) speak.textContent = "🔇";
      })
      .finally(() => {
        speak.disabled = false;
        speak.style.opacity = ".8";
      });
  });

  es.append(word, speak);

  const en = document.createElement("div");
  en.textContent = t.english;
  Object.assign(en.style, { opacity: ".75", marginTop: "2px" });

  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", gap: "6px", marginTop: "10px" });

  for (const [label, verdict] of [
    ["Knew it", "knew_it"],
    ["Didn't know", "didnt_know"],
  ] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      flex: "1",
      padding: "6px 8px",
      borderRadius: "6px",
      border: "1px solid rgba(255,255,255,.25)",
      background: "transparent",
      color: "inherit",
      font: "inherit",
      fontSize: "13px",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener("click", () => {
      handlers.onVerdict(t, verdict);
      hide();
    });
    row.appendChild(btn);
  }

  el.append(es, en, row);
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

function hide(): void {
  clearTimeout(hoverTimer);
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
    hoverTimer = setTimeout(() => {
      card ??= buildCard();
      render(card, t, handlers);
      place(card, el);
      // The 500 ms rule has been met: this is a real hover.
      if (!counted.has(t.lemma)) {
        counted.add(t.lemma);
        handlers.onHover(t);
      }
    }, HOVER_DELAY_MS);
  });

  document.addEventListener("mouseout", (ev) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>(`[${markAttr}]`);
    if (!el) return;
    clearTimeout(hoverTimer);
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
