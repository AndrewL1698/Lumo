// Luci popup: worker health, try / enable on this site, pairing, immersion. Look: popup.html.

import { send } from "../messages";
import "./firefly"; // visual only: the wandering firefly
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
const enableResult = el("enable-result");
const codeInput = el<HTMLInputElement>("code");
const pairBtn = el<HTMLButtonElement>("pair");
const pairResult = el("pair-result");
const immLine = el("imm-line");
const immRates = el("imm-rates");
const immJumps = el("imm-jumps");
const immReset = el<HTMLButtonElement>("imm-reset");
const immNote = el("imm-note");
const pairingSection = el("pairing");

// ---------------------------------------------------------------- display only (Luci look)

/** Paired chip; the pairing card only shows while unpaired (or when the worker can't say). */
function showPaired(paired: boolean | null): void {
  pairedEl.textContent = paired === null ? "Status unknown" : paired ? "✓ Paired" : "Not paired yet";
  pairedEl.className = `chip ${paired === null ? "" : paired ? "ok" : "warn"}`;
  pairingSection.hidden = paired === true;
}

/** The "always on" button's label once the site is on. It stays clickable, exactly as before. */
function showSiteOn(): void {
  enableBtn.textContent = "Always on here ✓";
  enableBtn.classList.add("is-on");
}

let origin: string | null = null;
/** Needed to inject into the right tab for "Try on this page". */
let activeTabId: number | null = null;
/** Full page URL, so the worker can apply the never-list's path rules. Stays inside the extension. */
let activeUrl: string | null = null;

async function init(): Promise<void> {
  const ping = await send({ type: "PING" }).catch(() => null);
  workerEl.hidden = Boolean(ping?.ok);
  workerEl.textContent = "Luci isn't responding";

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

  showPaired(status ? status.paired : null);
  originEl.textContent = origin ? new URL(origin).host : "Not a web page";
  enableBtn.disabled = origin === null;
  tryBtn.disabled = origin === null || activeTabId === null;
  if (origin && status?.enabledOrigins.includes(origin)) {
    enableResult.textContent = "Luci is on here on every visit.";
    showSiteOn();
    tryBtn.hidden = true; // nothing to try: it already runs here on every visit
  }
}

// "Try on this page": no prompt, this visit only. Opening the popup already granted activeTab for
// this tab, so the worker can inject once; the grant dies on navigation and so does the trial.
tryBtn.addEventListener("click", () => {
  if (!origin || activeTabId === null) return;
  tryBtn.disabled = true;
  enableResult.textContent = "Starting…";
  send({ type: "TRY_HERE", tabId: activeTabId, origin, url: activeUrl ?? origin })
    .then((res) => {
      if (res.ok) {
        window.close(); // get out of the way so the swaps are visible
        return;
      }
      enableResult.textContent =
        res.reason === "never-list"
          ? "Luci never runs on email, banking, school or login pages."
          : (res.reason ?? "Couldn't start Luci here.");
      tryBtn.disabled = false;
    })
    .catch((err: unknown) => {
      enableResult.textContent = `Couldn't start Luci: ${err instanceof Error ? err.message : String(err)}`;
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
        enableResult.textContent = "Chrome didn't allow it, so Luci stays off here.";
        return;
      }
      const res = await send({ type: "ENABLE_SITE", origin: target });
      enableResult.textContent = res.ok
        ? "Turned on. Reload the page to see Spanish words."
        : `Couldn't turn on: ${res.error ?? "unknown error"}`;
      if (res.ok) showSiteOn();
    })
    .catch((err: unknown) => {
      enableResult.textContent = `Couldn't turn on: ${err instanceof Error ? err.message : String(err)}`;
    });
});

pairBtn.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    pairResult.textContent = "Enter the 6-digit code from Luci's setup page.";
    return;
  }
  pairBtn.disabled = true;
  pairResult.textContent = "Pairing…";
  send({ type: "PAIR", code })
    .then((res) => {
      pairResult.textContent = res.ok ? "Paired" : (res.error ?? "Pairing failed");
      if (res.ok) showPaired(true);
    })
    .catch((err: unknown) => {
      pairResult.textContent = err instanceof Error ? err.message : "Pairing failed";
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
  for (const { rate, b } of rateButtons) {
    b.classList.toggle("active", rate === immersion.rate);
    b.setAttribute("aria-pressed", String(rate === immersion.rate)); // screen readers hear which speed is on
  }
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
