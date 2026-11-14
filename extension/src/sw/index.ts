// Parrot service worker.
// The service worker does ALL network calls (content-script fetches would hit the host page's
// CORS and expose the token) and holds the pairing token in chrome.storage.local.
// TODO(naren): 3.1 /api/tts for the hover card's speaker button, cached by lemma.

import {
  CandidatesResponse,
  EventsResponse,
  PairResponse,
  TranslateResponse,
  type ExtensionEvent,
  type Settings,
} from "@parrot/shared";
import type { Message, ResponseMap } from "../messages";
import { neverListReason } from "../neverlist";

// HACK(demo): the web app runs on localhost for the demo. manifest host_permissions matches.
const API_BASE = "http://localhost:3000";

/** Sent until pairing succeeds, so the server-side check can be switched on at any time. */
const FALLBACK_TOKEN = "demo-extension-token";

/** Flush on either trigger, whichever comes first (brief 2.4). */
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT_QUEUED = 20;

/**
 * Rare, high-value events that must not sit in the queue. MV3 parks an idle service worker
 * within seconds, and a pending setTimeout dies with it — which is why `reading` (sent while
 * the worker is busy with page load) was arriving and `hover` (sent later, in a quiet moment)
 * was not. These are flushed immediately, and the flush is awaited so the open message port
 * keeps the worker alive until the POST actually lands.
 */
const FLUSH_NOW: ReadonlySet<ExtensionEvent["type"]> = new Set([
  "hover",
  "knew_it",
  "didnt_know",
  "quiz_pass",
  "quiz_fail",
]);

/** /api/candidates is stable for a while; cache so each page load is not a round trip. */
const CANDIDATES_TTL_MS = 60_000;

/** Shape of chrome.storage.local. */
interface StoredState {
  pairingToken?: string;
  enabledOrigins?: string[];
  settings?: Settings;
  /** Events waiting to be flushed. Kept on disk: MV3 kills idle service workers. */
  eventQueue?: ExtensionEvent[];
}

// Placeholder until settings come from GET /api/settings. TODO(naren): 3.3 fetch + cache settings.
const DEFAULT_SETTINGS: Settings = {
  level: "beginner",
  intensity: "normal",
  perPageCap: 25,
  allowlist: [],
  pausedSites: [],
  useReadingInLessons: true,
};

async function readState(): Promise<StoredState> {
  return (await chrome.storage.local.get([
    "pairingToken",
    "enabledOrigins",
    "settings",
    "eventQueue",
  ])) as StoredState;
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

/** The one place a network call happens. Always carries a bearer token. */
async function api(path: string, init?: RequestInit): Promise<Response> {
  const { pairingToken } = await readState();
  return fetch(API_BASE + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${pairingToken ?? FALLBACK_TOKEN}`,
      ...init?.headers,
    },
  });
}

async function pair(code: string): Promise<ResponseMap["PAIR"]> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "code must be 6 digits" };
  try {
    const res = await api("/api/pair", { method: "POST", body: JSON.stringify({ code }) });
    if (res.status === 401) return { ok: false, error: "that code was not accepted" };
    if (!res.ok) return { ok: false, error: `server returned ${res.status}` };
    const parsed = PairResponse.safeParse(await res.json());
    if (!parsed.success) return { ok: false, error: "unexpected response from server" };
    await chrome.storage.local.set({ pairingToken: parsed.data.token });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not reach Parrot" };
  }
}

async function enableSite(rawOrigin: string): Promise<ResponseMap["ENABLE_SITE"]> {
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) return { ok: false, error: "not an http(s) origin" };

  // Hard never-list, enforced even though the user just granted the permission (specs §5.1).
  const blocked = neverListReason(origin);
  if (blocked) return { ok: false, error: `Parrot never runs here (${blocked})` };

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

let candidatesCache: { at: number; data: CandidatesResponse } | null = null;

async function getCandidates(): Promise<ResponseMap["GET_CANDIDATES"]> {
  if (candidatesCache && Date.now() - candidatesCache.at < CANDIDATES_TTL_MS) {
    return candidatesCache.data;
  }
  try {
    const res = await api("/api/candidates");
    if (!res.ok) return null;
    const parsed = CandidatesResponse.safeParse(await res.json());
    if (!parsed.success) return null;
    candidatesCache = { at: Date.now(), data: parsed.data };
    return parsed.data;
  } catch {
    // Degrade quietly: the page just makes no swaps. Never surface an error on the page.
    return null;
  }
}

async function translate(
  articleKey: string,
  items: { sentence: string; lemma: string; englishMatch: string }[],
): Promise<ResponseMap["TRANSLATE"]> {
  if (!items.length) return { items: [] };
  try {
    const res = await api("/api/translate", {
      method: "POST",
      body: JSON.stringify({ articleKey, items }),
    });
    if (!res.ok) return null;
    const parsed = TranslateResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- text to speech

/**
 * Cached by lemma, so clicking the speaker twice on the same word is one network call
 * (brief 3.1). Hover audio is short and the set of swapped words per page is capped at 25,
 * so an unbounded map is fine for a session.
 */
const ttsCache = new Map<string, string>();

/** Service workers have no FileReader, so base64 by hand. Chunked to keep the stack shallow. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function tts(text: string, lemma: string): Promise<ResponseMap["TTS"]> {
  const cached = ttsCache.get(lemma);
  if (cached) return { dataUrl: cached };
  try {
    const res = await api("/api/tts", { method: "POST", body: JSON.stringify({ text, lemma }) });
    // 502 means "tts unavailable": the card simply shows no audio.
    if (!res.ok) return null;
    const dataUrl = `data:audio/mpeg;base64,${toBase64(await res.arrayBuffer())}`;
    ttsCache.set(lemma, dataUrl);
    return { dataUrl };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- event queue

let flushTimer: ReturnType<typeof setTimeout> | undefined;

async function queueEvents(events: ExtensionEvent[]): Promise<ResponseMap["QUEUE_EVENTS"]> {
  const { eventQueue = [] } = await readState();
  // Dedupe by id here too, so a content-script retry never double-queues.
  const byId = new Map(eventQueue.map((e) => [e.id, e]));
  for (const e of events) byId.set(e.id, e);
  const merged = [...byId.values()];
  await chrome.storage.local.set({ eventQueue: merged });

  if (events.some((e) => FLUSH_NOW.has(e.type))) {
    await flush(); // awaited on purpose: see FLUSH_NOW
  } else if (merged.length >= FLUSH_AT_QUEUED) {
    void flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
  }
  return { queued: merged.length };
}

async function flush(): Promise<void> {
  clearTimeout(flushTimer);
  flushTimer = undefined;

  const { eventQueue = [] } = await readState();
  if (!eventQueue.length) return;

  try {
    const res = await api("/api/events", {
      method: "POST",
      body: JSON.stringify({ events: eventQueue }),
    });
    if (!res.ok) throw new Error(`events returned ${res.status}`);
    EventsResponse.safeParse(await res.json());
    // Only drop what we actually sent; anything queued meanwhile survives.
    const sent = new Set(eventQueue.map((e) => e.id));
    const { eventQueue: latest = [] } = await readState();
    await chrome.storage.local.set({ eventQueue: latest.filter((e) => !sent.has(e.id)) });
  } catch (err) {
    // Keep the queue and retry. Ids are client-made uuids, so resending is idempotent.
    console.warn("[parrot] event flush failed, will retry", err);
    flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS * 2);
  }
}

// ---------------------------------------------------------------- plumbing

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
    case "PAIR":
      return pair(message.code);
    case "GET_CANDIDATES":
      return getCandidates();
    case "TRANSLATE":
      return translate(message.articleKey, message.items);
    case "QUEUE_EVENTS":
      return queueEvents(message.events);
    case "TTS":
      return tts(message.text, message.lemma);
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
    // TODO(naren): 3.3 flip the main toggle (settings.intensity off <-> previous) and notify tabs.
    console.log("[parrot] toggle command", { intensity: DEFAULT_SETTINGS.intensity });
  }
});

chrome.runtime.onStartup.addListener(() => void flush()); // anything stranded by a restart
chrome.runtime.onInstalled.addListener(() => {
  console.log("[parrot] service worker installed");
});
