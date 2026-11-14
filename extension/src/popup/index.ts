// Parrot popup: worker health, enable current site (permission prompt), pairing stub.

import { send } from "../messages";

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

void init();
