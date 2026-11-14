# Parrot: Architecture

Technical design, revised from `specs.md` §2. Where this file and `specs.md` disagree, **this file wins**. Every change is listed in §11 with the reason.

## 1. System overview

```
┌──────────────────── Chrome Extension (MV3) ────────────────────┐
│ content script: walk text → match words → swap → hover cards   │
│        │ chrome.runtime.sendMessage (no network here)           │
│ service worker: pairing token · event queue · ALL fetches      │
│ popup/options: pairing, site allowlist (permission prompts)    │
└───────────────┬────────────────────────────────────────────────┘
                │ REST + Bearer pairing token
┌───────────────▼──────────── Backend (Next.js route handlers) ─────────┐
│ extension APIs: pair · candidates · translate · events · tts · settings│
│ tutor APIs:     stt-token · tutor/context · correct · reply · end     │
│ app APIs:       vocab · data (privacy)                                │
│ learner model (pure fns) + ts-fsrs                                    │
│ Supabase Postgres (service key, server only)                          │
└───────────────▲───────────────────────────────▲───────────────────────┘
                │                               │
┌───────────────┴──── Web App (Next.js) ──────┐  │ Claude API (Haiku 5.5 / Sonnet 5.5)
│ onboarding · tutor · vocabulary · privacy    │  │ ElevenLabs (Scribe v2 Realtime + TTS)
│ settings · pairing code                      │──┘
└──────────────────────────────────────────────┘
```

- **Single demo user.** Every route resolves to `DEMO_USER_ID`. No login. Pairing exists only so the extension holds a token.
- **Secrets never leave the server.** Claude and ElevenLabs keys live in `/web/.env.local`. The browser gets only a short-lived STT token.
- **Demo runs from `localhost`** (no cold starts, less dependence on venue Wi-Fi). A Vercel deploy is optional. The extension's `host_permissions` include both.

## 2. Repo layout

```
/extension   MV3 extension (TS, Vite). src/content, src/sw, src/popup, src/wordindex.json
/web         Next.js App Router (UI + route handlers). lib/claude.ts, lib/elevenlabs.ts, lib/db.ts, lib/learner/
/shared      zod schemas + inferred TS types (single source of truth for every API shape)
/scripts     build-wordlist, seed-demo
/eval        sentences.json, stt-test, correction-accuracy, latency scripts
```
npm workspaces. `/shared` is imported by both `/web` and `/extension`.

## 3. Environment

```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=        # Latin American Spanish voice
SUPABASE_URL=
SUPABASE_SERVICE_KEY=       # server only; no RLS this weekend
DEMO_USER_ID=
```

## 4. Shared contracts (`/shared`, frozen after Phase 0)

| Schema | Used by |
|---|---|
| `WordState` = `new \| seen \| learning \| known \| mastered \| known_assumed` | everything |
| `UserWord` { lemma, state, fsrsCard, seenCount, seenArticles[], lastHoverAt, dueAt } | learner model, candidates, vocab |
| `ExtensionEvent` { id (uuid, client-made), type, lemma?, articleKey, ts, meta? } | extension → `/api/events` |
| `Candidate` { lemma, state, isDue, hoveredRecently, onWeakList, isNewInBand, isMastered } | `/api/candidates` |
| `TranslateRequest` { articleKey, items: [{ sentence, lemma, englishMatch }] } / `TranslateResponse` { items: [{ span, replacement, lemma } \| null] } | `/api/translate` |
| `CorrectionResult` (specs §7.5) | `/api/tutor/correct` → tutor UI |
| `TutorContext` { hoveredWords[{lemma, sentence}], dueWords[], articleTitles[], level, topErrors[] } | `/api/tutor/context` |
| `Settings` { level, intensity, perPageCap, allowlist[], pausedSites[], useReadingInLessons } | `/api/settings` |

`articleKey = hash(domain + title)`. URLs are never sent or stored.

## 5. Database (Supabase Postgres)

```
words        (lemma PK, rank, pos, gender, article, english text[], english_forms text[],
              cognate bool, false_friend bool, band)
user_words   (user_id, lemma, state, fsrs_card jsonb, seen_count int, seen_articles text[],
              last_hover_at, due_at, PK(user_id, lemma))
events       (id uuid PK  -- client-generated → idempotent retries,
              user_id, type, lemma, article_key, ts)
articles     (id, user_id, article_key, title, domain, ts)
tutor_sessions (id, user_id, started_at, ended_at, recap jsonb)
utterances   (id, session_id, raw_text, display_text, correction jsonb, ts)
pair_codes   (code PK, token, expires_at)
settings     (user_id PK, data jsonb)
```
`raw_text` (verbatim STT) and `display_text` are stored separately. Only `raw_text` is ever graded.

## 6. Chrome extension

**Permissions:** MV3, no host access by default. Sites are added one at a time from the **popup/options page**, because `chrome.permissions.request` needs a user gesture inside extension UI. After a grant, `chrome.scripting.registerContentScripts` registers the content script for that origin. The hard never-list (email, chat, banking, health, school/work tools, login/form pages) is checked in the extension **and** on the server.

**Content script pipeline:**
1. TreeWalker over visible text nodes, skipping `a, button, input, textarea, select, code, pre, script, style, [contenteditable]` and anything inside `form`. MutationObserver, debounced.
2. Tokenize, then look up English forms in the bundled **`wordindex.json`** (form → lemmas, built by `scripts/build-wordlist`). The word list is not fetched at runtime.
3. Get user word states from the service worker (cached from `/api/candidates`) and score them with the specs §5.2 formula, 70% review / 30% new.
4. Spacing: max one swap per sentence, never adjacent, per-page cap 25.
5. The service worker sends the chosen sentences to `/api/translate` in one batch. Swaps are applied only after the batch returns; page load is never blocked.
6. **Only replace spans inside a single text node.** Skip matches that cross inline elements.

**Hover card:** shows Spanish + article, English meaning, 🔊 (via `/api/tts`, cached by lemma), Knew it / Didn't know, and the false-friend fun fact. A hover counts only after 500 ms.

**Service worker:** holds the pairing token, queues events, flushes them in batches with retry (safe because event ids are idempotent), and does **all** network calls. Content-script fetches would be subject to the host page's CORS and would expose the token.

**Controls in scope:** main toggle (toolbar + Alt+Shift+P), pause on this site, intensity (Off/Light/Normal/Immersion), per-page cap. **Stretch:** snooze, peek, schedule, study mode, Auto intensity, daily cap.

## 7. Learner model

- Implemented as pure functions in `/web/lib/learner/`: `applyEvent(userWord, event, now) → userWord`, with vitest tests covering every row of specs §6.1 and §6.2.
- Uses `ts-fsrs`. Only active evidence creates reviews (hover/didn't-know/quiz-fail/wrong-in-speech = Again; knew-it/quiz-pass = Good; correct unprompted speech = Easy). `seen` only increments counts.
- `known` requires active evidence (a quiz pass or correct use in speech). Not hovering never makes a word known.
- **Demo seed (`scripts/seed-demo`):** backdates FSRS review history for ~20 words so that "due" and "mastered" states exist during the demo. Neither can happen naturally in one weekend.

## 8. Voice tutor

```
[hold Space / button]  Mic ──► ElevenLabs Scribe v2 Realtime (browser, single-use token)
[release]              commit utterance → RAW verbatim transcript
                              │
             ┌────────────────┴─────────────────┐
             ▼                                  ▼
  CORRECTION LANE                         CONVERSATION LANE
  POST /api/tutor/correct                 POST /api/tutor/reply (streaming)
  Haiku 5.5, effort low                   Sonnet 5.5, effort low
  structured output → validate            prompt includes: raw utterance,
  → drop spans not in raw text            TutorContext, PREVIOUS turns' corrections,
  → confidence ≥ 0.7 filter               spoken-correction budget counter
  → on-screen corrections (≤1.5s)         → split stream at sentence boundaries
  → applyEvent(target_words_used)         → ElevenLabs streaming TTS per sentence
  → stored for next turn + recap          → AudioContext playback queue (≤2s to first audio)
```

- **Push-to-talk, not VAD.** Learners pause mid-sentence, and VAD would split utterances. PTT also stops the tutor's voice from bleeding into the mic, and gives clean latency timestamps.
- **The lanes are independent.** Haiku's result can't reach the *current* Sonnet reply in time. Sonnet does its own recasts from the raw utterance. Haiku's errors feed the next turn's prompt, the learner model and the recap.
- **Spoken-correction budget:** a server-side counter allows about one spoken correction per 3–4 turns and is passed into the Sonnet prompt. The screen always shows every confident correction.
- **No-auto-correct enforcement:** the corrector prompt says "verbatim transcript, never fix it, quote exact words", **and** the server drops any error whose `span` isn't a verbatim substring of `raw_text`.
- **Spoken mode never grades punctuation or accents** (STT inserts those).
- **STT fallback:** if a realtime single-use token isn't available, record during PTT and send the clip to ElevenLabs batch STT on release (proxied through the backend).
- `/api/tutor/context` builds the session opener from hovered words and their sentences, due words, today's article titles (only if `useReadingInLessons`), level and top errors. `/api/tutor/end` writes the recap: top 3 errors, words now known, words to review tomorrow.

## 9. API endpoints

| Endpoint | Owner | Purpose |
|---|---|---|
| `POST /api/pair` | Karthik | Pairing code → extension token |
| `GET /api/candidates` | Karthik | User word states + scoring flags (word list is bundled, not sent) |
| `POST /api/translate` | Karthik | Batch in-context translation (Haiku). Returns the exact span **including the determiner** plus the inflected replacement, or `null` on a sense mismatch. Cached by (lemma, sense). |
| `POST /api/events` | Karthik | Batched, idempotent events → learner model + FSRS |
| `POST /api/tts` | Andrew | ElevenLabs TTS. Hover-card audio cached by lemma |
| `GET/PUT /api/settings` | Karthik | Settings shared by the web app and extension |
| `GET /api/stt-token` | Andrew | Single-use realtime STT token |
| `GET /api/tutor/context` | Andrew | Session context (§8) |
| `POST /api/tutor/correct` | Andrew | Correction lane |
| `POST /api/tutor/reply` | Andrew | Conversation lane (streaming text; client chunks to TTS) |
| `POST /api/tutor/end` | Andrew | Recap + commit learner updates |
| `GET /api/vocab` | Karthik | Learning / Your vocabulary / Mastered + streak |
| `GET/DELETE /api/data` | Karthik | Privacy page: list + delete one + delete everything |

## 10. Model configuration

| Use | Model | Settings |
|---|---|---|
| Corrections, translate, word-list build | `claude-haiku-5-5` | `output_config.effort: "low"` (thinking defaults to medium and adds latency). JSON via `output_config.format` structured outputs. |
| Tutor conversation | `claude-sonnet-5-5` | effort `low`, streaming, refusal fallback `fallbacks: "default"` |

- **Assistant prefill returns 400** on these models, so never use it to force JSON. Use structured outputs.
- All calls go through the official `@anthropic-ai/sdk`. If the Amazon track requires AWS, swap the client for the Bedrock client. It's a constructor change.
- ElevenLabs: Flash TTS model during development, best voice for the demo. Cache all repeated audio (credits are shared by STT and TTS).

## 11. Changes from `specs.md` (and why)

| # | Change | Reason |
|---|---|---|
| 1 | The correction hint feeds the **next** turn, not the current one | The lanes run in parallel, so Sonnet starts before Haiku finishes |
| 2 | **Push-to-talk** instead of VAD | Learners pause mid-sentence; TTS echo; clean latency measurement |
| 3 | The service worker does all extension fetches | Host-page CORS; keeps the token out of the page context |
| 4 | The site allowlist moves into the extension popup | The web app can't trigger `chrome.permissions.request` |
| 5 | Added `/api/tts`, `/api/settings`, `/api/tutor/end`. The word index is bundled in the extension | Missing from spec §9. Avoids shipping 3k rows per request |
| 6 | Demo seed script for due/mastered words | The 60-day FSRS stability can't be reached in a weekend |
| 7 | The word-list build adds lemmatize + dedupe, and checks the licence | Frequency lists are inflected forms. OpenSubtitles-derived lists are typically CC-BY-SA; attribute in the README |
| 8 | Inverted form→lemma index. Translate returns the span with its determiner. Single-text-node spans only | English↔Spanish is many-to-many; "the/a/my houses" need different determiners |
| 9 | Server-side span validation of corrections | Enforces the no-auto-correct rule in code, not only in the prompt |
| 10 | Haiku/Sonnet at effort `low`, structured outputs, no prefill | Latency targets; prefill is a 400 on current models |
| 11 | Single-use STT token with a batch fallback; demo from localhost | Serverless hosts can't proxy WebSockets; venue network risk |
| 12 | Client-generated event ids; `articleKey` hash | Safe retries; never store URLs |
| 13 | Sentence-chunked TTS through an AudioContext queue | Simplest reliable way to hit ≤2s to first audio |
| 14 | §5.5 controls trimmed to toggle / pause-site / fixed intensity / per-page cap | The other six controls never appear in the demo |
| 15 | Pairing is a static token for `DEMO_USER_ID`; no RLS | Single demo account |
| 16 | The "flips to known" moment is driven by the correction response on the tutor page | No need for Supabase Realtime |
