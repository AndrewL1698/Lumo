// Typed messages between content script / popup and the service worker.
// Add a message: extend `Message` and add its reply to `ResponseMap`.
//
// The content script never fetches. Everything that touches the network goes through the
// service worker, so the pairing token never enters the page and we are not subject to the
// host page's CORS.

import type { CandidatesResponse, ExtensionEvent, Settings, TranslateItem } from "@parrot/shared";

export type Message =
  | { type: "PING" }
  | { type: "GET_STATUS" }
  | { type: "ENABLE_SITE"; origin: string }
  | { type: "PAIR"; code: string }
  | { type: "GET_CANDIDATES" }
  | {
      type: "TRANSLATE";
      articleKey: string;
      items: { sentence: string; lemma: string; englishMatch: string }[];
    }
  | { type: "QUEUE_EVENTS"; events: ExtensionEvent[] }
  | { type: "TTS"; text: string; lemma: string }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SWAP_AMOUNT"; perPageCap?: number; autoGrow?: boolean };

export interface ResponseMap {
  PING: { ok: true; from: "sw" };
  GET_STATUS: { paired: boolean; enabledOrigins: string[] };
  ENABLE_SITE: { ok: boolean; error?: string };
  PAIR: { ok: boolean; error?: string };
  /** `null` when we have no token yet or the call failed: the page simply makes no swaps. */
  GET_CANDIDATES: CandidatesResponse | null;
  /** One entry per request item, same order. `null` = sense mismatch, don't swap. */
  TRANSLATE: { items: TranslateItem[] } | null;
  QUEUE_EVENTS: { queued: number };
  /**
   * A base64 data URL, because a Blob cannot cross the extension message boundary.
   * `null` when TTS is unavailable: the card just shows no audio rather than an error.
   */
  TTS: { dataUrl: string } | null;
  /** Server settings (cached copy if offline) plus the popup's local "Grow automatically" switch. */
  GET_SETTINGS: { settings: Settings; autoGrow: boolean };
  /** Saves perPageCap to the server (only that field) and/or autoGrow locally. */
  SET_SWAP_AMOUNT: { ok: boolean; error?: string };
}

export type MessageType = Message["type"];
export type ResponseFor<T extends MessageType> = ResponseMap[T];

/** Send a message to the service worker and get its typed reply. */
export function send<T extends MessageType>(
  message: Extract<Message, { type: T }>,
): Promise<ResponseFor<T>> {
  return chrome.runtime.sendMessage<Extract<Message, { type: T }>, ResponseFor<T>>(message);
}
