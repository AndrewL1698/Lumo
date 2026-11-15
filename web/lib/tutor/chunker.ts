/** Splits a streamed tutor reply into TTS-sized chunks (voice-plan §1.4). Pure: browser and Node. */
import { TUTOR } from "../config";
import type { Chunker } from "./types";

/** TtsRequest allows 500 chars; stay under it. */
const MAX_CHUNK_CHARS = 480;
const TERMINATORS = ".!?…";
const CLOSERS = "\"'»”’)]";
const isSpace = (ch: string) => /\s/.test(ch);
const SPEAKABLE = /[\p{L}\p{N}]/u;

/**
 * Index just past the first complete chunk in `buf`, or -1 if none is decided yet.
 * A boundary is only decided once the whitespace after it has arrived, so the result does not
 * depend on how the text was sliced into deltas.
 */
function findBoundary(buf: string, allowComma: boolean): number {
  let open = 0; // unclosed ¿ / ¡: no comma split inside a question or exclamation
  let i = 0;
  while (i < buf.length) {
    const ch = buf[i];
    if (ch === "¿" || ch === "¡") {
      open++;
    } else if (TERMINATORS.includes(ch)) {
      let j = i;
      while (j < buf.length && TERMINATORS.includes(buf[j])) {
        if ((buf[j] === "?" || buf[j] === "!") && open > 0) open--;
        j++;
      }
      while (j < buf.length && CLOSERS.includes(buf[j])) j++;
      if (j >= buf.length) {
        // Need the next character to decide. Except for the first chunk (it gates the first audio): a
        // sentence ending right at the end of a stream delta would otherwise wait ~300 ms for the next delta.
        // Only after a letter and with no ¿/¡ still open, so "¿¡Qué!?" and "3.5" are never split early.
        return allowComma && open === 0 && /\p{L}/u.test(buf[i - 1] ?? "") ? j : -1;
      }
      if (isSpace(buf[j])) return j;
      i = j;
      continue;
    } else if (ch === "," && allowComma && open === 0 && i + 1 >= TUTOR.firstChunkCommaMinChars) {
      if (i + 1 >= buf.length) return -1;
      if (isSpace(buf[i + 1])) return i + 1;
    }
    i++;
  }
  return -1;
}

export function createChunker(): Chunker {
  let buf = "";
  let first = true;

  const drain = (): string[] => {
    const out: string[] = [];
    for (;;) {
      buf = buf.trimStart();
      let end = findBoundary(buf, first);
      if (end < 0 || end > MAX_CHUNK_CHARS) {
        if (buf.length <= MAX_CHUNK_CHARS) break;
        // Too long with no terminator: split at the last whitespace that keeps the chunk in range.
        end = MAX_CHUNK_CHARS;
        while (end > 0 && !isSpace(buf[end])) end--;
        if (end === 0) end = MAX_CHUNK_CHARS; // one giant "word": hard cut
      }
      const chunk = buf.slice(0, end).trim();
      // A piece with no letter or digit (".." left after an early "Bueno.") has nothing to say; captions
      // come from the text stream, so dropping it from TTS loses nothing on screen.
      if (SPEAKABLE.test(chunk)) out.push(chunk);
      buf = buf.slice(end);
      first = false;
    }
    return out;
  };

  return {
    push(delta) {
      buf += delta;
      return drain();
    },
    flush() {
      const out = drain();
      const rest = buf.trim();
      buf = "";
      if (SPEAKABLE.test(rest)) out.push(rest);
      first = false;
      return out;
    },
  };
}
