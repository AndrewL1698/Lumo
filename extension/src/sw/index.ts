// Parrot service worker.
// The service worker does ALL network calls (content-script fetches would hit the host page's
// CORS and expose the token) and holds the pairing token in chrome.storage.local.
// TODO(naren): pairing (POST /api/pair), event queue + batched flush with retry, /api/candidates
// cache, /api/translate batching, /api/tts. See docs/architecture.md §6.

import type { Settings } from "@parrot/shared";
import type { Message, ResponseMap } from "../messages";

/** Shape of chrome.storage.local. */
interface StoredState {
  pairingToken?: string;
  enabledOrigins?: string[];
  settings?: Settings;
}

// Placeholder until settings come from GET /api/settings. TODO(naren): fetch + cache settings.
const DEFAULT_SETTINGS: Settings = {
  level: "beginner",
  intensity: "normal",
  perPageCap: 25,
  allowlist: [],
  pausedSites: [],
  useReadingInLessons: true,
};

async function readState(): Promise<StoredState> {
  return (await chrome.storage.local.get(["pairingToken", "enabledOrigins", "settings"])) as StoredState;
}

/** "https://www.bbc.com" -> "parrot-https___www_bbc_com" */
function scriptIdFor(origin: string): string {
  return "parrot-" + origin.replace(/[^a-zA-Z0-9]/g, "_");
}

function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function enableSite(rawOrigin: string): Promise<ResponseMap["ENABLE_SITE"]> {
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) return { ok: false, error: "not an http(s) origin" };

  // TODO(naren): hard never-list check before enabling a site (architecture §6)

  const pattern = origin + "/*";
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (!granted) return { ok: false, error: "host permission not granted" };

  try {
    await chrome.scripting.registerContentScripts([
      { id: scriptIdFor(origin), matches: [pattern], js: ["content.js"], runAt: "document_idle" },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate/i.test(msg)) return { ok: false, error: msg };
  }

  const { enabledOrigins = [] } = await readState();
  if (!enabledOrigins.includes(origin)) {
    await chrome.storage.local.set({ enabledOrigins: [...enabledOrigins, origin] });
  }
  return { ok: true };
}

async function handle(message: Message): Promise<ResponseMap[Message["type"]]> {
  switch (message.type) {
    case "PING":
      return { ok: true, from: "sw" };
    case "GET_STATUS": {
      const { pairingToken, enabledOrigins = [] } = await readState();
      return { paired: Boolean(pairingToken), enabledOrigins };
    }
    case "ENABLE_SITE":
      return enableSite(message.origin);
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err: unknown) => {
      console.error("[parrot] message handler failed", message, err);
      sendResponse(undefined);
    });
  return true; // keep the channel open for the async reply
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-parrot") {
    // TODO(naren): flip the main toggle (settings.intensity off <-> previous) and notify tabs.
    console.log("[parrot] toggle command", { intensity: DEFAULT_SETTINGS.intensity });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[parrot] service worker installed");
});
