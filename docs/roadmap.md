# Parrot: Roadmap

Phased build order for HackPrinceton (Sat Nov 14 → **submit Sun 7:30am**). Each phase ends at a milestone from `specs.md` §13.
Who owns what and how we work: see [`plan.md`](plan.md). Technical design: see [`architecture.md`](architecture.md).

| Person | Area |
|---|---|
| **Andrew** | Scaffold + shared contracts, voice tutor, integration |
| **Karthik** | Backend data + learner model + extension-facing APIs |
| **Shravan** | Web app UI (React) |
| **Naren** | Chrome extension + eval/demo assets |

---

## Phase 0: Scaffold & contracts (~1.5h)
**Goal:** everyone can start coding against frozen types without waiting on anyone.

| Who | Tasks |
|---|---|
| Andrew | npm-workspaces monorepo (`/web`, `/extension`, `/shared`, `/scripts`, `/eval`). Next.js App Router + TS + Tailwind. MV3 extension that loads unpacked (empty popup + content script + service worker). `/shared` zod schemas (see architecture §4). Supabase project, `.env.example`, `lib/claude.ts`, `lib/elevenlabs.ts`, `DEMO_USER_ID`. Per-folder `CLAUDE.md` + a task brief per person. Decide whether the Amazon track needs Bedrock. |
| Karthik | SQL schema (architecture §5) applied to Supabase. Start the word-list script. |
| Shravan | Page shells, nav, layout, design tokens for all web pages. |
| Naren | Write 15 error-planted Spanish sentences for the STT test (each with its intended error + correction). Check ElevenLabs credit balance + API access. |

**Exit:** `npm run build` passes everywhere, the extension loads, the DB tables exist, and `/shared` is merged.

---

## Phase 1 → "Sat late morning"
**Goal:** STT provider chosen, word list in DB, first visible swaps.

| Who | Tasks |
|---|---|
| Andrew | STT verbatim test harness: Scribe v2 Realtime via single-use token, plus a batch fallback. Run two passes (TTS-read and teammate-read). **Pick the STT provider.** |
| Karthik | `scripts/build-wordlist`: frequency list → lemmatize + dedupe → drop function words → Haiku batches → JSON → seed `words`. Also emit `extension/src/wordindex.json` (English form → lemmas). Claude audit pass on gender/article/false-friend. |
| Naren | Extension swaps **hard-coded** words on one news site: TreeWalker with the skip rules, MutationObserver (debounced), max one swap per sentence. |
| Shravan | Onboarding (level pick, reading-in-lessons toggle, pairing-code display) + vocabulary page on mock data. |

**Exit:** a hard-coded "la casa" appears on the demo site, `words` has ~2–3k rows, and the STT decision is written down.

---

## Phase 2 → "Sat ~4pm"
**Goal:** extension ↔ backend events flowing; voice loop speaks Spanish end to end; corrections on screen.

| Who | Tasks |
|---|---|
| Andrew | `/api/stt-token`, `/api/tutor/correct` (Haiku, structured output, span validation), `/api/tutor/reply` (Sonnet streaming → sentence-chunked TTS → audio queue). Push-to-talk loop working in a bare page. |
| Karthik | `/api/pair`, `/api/events` (batched, idempotent), `/api/candidates`, `/api/translate`. Learner model `applyEvent(userWord, event)` + `ts-fsrs`, sanity-checked with a quick script against specs §6.1/§6.2. |
| Naren | Popup pairing. Service worker does **all** fetches. Real candidates + translate. Hover card (500 ms rule, Knew it / Didn't know). Batched event queue. |
| Shravan | Tutor page UI: push-to-talk button, live transcript with inline correction highlights, tutor captions, recap panel, all driven by a mock `CorrectionResult` stream. |

**Exit:** hovering a swapped word writes an `events` row and updates `user_words`, and speaking a sentence shows corrections plus a spoken reply.

---

## Phase 3 → "Sat ~9pm" (integration)
**Goal:** the tutor knows what you read; the learner model updates live; vocab page is real.

| Who | Tasks |
|---|---|
| Andrew | `/api/tutor/context` (hovered words + sentences, due words, article titles, top errors). Wire Shravan's tutor UI to the real pipeline. `target_words_used` → `applyEvent`. "Word is now known" toast. |
| Karthik | Scoring formula + 70/30 review/new mix in candidates. `/api/vocab` (Learning / Your vocabulary / Mastered + streak). **Demo seed script** that backdates FSRS history so due and mastered words exist. |
| Shravan | Wire vocabulary + settings to real APIs. "What Parrot knows" page (list, per-item delete, delete everything). |
| Naren | 🔊 in the hover card via `/api/tts` (cached). `seen` via IntersectionObserver (≥2s). Toolbar toggle + Alt+Shift+P. Pause on this site. Then switch to the eval set. |

**Exit:** the full demo script (specs §11) runs once end to end, even if rough.

---

## Phase 4 → "Sat late night" · **Feature freeze Sun 3:00am**
**Goal:** numbers for the pitch, polish, backup video.

| Who | Tasks |
|---|---|
| Andrew | Latency pass (target: correction ≤1.5s, voice ≤2s). `/api/tutor/end` recap. End-to-end bug bash. |
| Karthik | `/eval` correction-accuracy script: precision, recall, false-alarm rate on ~50 sentences. Server-side never-list check. |
| Shravan | Polish, empty states, English explanations visible everywhere (judges), recap styling. |
| Naren | Lock the demo script. **Record the backup video.** Stretch controls only if Phase 3 finished (snooze → peek). |

---

## Sun 3:00–7:30am: Ship
- Everyone rehearses the 2-minute demo (headset mic, phone hotspot, localhost).
- Naren: Devpost write-up. Shravan: README + screenshots. Andrew: pitch numbers slide.
- **Submit by 7:30am** (Devpost deadline 8:15am). Judging round 1 at 9:30am.

---

## Cut order if behind
1. Placement check
2. Typed mode
3. Schedule / study mode / Auto intensity / daily cap
4. Peek / snooze
5. In-page quiz
6. Topic packs
7. Photon phone line

**Never cut:** swaps + hover cards, the push-to-talk tutor with on-screen corrections, a word flipping to "known" after correct spoken use, the "What Parrot knows" page.
