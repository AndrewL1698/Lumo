# Parrot voice tutor plan

## Context

Andrew owns the whole voice tutor (roadmap "Andrew" rows) and builds it alone, with feature freeze Sun 3:00am. The repo holds only docs, so the Phase 0 scaffold has to happen first. This plan fixes the design for one push-to-talk turn, the contracts, the prompts, the STT verbatim test, and an ordered task list. It prefers the simplest design one person can debug at 4am.

Decisions already made by Andrew: Flash v2.5 for TTS in dev **and** demo; direct Anthropic API, all calls behind `web/lib/claude.ts`, no Bedrock work.

---

## 0. What the docs say (checked today)

ElevenLabs facts were fetched from the live docs. Anthropic facts come from the Claude API reference bundled with Claude Code (cached 2026-11-03), not a live fetch.

| Topic | Finding | Effect on the plan |
|---|---|---|
| Realtime STT endpoint | `wss://api.elevenlabs.io/v1/speech-to-text/realtime`, `model_id=scribe_v2_realtime` (default) or **`scribe_v3_live`** (newer; most guides now use it). [API ref](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime) | Test both models in the STT test; it is one query parameter. |
| Browser auth | `POST /v1/single-use-token/realtime_scribe` → `{ token }`, valid 15 min, consumed on first use; browser passes `?token=`. [Tokens](https://elevenlabs.io/docs/api-reference/tokens/create) | One token per connection. Pre-fetch the next token while the tutor is speaking. |
| Committing | `commit_strategy=manual` is the default. Client sends `{"message_type":"input_audio_chunk","audio_base_64":…,"commit":false,"sample_rate":16000}`; commit is a final chunk with `"commit":true`. Server sends `partial_transcript`, then `committed_transcript`. [Commit strategies](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies) | Push-to-talk = manual commit on release. The docs recommend VAD for mic audio but never mention push-to-talk; manual is supported. |
| Connection limits | Server closes after 15 s without client messages; auto-commit at ~36 s of audio; frequent commits get `commit_throttled`; silence is billed. | **One WebSocket per press**, closed after the committed transcript. Cap a hold at 30 s. |
| Short utterances | Guide says "transcript processing starts after the first 2 seconds of audio". Effect on short clips is not documented. | Measure commit→final latency for 1–2 s clips in the STT test. |
| Verbatim options | `no_verbatim` (default **false**) removes fillers and false starts when on. `transcript_edit` is a separate opt-in LLM edit. No option turns off punctuation or capitals. Nothing in the docs says Scribe corrects grammar. | Leave both off. Only the test can say whether errors survive. |
| Batch STT | `POST /v1/speech-to-text`, multipart, `model_id=scribe_v2`, `language_code`, `no_verbatim`. [Convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) | Fallback path and third test candidate. |
| TTS model | `eleven_flash_v2_5`: ~100 ms, Spanish, works on HTTP `/stream`. **`eleven_turbo_v2_5` is deprecated.** `eleven_v4_turbo` is only documented on a different WebSocket. [Models](https://elevenlabs.io/docs/models) | Flash v2.5 everywhere. `CLAUDE.md`'s "best voice only for the demo" line needs updating. |
| TTS language and accent | `language_code: "es"` enforces Spanish on Flash. Accent comes from the **voice**, not a parameter. | Naren (or anyone free) picks a Latin American voice from the Voice Library: `docs/briefs/naren.md` task 0.3. |
| TTS output | Default `mp3_44100_128`; Creator allows it. No browser recommendation in the docs. | Use the default; Chrome's `decodeAudioData` plays it. |
| TTS WebSocket | `stream-input` with `auto_mode` is the docs' recommendation for LLM output. | Not in the first build. It is the upgrade if the 2 s target is missed. |
| Limits | Creator: 10 concurrent Flash requests, 15 realtime STT. | No problem for one user. |
| Billing | Two pricing pages disagree: one says 121k credits/month with STT at 330 credits/min; the API page says USD billing with included hours. | Budget on the stricter credit model (§9) and have Naren confirm the real balance. |
| Haiku 5.5 JSON | Structured outputs via `output_config.format`; `client.messages.parse()` + `zodOutputFormat()`. Numeric min/max are not enforced by the API. First use of a schema has a one-time compile delay. | Validate ranges in code. Send one warm-up call at session start. |
| Thinking | Haiku 5.5 thinks by default; `thinking: {type:"disabled"}` is allowed at effort `low`. **Sonnet 5.5 rejects `disabled`**; thinking-off is `thinking: {type:"between_tools"}`. | Architecture §10 says only "effort low". Add these settings; they matter for latency. |
| Other | Assistant prefill and `temperature` return 400 on both models. Refusals come back as `stop_reason: "refusal"`. | No prefill, no sampling parameters. Check `stop_reason`. |

---

## 1. Design decisions (the nine questions)

**1. Turn flow: push-to-talk, confirmed.** Hold Space or the button to talk. We capture the mic ourselves (16 kHz mono PCM) rather than using the SDK's mic mode, because that gives one buffer that feeds the realtime socket, the batch fallback and the test recordings. Holds under 300 ms are ignored. Sequence in §2.

**2. Lane race: (a) start the reply immediately; the correction feeds the next turn.** Waiting for Haiku first would put the voice at roughly 2.4 s. Sonnet sees the raw utterance and recasts on its own; Haiku's result drives the screen, the learner model, the next turn's directive and the recap.

**3. Spoken-correction policy: a small deterministic function on the server**, `nextDirective(state) → TurnDirective`, in `web/lib/tutor/policy.ts`.
- Input: turn index, turn of the last explicit spoken correction, error counts keyed by `type + lemma`, the previous turn's validated errors, target words and which were used.
- Output: `{ correction: "none" | { span, correction, reason }, steerLemma: string | null, isOpener: boolean }`.
- Rules, in order: (1) an explicit correction is allowed only if ≥3 turns since the last one **and** an error key has occurred ≥2 times; pick the most frequent. (2) Otherwise `none`; Sonnet may still recast silently. (3) From turn 2, on every other turn, set `steerLemma` to the next unused target word.
- Clarifying ("¿Quieres decir…?") stays prompt-only, because only Sonnet sees the current utterance in time. It does not spend the budget.

**4. TTS chunking, audio queue, barge-in.** `/api/tutor/reply` streams plain text; the **client** splits it and calls `/api/tts` per chunk, as architecture §9 already says. Each piece is then testable with `curl`.
- Chunker: split at `. ! ? …` followed by a space or end of stream. The first chunk may also split at a comma once it has ≥25 characters, so audio starts sooner.
- Audio queue: TTS requests fire as chunks appear (in parallel), each full MP3 is decoded with `decodeAudioData` and scheduled in order on one `AudioContext`. Captions render from the text stream regardless of audio.
- Barge-in: pressing talk while the tutor speaks aborts the reply fetch and all TTS fetches, stops every scheduled source, and bumps a turn counter so late results are dropped. History keeps only the sentences whose audio had started. The correction request for the earlier utterance is not cancelled.

**5. Session context.** `/api/tutor/context` picks **targets in code**: up to 3 most recently hovered words (24 h) plus up to 2 due words, no cognates, max 5. Payload in §4. The opener is a normal `/reply` call with no utterance and `isOpener: true`. Steering comes from the prompt rule "ask questions whose natural answer needs the word; never ask the learner to use a word; avoid saying an unused target word yourself", plus `steerLemma`.

**6. Validating `target_words_used` before `applyEvent`.** A word flips to `known` only if all of these hold:
- the lemma is one of this session's targets;
- Haiku returned the exact spoken `form` and it is a substring of the raw transcript;
- `correct` is true and no validated error with confidence ≥0.5 overlaps that form or names that lemma;
- the utterance has at least 4 words (a bare echo of the tutor does not count);
- it has not already been credited this session.
A wrong use sends `spoken_incorrect` only when the overlapping error has confidence ≥0.7. Updates are applied inside `/api/tutor/correct` and returned as `wordUpdates`, which drives the toast.

**7. Failure modes.**
| Failure | What happens |
|---|---|
| Realtime STT errors, or no committed transcript 1.5 s after release | Send the buffered clip to `/api/stt-batch`. If that fails: "Didn't catch that, try again" plus a text box. |
| Empty transcript | Turn ignored, no lanes fired. |
| Haiku slow (>4 s) or invalid | Screen shows no corrections for that turn; logged. Conversation continues. |
| Sonnet: no first token in 4 s | Abort; play a pre-cached canned line ("Perdón, ¿puedes repetirlo?"). |
| TTS fails for a chunk | Captions only for that chunk. After 2 failures in a row, switch to the browser's built-in `es-MX` voice for the session. |
| Database unreachable | `/context` returns a fixture context; corrections still show; toast is skipped. |
| Server restart mid-session | Client resends history; policy state restarts empty. |

**8. Latency instrumentation.** The client records `performance.now()` at: press, release, STT final, correction shown, reply first token, first chunk ready, first TTS bytes, audio start, plus the STT path used. It posts each turn to `/api/tutor/metrics`, which appends a line to `eval/latency/turns.jsonl`. `eval/latency/summarize.ts` prints median and p90 for release→correction and release→audio. `?debug=1` shows the last turn's numbers on the page.

**9. Credit budget** (strict model: STT 330 credits/min, Flash up to 1 credit/char; estimates, not measurements).
| Use | Estimate |
|---|---|
| One 5-minute session (≈2 min held, ≈1,500 tutor characters) | 1,400–2,200 credits |
| 30 rehearsals of the 40 s tutor segment | 11k–17k |
| 30 full 5-minute sessions (if we did that instead) | 42k–65k |
| STT test (15 sentences, 2 passes, 3 configs, plus TTS reads) | ~4k |
| Unrestricted dev (≈150 voiced turns) | ~30k |
Savings: a typed-input box that skips STT; `TTS_MODE=browser` in dev (built-in voice, zero credits); disk cache of TTS audio by hash of voice + model + text; saved transcripts as fixtures to replay the lanes. Real ElevenLabs audio only for latency runs and rehearsals.

---

## 2. One turn, with the latency budget

```
Learner      Browser (useTutorSession)            Server (Next routes)        ElevenLabs / Claude
  │ press      │ stop tutor audio (barge-in)        │                            │
  │───────────►│ open WS with pre-fetched token ───────────────────────────────►│ Scribe realtime
  │ speaks     │ PCM chunks (buffered until open) ─────────────────────────────►│
  │            │◄──────────────────────── partial_transcript (live text) ───────│
  │ release    │ +120 ms tail, send commit:true ───────────────────────────────►│
  │            │◄──────────────────────── committed_transcript (RAW) ───────────│
  │            │── POST /api/tutor/correct ───────►│── Haiku (JSON) ───────────►│
  │            │── POST /api/tutor/reply ─────────►│── Sonnet (stream) ────────►│
  │            │◄── text stream (captions) ────────│                            │
  │            │── POST /api/tts (chunk 1..n) ────►│── Flash v2.5 ─────────────►│
  │            │◄── CorrectResponse → highlights, toast                         │
  │ hears      │◄── mp3 → decode → AudioContext queue                           │
  │            │── POST /api/tutor/metrics (timeline)                           │
```

| Stage | Budget | Running total after release |
|---|---|---|
| Tail capture | 120 ms | 120 |
| Commit → committed transcript | 300 ms | 420 |
| **Correction lane:** Haiku + validation + render | 900 ms | **≈1,320 (target ≤1,500)** |
| **Reply lane:** Sonnet first token | 600 ms | 1,020 |
| First chunk complete (short opening clause) | 250 ms | 1,270 |
| TTS returns first chunk | 350 ms | 1,620 |
| Decode and start playback | 50 ms | **≈1,670 (target ≤2,000)** |

These are budgets to check, not measured numbers. The two unknowns are commit latency and Sonnet's first token.

---

## 3. Files

**`/shared/src/tutor.ts`**: zod schemas and types for everything in §4.

**`/web/lib`**
| File | Does |
|---|---|
| `claude.ts` | The only file that imports `@anthropic-ai/sdk`. `MODELS` constant; `correctUtterance()`, `streamTutorReply()`, `writeRecap()`. |
| `elevenlabs.ts` | `mintSttToken()`, `ttsChunk()` with disk cache, `sttBatch()`. |
| `tutor/prompts.ts` | The three prompts (§5). |
| `tutor/policy.ts` | `nextDirective()` (pure). |
| `tutor/validate.ts` | Span check, accent/punctuation filter, confidence filter, target-word validation (pure). |
| `tutor/session.ts` | In-memory session store on `globalThis`: targets, error counts, policy state, credited words. Writes `utterances` rows in the background. |
| `tutor/context.ts` | Builds `TutorContext`; fixture fallback. |
| `tutor/chunker.ts` | Sentence chunker (pure, used by the client). |
| `tutor/client/pttRecorder.ts` + `public/pcm-worklet.js` | Mic → 16 kHz PCM chunks plus full buffer. |
| `tutor/client/scribeRealtime.ts` | Raw WebSocket client: connect, send, commit, events. |
| `tutor/client/audioQueue.ts` | Ordered playback, `stopAll()`. |
| `tutor/client/timeline.ts` | Per-turn timestamps. |
| `tutor/client/useTutorSession.ts` | **The one hook Shravan's UI uses** (§7). |

**`/web/app`**: `api/stt-token`, `api/stt-batch`, `api/tts`, `api/tutor/{context,correct,reply,end,metrics}` (each a `route.ts`), and `tutor-lab/page.tsx` (bare test page with text box and debug panel).

**`/eval`**: `stt-test/run.ts`, `stt-test/score.ts`, `stt-test/results.md`, `latency/summarize.ts`.

---

## 4. API contracts

```ts
// ---- shared/src/tutor.ts (zod schemas; inferred types shown) ----
type SpokenErrorType =
  | "conjugation" | "agreement" | "word_choice" | "word_order" | "missing_word" | "extra_word";

type CorrectionError = {
  span: string;            // exact substring of rawText
  type: SpokenErrorType;
  correction: string;
  explanation_en: string;
  severity: 1 | 2 | 3;
  confidence: number;      // 0..1, range checked in code
  lemma: string | null;
};
type TargetWordUse = { lemma: string; correct: boolean; form?: string }; // form is NEW
type CorrectionResult = {                      // specs §7.5
  utterance_id: string;                        // set by the server, not the model
  errors: CorrectionError[];
  target_words_used: TargetWordUse[];
  overall_ok: boolean;
};

type TargetWord = { lemma: string; article?: string; english: string; source: "hovered" | "due" };
type TutorContext = {                          // architecture §4 plus two NEW fields
  hoveredWords: { lemma: string; sentence?: string }[];
  dueWords: string[];
  articleTitles: string[];
  level: "beginner" | "intermediate" | "upper_intermediate";
  topErrors: string[];
  sessionId: string;                           // NEW
  targetWords: TargetWord[];                   // NEW, 3–5
};

type WordUpdate = { lemma: string; from: WordState; to: WordState };
type TutorEventType = "spoken_correct" | "spoken_incorrect";   // NEW, for applyEvent
type Recap = {
  topErrors: { type: SpokenErrorType; span: string; correction: string; explanation_en: string; count: number }[]; // ≤3
  wordsNowKnown: string[];
  reviewTomorrow: string[];
  summary_en: string;
};
type TurnTimeline = {
  sessionId: string; utteranceId: string; sttPath: "realtime" | "batch" | "typed";
  tPress: number; tRelease: number; tSttFinal: number; tCorrectionShown: number | null;
  tReplyFirstToken: number | null; tFirstChunk: number | null; tTtsFirstBytes: number | null; tAudioStart: number | null;
};

// ---- endpoints ----
// GET  /api/stt-token            → { token: string; model: string }
// POST /api/stt-batch            body: audio/wav (16 kHz mono)        → { text: string }
// POST /api/tts                  { text: string; lemma?: string }     → audio/mpeg
// GET  /api/tutor/context        → TutorContext
// POST /api/tutor/correct        { sessionId; utteranceId; rawText; tutorPrevious?: string; sttPath }
//                                → { correction: CorrectionResult; wordUpdates: WordUpdate[]; serverMs: number }
// POST /api/tutor/reply          { sessionId; utteranceId: string | null; rawText: string | null;   // null = opener
//                                  history: { role: "tutor" | "learner"; text: string }[] }
//                                → text/plain stream (Spanish reply); header X-Turn-Id
// POST /api/tutor/end            { sessionId } → Recap
// POST /api/tutor/metrics        TurnTimeline → 204
```

**Changes versus `architecture.md`, and who they touch.** `/shared` does not exist yet, so these go in at Phase 0 rather than breaking a freeze.
| Change | Affects |
|---|---|
| `TargetWordUse.form` (optional) | Karthik's accuracy script can ignore it. |
| `TutorContext.sessionId`, `.targetWords` | Shravan (shows target chips). |
| `/correct` returns a wrapper `{ correction, wordUpdates, serverMs }` | **Shravan's mock stream must use this shape.** |
| `TutorEventType` values | **Karthik:** `applyEvent` must accept them (correct → `known` + FSRS Easy; incorrect → `learning` + Again). |
| `events.meta jsonb` holding the hover sentence (**agreed**) | **Karthik** (column) and **Naren** (send `meta.sentence` on hover). Feeds `hoveredWords[].sentence`. |
| New routes `/api/stt-batch`, `/api/tutor/metrics` | Nobody; additive. |
| Learner updates applied in `/correct`, not `/end` | Karthik (matches architecture change #16). |
| Model settings: Haiku `thinking: disabled`, Sonnet `thinking: between_tools`, both effort `low` | Architecture §10 text. |
| Flash v2.5 for the demo too | `CLAUDE.md` and architecture §10 text. |

`raw_text` is the committed transcript exactly as received. `display_text` is stored in its own column and starts as a copy; nothing ever writes back to `raw_text`.

---

## 5. Draft prompts

### (a) Corrector: Haiku 5.5, `thinking: disabled`, effort `low`, `max_tokens` 1024

Model output schema (the server adds `utterance_id`): `{ errors: CorrectionError[], target_words_used: { lemma, form, correct }[], overall_ok: boolean }`, with `type` as the six-value enum above so accent and punctuation types cannot be produced.

```
You check one spoken sentence from an English speaker who is learning Latin American Spanish.
The text in <transcript> is a verbatim speech-to-text transcript of what they said out loud.

How to mark errors
- Never rewrite or tidy the transcript. Each `span` must be copied character for character
  from the transcript: the shortest run of words that contains the error.
- The learner was speaking. Punctuation, capital letters and accent marks were added by the
  transcriber, so never flag them, and never flag spelling. If the span and your correction
  would differ only by an accent mark or punctuation, there is no error.
- Flag only what a fluent listener would hear as wrong: verb conjugation, gender or number
  agreement, a wrong word, word order, a missing word, an extra word. For a missing word,
  use the two words around the gap as the span.
- Latin American usage is correct. Casual spoken style, fillers, false starts, repeated
  words and English names are not errors.
- A strange word may be a transcription glitch rather than a learner error. When you cannot
  tell, give low confidence. Leave out anything below 0.5.
- A correct sentence gets an empty `errors` list and `overall_ok: true`. That is a common
  and good outcome.

Fields
- explanation_en: one short plain-English sentence a {level} learner can follow.
- severity: 1 small slip, 2 clear error, 3 the meaning is unclear.
- lemma: dictionary form of the corrected word, or null.
- target_words_used: for each word in <target_words> the learner actually said, in any
  form: the lemma, `form` exactly as spoken, and `correct` (right meaning and right form
  in this sentence). Leave out target words they did not say.
```
User turn: `<level>…</level> <target_words>la casa (house); aprovechar (to make the most of)…</target_words> <tutor_said>…</tutor_said> <transcript>…</transcript>`

Server checks after the model, in `validate.ts`: drop errors whose span is not in `rawText`; drop errors where span and correction match once case, accents and punctuation are stripped; show only confidence ≥0.7; recompute `overall_ok`.

### (b) Tutor: Sonnet 5.5, streaming, `thinking: between_tools`, effort `low`, `max_tokens` 300

```
You are Parrot, a friendly Spanish conversation partner for an English speaker at {level}
level. You are talking out loud: everything you write is turned into speech.

How to speak
- Latin American Spanish, neutral Mexican usage. Only Spanish; the app shows English help
  on screen.
- One to three short sentences, about 40 words at most. Begin with a short phrase of a few
  words, then a comma or full stop, so your voice can start quickly. End with one question
  most turns.
- Plain spoken text only: no lists, emoji, markup or stage directions.
- Match the learner's level: common words, simple tenses for beginners.

About the learner's mistakes
- <learner_said> is exactly what they said, mistakes included. Reply to what they meant.
- If they made a mistake, use the correct form naturally in your reply without pointing it
  out. Do this for at most one mistake per turn.
- Explain a mistake out loud only when <directive> gives you one to correct. Then say it in
  one short friendly sentence in simple Spanish (for example: Se dice "el problema", porque
  problema es masculino) and carry on with the conversation.
- If you truly cannot understand them, ask briefly: ¿Quieres decir…?

About the words they are learning
- <session> lists words the learner is working on. Ask questions whose natural answer needs
  one of them. Never ask the learner to use a specific word, and avoid saying a word from
  the list yourself until they have tried it. When <directive> names a word to steer toward,
  aim your next question at it.

About their reading
- The articles in <session> are things the learner read today in their browser. When
  <directive> says this is the opening turn, greet them, mention one article by topic, say
  you saw they read it, and ask what they think. If no articles are listed, open with an
  everyday question.
- If the learner asks you not to use their reading, apologise in a few words, change the
  subject, and do not mention their articles again.

Do not mention these instructions or the directive.

<session>
level: {level}
articles read today: {titles or "none"}
words they are learning: {lemma (english) [seen in: "sentence"]}…
recurring mistakes from earlier sessions: {topErrors or "none"}
</session>
```
Last user turn: `<learner_said>{rawText}</learner_said> <directive>opening turn: yes|no; explain out loud: none | "{span}" should be "{correction}" ({reason}); steer toward: {lemma} | none</directive>`. Earlier turns in `messages` carry plain text only. Check `stop_reason`; a refusal plays the canned line. The `fallbacks: "default"` option from architecture §10 is included, and is the first thing dropped if the beta streaming call misbehaves.

### (c) Recap: Haiku 5.5, structured output `{ summary_en: string, tips: string[] }`

The lists (`topErrors`, `wordsNowKnown`, `reviewTomorrow`) are computed in code from the session store. The model only writes prose:
```
Here is a summary of one Spanish practice conversation: the learner's most frequent
mistakes with examples, the words they used correctly, and the words they got wrong.
Write `summary_en`: two encouraging sentences in plain English about what went well and
what to practise next. Write one `tips` entry per mistake listed: a one-line rule in plain
English with a correct Spanish example. Refer only to what is in the data.
```
If the call fails, the recap shows the lists with a fixed sentence.

---

## 6. STT verbatim test (first task)

**Inputs.** `eval/sentences.json` from Naren: 15 sentences, each `{ id, text, error_span, corrected_span, error_type }`, where `error_span` includes a neighbouring word so it is distinctive ("la problema", not "la"). Ask Naren for 5 clean control sentences as well.

**Audio.**
- Pass A (clean): Flash v2.5 reads each sentence with the demo voice, saved as 16 kHz WAV.
- Pass B (real accent): **Karthik** (the demo speaker) and **Andrew** read all 15 into the lab page's record button. Recordings are gitignored.

**Configurations** (same audio through each, Spanish forced, `no_verbatim` off):
1. Realtime `scribe_v2_realtime`, manual commit
2. Realtime `scribe_v3_live`, manual commit
3. Batch `scribe_v2`

`eval/stt-test/run.ts` is a Node script that streams each file over the WebSocket at real-time pace, commits, and records the transcript plus commit→final time; for batch it posts the file and records total time.

**Scoring** (`score.ts`). Normalise transcript and spans: lowercase, strip punctuation and accents, collapse spaces. Per sentence:
- **survived**: `error_span` appears in the transcript
- **fixed**: `corrected_span` appears and `error_span` does not
- **garbled**: neither (read by eye, counted as not survived)

Output: `results.md` with survival % per configuration per pass, a per-error-type breakdown, and median commit latency.

**Decision rule.**
1. Choose the realtime configuration with the highest Pass B survival on **Karthik's reading** (the demo voice; other readers break ties), provided Pass A ≥80%, Pass B ≥70% and median commit latency ≤500 ms.
2. If batch beats the best realtime by 2 or more sentences on Pass B, use batch as the main path and accept that the 1.5 s correction target is at risk.
3. If every configuration is under 60% on Pass A, Scribe is rewriting errors. Spend at most 45 minutes running one outside provider through the same harness in batch mode (candidates to check then: Deepgram, OpenAI transcription; neither is verified yet).
4. If nothing clears the bar: use the per-type table to choose planted demo errors of a type that does survive, keep scripted sentences that pass 5 rehearsals (plan.md §3), and keep the text box as the grammar-demo backup (specs §14).

The decision and table get written into this doc and posted in team chat.

---

## 7. Task checklist

Hours are work time. Total ≈21.5 h including the scaffold, so there is **no slack**; the cut list in §8 recovers about 4 h.

| # | Phase | Task | Est. | Done when |
|---|---|---|---|---|
| 0 | P0 | Minimal scaffold: npm workspaces, Next.js app, `/shared` with all schemas (incl. §4), `lib/claude.ts` + `lib/elevenlabs.ts` stubs, `.env.example`, extension shell, per-folder briefs | 1.5 | `npm run build` passes; teammates can import `/shared` |
| 1 | P1 | **STT test harness** (`run.ts`, `score.ts`), all three configs | 1.5 | One WAV returns a transcript from each config |
| 2 | P1 | Pass A: generate TTS reads, run, score | 0.5 | `results.md` has Pass A numbers |
| 3 | P1 | Send Shravan the mock `CorrectResponse` stream + hook interface (do while waiting for readers) | 0.5 | Shravan confirms the mock page runs on it |
| 4 | P1 | Pass B with Karthik's and Andrew's recordings; **pick the provider** | 0.75 | Decision written here and posted |
| 5 | P2 | `/api/tutor/correct`: Haiku structured output + `validate.ts` | 1.5 | `curl` with "yo tiene la problema" returns two errors with spans in the text; a clean sentence returns none; an accent-only difference is dropped |
| 6 | P2 | `/api/stt-token`, `pttRecorder`, `scribeRealtime`, `/api/stt-batch` fallback | 2.5 | Lab page shows live partials and a final transcript on release; killing the socket falls back to batch |
| 7 | P2 | `/api/tutor/reply` + `policy.ts` + tutor prompt | 1.5 | `curl` streams a short Spanish reply; directive visible in server log |
| 8 | P2 | `/api/tts` with cache, `chunker`, `audioQueue`, barge-in | 2.0 | Reply is heard in order; pressing talk mid-reply silences it within 100 ms |
| 9 | P2 | `useTutorSession` glue + timeline + `/metrics` on the lab page | 1.0 | **Phase 2 exit:** speak a sentence → corrections on screen + spoken reply; a line lands in `turns.jsonl` |
| 10 | P3 | `/api/tutor/context` + opener + fixture fallback | 1.0 | Opener names a seeded article; with the DB off it still opens |
| 11 | P3 | Wire Shravan's tutor page to `useTutorSession` | 1.5 | His page runs a full turn with real audio |
| 12 | P3 | Target-word validation → Karthik's `applyEvent` → `wordUpdates` → toast | 1.0 | Scripted sentence flips a hovered word to `known` (toast + vocab page); echoing the tutor does not |
| 13 | P4 | Latency pass: 20 real turns, summarise, tune (see below) | 1.5 | Median release→correction ≤1.5 s and release→audio ≤2 s, or the gap and cause are written down |
| 14 | P4 | `/api/tutor/end` recap | 0.75 | Recap shows after "End session"; works with the model call disabled |
| 15 | P4 | Failure drill: go through each row of the §1.7 table on purpose | 0.5 | Each row behaves as written |
| 16 | P4 | End-to-end bug bash on the demo script, headset + hotspot, Karthik speaking | 1.5 | Demo steps 3–4 (specs §11) pass 5 times in a row with Karthik at the mic |

Latency tuning order for task 13: shorten the system prompt and history window → adaptive thinking at `low` vs `between_tools` for Sonnet → first-chunk split point → ElevenLabs `stream-input` WebSocket (only if still over 2 s and time allows).

---

## 8. Hand-offs, risks, cut list

**Hand-offs**
| Who | What | When |
|---|---|---|
| → Shravan | `CorrectResponse` JSON examples (clean, two errors, with `wordUpdates`), a mock that emits partial transcript → final → corrections → caption stream, and the `useTutorSession` interface: `{ status, partial, turns, targetWords, start(), pressTalk(), releaseTalk(), sendText(), end(), recap }` | Task 3 (Phase 1) |
| ← Naren (or anyone free) | Latin American voice ID (`docs/briefs/naren.md` task 0.3) | Before task 2 |
| ← Naren | 15 error sentences + 5 controls in the §6 format; confirmed ElevenLabs balance; `meta.sentence` on hover events | Before task 2; hover meta by Phase 3 |
| ← Karthik | `applyEvent` accepting `spoken_correct` / `spoken_incorrect`; a helper `recordTutorEvent(userId, lemma, type) → { from, to }`; `events.meta jsonb`; queries or helpers for recent hovers, due words, today's articles, settings; seed data | Signature by end of Phase 2; data by Phase 3 start |
| ← Karthik (+ Andrew reads too) | Read the 15 sentences (5 minutes each). Karthik is the demo speaker, so Karthik's reading decides the STT pick | Task 4 |
| ← Karthik | Demo speaker: rehearse the scripted tutor sentences (each must pass ≥5 runs, plan.md §3) | Phase 4 |

**Risks**
| Risk | Mitigation |
|---|---|
| STT rewrites learner errors | §6 decision rule; scripted sentences; text-box backup |
| Voice start over 2 s | Tuning order above; correction still shows first |
| Short utterances commit slowly ("first 2 seconds" note) | Measured in task 1; if bad, send short clips straight to batch |
| Haiku flags things that are not errors | Confidence floor, accent filter, Karthik's accuracy run; tighten prompt on real misses |
| False "known" flips | The five checks in §1.6 |
| Credits run out during rehearsal | Dev modes in §1.9; check balance before Phase 4 |
| One person, no slack | Cut list; 45-minute rule from `CLAUDE.md` |

**Cut list for my area, in order**
1. Browser-voice fallback for TTS failures (captions only instead)
2. `topErrors` from earlier sessions (send an empty list)
3. Model-written recap prose (lists plus a fixed sentence)
4. Steering rule in `policy.ts` (prompt-only steering)
5. Live partial transcripts (show the final only)
6. Realtime STT, if the batch path proves fast enough in the test

Never cut: on-screen corrections with span validation, the push-to-talk loop with spoken reply, the "known" flip.

---

## 9. Open questions for Andrew

**Decided**
- TTS: Flash v2.5 in dev and demo. Claude: direct Anthropic API behind `web/lib/claude.ts`, no Bedrock.
- **Karthik speaks in the demo** and is a Pass B reader; Karthik's reading decides the STT pick.
- **Andrew is the second Pass B reader.**
- **Voice:** Naren (or anyone free) picks the Latin American voice and posts its ID: `docs/briefs/naren.md` task 0.3.
- **Hover sentences:** Karthik adds `events.meta jsonb`; Naren sends `meta.sentence` on hover events.
- Next step: the Phase 0 scaffold (task 0).

**Still open**
1. **Scaffold time:** this plan counts the 1.5 h scaffold on top of the voice tasks (≈21.5 h total). If the real limit is 20 h, cuts 1–3 should be taken up front. Which?
2. **`scribe_v3_live`:** included as a test candidate by default. Say so if you want v2 only.

---

## Verification (how to check the finished work)

1. `npm run build` in `/web`.
2. `npx tsx eval/stt-test/run.ts && npx tsx eval/stt-test/score.ts` → `results.md` matches the written decision.
3. `curl` checks from tasks 5 and 7.
4. `/tutor-lab?debug=1`: one spoken turn shows corrections, a spoken reply and timings; barge-in stops audio; typed input works with STT blocked.
5. Shravan's tutor page: scripted demo sentence with a planted agreement error → highlight appears, tutor recasts, hovered word flips to `known`.
6. `npx tsx eval/latency/summarize.ts` after 20 turns → medians for the pitch slide.
7. Failure drill (task 15) and five clean runs of the demo segment on headset + hotspot.
