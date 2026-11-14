// Typed messages between content script / popup and the service worker.
// Add a message: extend `Message` and add its reply to `ResponseMap`.

export type Message =
  | { type: "PING" }
  | { type: "GET_STATUS" }
  | { type: "ENABLE_SITE"; origin: string };

export interface ResponseMap {
  PING: { ok: true; from: "sw" };
  GET_STATUS: { paired: boolean; enabledOrigins: string[] };
  ENABLE_SITE: { ok: boolean; error?: string };
}

export type MessageType = Message["type"];
export type ResponseFor<T extends MessageType> = ResponseMap[T];

/** Send a message to the service worker and get its typed reply. */
export function send<T extends MessageType>(
  message: Extract<Message, { type: T }>,
): Promise<ResponseFor<T>> {
  return chrome.runtime.sendMessage<Extract<Message, { type: T }>, ResponseFor<T>>(message);
}
