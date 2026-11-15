// Parrot popup: worker health, enable current site (permission prompt), pairing stub.

import { send } from "../messages";
import { READING_SITES } from "@parrot/shared";
import { DEMO_RATE, IMMERSION_JUMPS, IMMERSION_RATES, budgetFor } from "../swapBudget";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing from popup.html`);
  return node as T;
}

const workerEl = el("worker");
const pairedEl = el("paired");
const originEl = el("origin");
const tryBtn = el<HTMLButtonElement>("try");
const enableBtn = el<HTMLButtonElement>("enable");
const nudgeEl = el("nudge");
const nudgeText = el("nudge-text");
const turnOnBtn = el<HTMLButtonElement>("turn-on");
const enableResult = el("enable-result");
const codeInput = el<HTMLInputElement>("code");
const pairBtn = el<HTMLButtonElement>("pair");
const pairResult = el("pair-result");
const immLine = el("imm-line");
const immRates = el("imm-rates");
const immJumps = el("imm-jumps");
const immReset = el<HTMLButtonElement>("imm-reset");
const immNote = el("imm-note");

let origin: string | null = null;
/** Needed to inject into the right tab for "Try on this page". */
let activeTabId: number | null = null;
/** Full page URL, so the worker can apply the never-list's path rules. Stays inside the extension. */
let activeUrl: string | null = null;

async function init(): Promise<void> {
  const ping = await send({ type: "PING" }).catch(() => null);
  workerEl.textContent = ping?.ok ? "worker: ok" : "worker: no reply";

  const status = await send({ type: "GET_STATUS" }).catch(() => null);

  // activeTab grants the tab URL while the popup is open.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  try {
    const url = new URL(tab?.url ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") {
      origin = url.origin;
      activeUrl = url.href;
    }
  } catch {
    origin = null;
    activeUrl = null;
  }

  pairedEl.textContent = `paired: ${status ? (status.paired ? "yes" : "no") : "?"}`;
  originEl.textContent = origin ?? "(not a web page)";
  enableBtn.disabled = origin === null;
  tryBtn.disabled = origin === null || activeTabId === null;
  const enabled = Boolean(origin && status?.enabledOrigins.includes(origin));
  if (enabled) {
    enableResult.textContent = "already enabled";
    tryBtn.hidden = true; // nothing to try: it already runs here on every visit
  }

  // New-site nudge (D-017): on a site Luci reads well but isn't on for yet, offer one click
  // instead of the plain Enable button. Same flow underneath, friendlier words.
  const site = origin ? READING_SITES.find((s) => s.origin === origin) : undefined;
  if (site && !enabled) {
    nudgeText.textContent = `Luci reads well on ${site.name}. Turn it on here?`;
    nudgeEl.hidden = false;
    enableBtn.hidden = true; // the card replaces it; sites off the list keep the plain button
  }
}

/** Exactly what Enable does; `permissions.request` must stay inside the click (user gesture). */
function turnOnHere(button: HTMLButtonElement, done: string): void {
  if (!origin) return;
  const target = origin;
  chrome.permissions
    .request({ origins: [target + "/*"] })
    .then(async (granted) => {
      if (!granted) {
        enableResult.textContent = "permission denied";
        return;
      }
      const res = await send({ type: "ENABLE_SITE", origin: target });
      if (res.ok) {
        button.disabled = true;
        nudgeEl.hidden = true;
        enableResult.textContent = done;
      } else {
        enableResult.textContent = `failed: ${res.error ?? "unknown error"}`;
      }
    })
    .catch((err: unknown) => {
      enableResult.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
    });
}

turnOnBtn.addEventListener("click", () => turnOnHere(turnOnBtn, "On. Reload the page to start."));

// "Try on this page": no prompt, this visit only. Opening the popup already granted activeTab for
// this tab, so the worker can inject once; the grant dies on navigation and so does the trial.
tryBtn.addEventListener("click", () => {
  if (!origin || activeTabId === null) return;
  tryBtn.disabled = true;
  enableResult.textContent = "starting…";
  send({ type: "TRY_HERE", tabId: activeTabId, origin, url: activeUrl ?? origin })
    .then((res) => {
      if (res.ok) {
        window.close(); // get out of the way so the swaps are visible
        return;
      }
      enableResult.textContent =
        res.reason === "never-list"
          ? "Luci never runs on email, banking, school or login pages."
          : (res.reason ?? "could not start Luci here");
      tryBtn.disabled = false;
    })
    .catch((err: unknown) => {
      enableResult.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
      tryBtn.disabled = false;
    });
});

enableBtn.addEventListener("click", () => {
  if (!origin) return;
  const target = origin;
  // permissions.request must be called synchronously inside the click handler (user gesture).
  chrome.permissions
    .request({ origins: [target + "/*"] })
    .then(async (granted) => {
      if (!granted) {
        enableResult.textContent = "permission denied";
        return;
      }
      const res = await send({ type: "ENABLE_SITE", origin: target });
      enableResult.textContent = res.ok
        ? "enabled. Reload the page to start."
        : `failed: ${res.error ?? "unknown error"}`;
    })
    .catch((err: unknown) => {
      enableResult.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
    });
});

pairBtn.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    pairResult.textContent = "enter the 6-digit code from the web app";
    return;
  }
  pairBtn.disabled = true;
  pairResult.textContent = "pairing…";
  send({ type: "PAIR", code })
    .then((res) => {
      pairResult.textContent = res.ok ? "paired" : (res.error ?? "pairing failed");
      if (res.ok) pairedEl.textContent = "paired: yes";
    })
    .catch((err: unknown) => {
      pairResult.textContent = err instanceof Error ? err.message : "pairing failed";
    })
    .finally(() => {
      pairBtn.disabled = false;
    });
});

// ---------------------------------------------------------------- immersion (D-019: one number)

async function reloadActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
}

let immersion = { percent: 0, rate: 1, points: 0, solid: 0 };

async function initImmersion(): Promise<void> {
  const s = await send({ type: "GET_SETTINGS" }).catch(() => null);
  if (s?.immersion) immersion = s.immersion;
  renderImmersion();
}

const rateButtons = IMMERSION_RATES.map((rate) => {
  const b = document.createElement("button");
  b.textContent = rate === DEMO_RATE ? "Demo" : `${rate}×`;
  b.addEventListener("click", () => void setImmersion({ rate }));
  immRates.append(b);
  return { rate, b };
});

for (const percent of IMMERSION_JUMPS) {
  const b = document.createElement("button");
  b.textContent = `${percent}%`;
  b.addEventListener("click", () => void setImmersion({ percent }));
  immJumps.append(b);
}

immReset.addEventListener("click", () => void setImmersion({ reset: true }));

function renderImmersion(): void {
  const { percent, solid } = immersion;
  immLine.textContent =
    `Immersion ${percent}% · about ${budgetFor(percent)} new Spanish words, ` +
    `plus the ${solid} word${solid === 1 ? "" : "s"} you know, always in Spanish.`;
  for (const { rate, b } of rateButtons) b.classList.toggle("active", rate === immersion.rate);
  immNote.textContent = "Grows as you prove words: Knew it, and words you use correctly with Luci.";
}

async function setImmersion(change: { rate?: number; percent?: number; reset?: boolean }): Promise<void> {
  try {
    await send({ type: "SET_IMMERSION", ...change });
    const s = await send({ type: "GET_SETTINGS" });
    if (s?.immersion) immersion = s.immersion;
    renderImmersion();
    await reloadActiveTab();
  } catch {
    immNote.textContent = "not saved: Luci isn't reachable";
  }
}

void init();
void initImmersion();
