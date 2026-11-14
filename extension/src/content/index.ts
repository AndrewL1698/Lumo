// Parrot content script. Injected only on origins the user enabled from the popup
// (registered at runtime via chrome.scripting.registerContentScripts). No network calls here:
// everything goes through the service worker.
//
// Phase 1.1: hard-coded swaps. The pipeline below (walk -> match -> space -> swap) is the one
// from docs/architecture.md §6; Phase 2.2 replaces SWAPS with wordindex.json lookups plus a
// /api/translate batch through the service worker.
//
// TODO(naren): 2.2 tokenize + look up English forms in wordindex.json (Karthik generates it).
// TODO(naren): 2.2 score candidates via the SW's cached /api/candidates (specs §5.2, 70/30 mix).
// TODO(naren): 2.2 send chosen sentences to the SW for ONE /api/translate batch; swap only after.
// TODO(naren): 2.3 hover card (Spanish + article, meaning, TTS, Knew it / Didn't know, 500 ms).

import { neverListReason, neverListPageReason } from "../neverlist";

/** Hard-coded English -> Spanish (with article, specs §5.2.8). Replaced by real data in 2.2. */
const SWAPS: Readonly<Record<string, string>> = {
  "the house": "la casa",
  "the home": "la casa",
  "the city": "la ciudad",
  "the country": "el país",
  "the world": "el mundo",
  "the government": "el gobierno",
  "the president": "el presidente",
  "the state": "el estado",
  "the law": "la ley",
  "the money": "el dinero",
  "the price": "el precio",
  "the company": "la empresa",
  "the work": "el trabajo",
  "the job": "el trabajo",
  "the school": "la escuela",
  "the family": "la familia",
  "the people": "la gente",
  "the water": "el agua",
  "the food": "la comida",
  "the health": "la salud",
  "the street": "la calle",
  "the week": "la semana",
  "the year": "el año",
  "the day": "el día",
  "the night": "la noche",
  "the problem": "el problema",
  "the news": "las noticias",
};

const PER_PAGE_CAP = 25;
/** Words that must sit between two swaps, so they are never adjacent (specs §5.2.7). */
const MIN_WORD_GAP = 12;
const DEBOUNCE_MS = 300;

const SKIP_SELECTOR =
  "a, button, input, textarea, select, code, pre, script, style, [contenteditable], form, [data-parrot]";

const MARK_ATTR = "data-parrot";
const ORIGINAL_ATTR = "data-parrot-en";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest phrases first so "the house" wins over a future "house".
const PHRASE_RE = new RegExp(
  `\\b(${Object.keys(SWAPS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})\\b`,
  "gi",
);

let swapCount = 0;
/** Global word index of the last applied swap, so swaps stay spaced across nodes. */
let lastSwapWordIndex = -Infinity;
let wordsWalked = 0;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Index of the sentence `offset` falls in, within one text node. */
function sentenceIndexAt(text: string, offset: number): number {
  let index = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if ((text[i] === "." || text[i] === "!" || text[i] === "?") && /\s/.test(text[i + 1] ?? " ")) {
      index++;
    }
  }
  return index;
}

/**
 * Every phrase is "the <noun>", so a capital on the noun means a proper name:
 * "Industrial Workers of the World" must not become "...of el mundo". A capital on the
 * leading "The" is just sentence case and is fine.
 */
function isProperNoun(match: string): boolean {
  return match
    .split(/\s+/)
    .slice(1)
    .some((word) => /^[A-Z]/.test(word));
}

function matchCase(original: string, replacement: string): string {
  const first = original[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function isVisible(element: Element): boolean {
  return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const text = node.nodeValue;
      if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;

      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

/** Replace one match inside a single text node. Never spans elements (architecture §6.6). */
function applySwap(node: Text, start: number, end: number, spanish: string): void {
  const english = node.nodeValue!.slice(start, end);
  const tail = node.splitText(start);
  tail.nodeValue = tail.nodeValue!.slice(end - start);

  const span = document.createElement("span");
  span.setAttribute(MARK_ATTR, "");
  span.setAttribute(ORIGINAL_ATTR, english);
  span.textContent = matchCase(english, spanish);
  node.parentNode!.insertBefore(span, tail);
}

function processNode(node: Text): void {
  const text = node.nodeValue;
  if (!text) return;

  const nodeWordStart = wordsWalked;
  wordsWalked += countWords(text);
  if (swapCount >= PER_PAGE_CAP) return;

  PHRASE_RE.lastIndex = 0;
  const usedSentences = new Set<number>();

  // One swap per text node keeps the offsets valid after the DOM split; re-walking on the next
  // mutation tick picks up anything else worth swapping.
  let match: RegExpExecArray | null;
  while ((match = PHRASE_RE.exec(text))) {
    if (isProperNoun(match[0])) continue;

    const sentence = sentenceIndexAt(text, match.index);
    if (usedSentences.has(sentence)) continue;

    const wordIndex = nodeWordStart + countWords(text.slice(0, match.index));
    if (wordIndex - lastSwapWordIndex < MIN_WORD_GAP) continue;

    const spanish = SWAPS[match[0].toLowerCase()];
    if (!spanish) continue;

    applySwap(node, match.index, match.index + match[0].length, spanish);
    usedSentences.add(sentence);
    lastSwapWordIndex = wordIndex;
    swapCount++;
    return;
  }
}

function sweep(root: Node): void {
  if (swapCount >= PER_PAGE_CAP) return;
  for (const node of collectTextNodes(root)) {
    if (swapCount >= PER_PAGE_CAP) break;
    processNode(node);
  }
}

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `[${MARK_ATTR}]{border-bottom:1px dotted currentColor;cursor:help}`;
  document.head.appendChild(style);
}

let timer: number | undefined;
function watchForNewText(): void {
  const observer = new MutationObserver((records) => {
    if (swapCount >= PER_PAGE_CAP) {
      observer.disconnect();
      return;
    }
    const roots = records
      .flatMap((r) => [...r.addedNodes])
      .filter((n) => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE);
    if (!roots.length) return;

    clearTimeout(timer);
    timer = setTimeout(() => {
      // SPA navigation can land on a never-listed URL after load.
      if (neverListReason(location.href)) {
        observer.disconnect();
        return;
      }
      for (const root of roots) {
        if (root.isConnected) sweep(root);
      }
    }, DEBOUNCE_MS) as unknown as number;
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function main(): void {
  const blocked = neverListReason(location.href) ?? neverListPageReason(document);
  if (blocked) {
    console.log("[parrot] never-list: not touching this page —", blocked);
    return;
  }

  injectStyle();
  // Yield first so the page finishes painting; swaps must never block page load.
  requestIdleCallback(() => {
    sweep(document.body);
    console.log(`[parrot] ${swapCount} swap(s) on`, location.hostname);
    watchForNewText();
  });
}

main();
