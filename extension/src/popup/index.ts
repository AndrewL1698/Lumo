// Parrot popup: worker health, enable current site (permission prompt), pairing stub.

import { send } from "../messages";
import { IMMERSION_JUMPS, IMMERSION_RATES, MAX_SWAPS, autoSwaps, solidCount, stepFor } from "../swapBudget";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing from popup.html`);
  return node as T;
}

const workerEl = el("worker");
const pairedEl = el("paired");
const originEl = el("origin");
const enableBtn = el<HTMLButtonElement>("enable");
const enableResult = el("enable-result");
const codeInput = el<HTMLInputElement>("code");
const pairBtn = el<HTMLButtonElement>("pair");
const pairResult = el("pair-result");
const amountInput = el<HTMLInputElement>("amount");
const amountValue = el("amount-value");
const autoBox = el<HTMLInputElement>("auto");
const amountNote = el("amount-note");
const immLine = el("imm-line");
const immRates = el("imm-rates");
const immJumps = el("imm-jumps");
const immReset = el<HTMLButtonElement>("imm-reset");
const immNote = el("imm-note");

let origin: string | null = null;

async function init(): Promise<void> {
  const ping = await send({ type: "PING" }).catch(() => null);
  workerEl.textContent = ping?.ok ? "worker: ok" : "worker: no reply";

  const status = await send({ type: "GET_STATUS" }).catch(() => null);

  // activeTab grants the tab URL while the popup is open.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") origin = url.origin;
  } catch {
    origin = null;
  }

  pairedEl.textContent = `paired: ${status ? (status.paired ? "yes" : "no") : "?"}`;
  originEl.textContent = origin ?? "(not a web page)";
  enableBtn.disabled = origin === null;
  if (origin && status?.enabledOrigins.includes(origin)) {
    enableResult.textContent = "already enabled";
  }
}

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

// ---------------------------------------------------------------- swap amount (Karthik, D-005/D-006)

let manualCap = MAX_SWAPS;
let autoValue = MAX_SWAPS;
let solid = 0;

function renderAmount(): void {
  const auto = autoBox.checked;
  const value = auto ? autoValue : manualCap;
  amountInput.value = String(value);
  amountInput.disabled = auto;
  amountValue.textContent = String(value);
  amountNote.textContent = auto
    ? `${solid} word${solid === 1 ? "" : "s"} you know solidly → ${autoValue} swaps. Untick to set it yourself.`
    : "Release the slider to apply. The page reloads.";
}

async function initAmount(): Promise<void> {
  const [s, c] = await Promise.all([
    send({ type: "GET_SETTINGS" }).catch(() => null),
    send({ type: "GET_CANDIDATES" }).catch(() => null),
  ]);
  const candidates = c?.candidates ?? [];
  solid = solidCount(candidates);
  autoValue = autoSwaps(candidates);
  manualCap = s?.settings.perPageCap ?? MAX_SWAPS;
  autoBox.checked = s?.autoGrow ?? true;
  if (s?.immersion) immersion = s.immersion;
  renderAmount();
  renderImmersion();
}

async function reloadActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
}

amountInput.addEventListener("input", () => {
  amountValue.textContent = amountInput.value;
});

amountInput.addEventListener("change", () => {
  manualCap = Number(amountInput.value);
  amountNote.textContent = "saving…";
  send({ type: "SET_SWAP_AMOUNT", perPageCap: manualCap })
    .then(async (res) => {
      if (!res.ok) {
        amountNote.textContent = `not saved: ${res.error ?? "unknown error"}`;
        return;
      }
      renderAmount();
      await reloadActiveTab();
    })
    .catch(() => {
      amountNote.textContent = "not saved: Luci isn't reachable";
    });
});

autoBox.addEventListener("change", () => {
  renderAmount();
  renderImmersion();
  void send({ type: "SET_SWAP_AMOUNT", autoGrow: autoBox.checked })
    .then(() => reloadActiveTab())
    .catch(() => undefined);
});

// ---------------------------------------------------------------- immersion dial (D-018)

let immersion = { points: 0, rate: 1, percent: 0 };

const rateButtons = IMMERSION_RATES.map((rate) => {
  const b = document.createElement("button");
  b.textContent = `${rate}×`;
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
  immLine.textContent = `Immersion ${immersion.percent}% · step ${stepFor(immersion.percent).step}`;
  for (const { rate, b } of rateButtons) b.classList.toggle("active", rate === immersion.rate);
  immNote.textContent = autoBox.checked
    ? "Grows as you hover and answer on the page."
    : "Slider mode: the dial is off. Tap a dial button to switch it back on.";
}

async function setImmersion(change: { rate?: number; percent?: number; reset?: boolean }): Promise<void> {
  try {
    // The page ignores the dial in slider mode, so any dial button switches "Grow automatically" back on.
    if (!autoBox.checked) {
      await send({ type: "SET_SWAP_AMOUNT", autoGrow: true });
      autoBox.checked = true;
      renderAmount();
    }
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
void initAmount();
