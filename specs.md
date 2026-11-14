# Parrot — Project Spec (HackPrinceton Fall 2026)

> **Pitch:** Your morning reading becomes tonight's conversation lesson.
> Parrot quietly swaps English words on sites you choose into Spanish, learns which words you
> don't know, and then a voice tutor talks with you about what you read, correcting you
> instantly like a fluent friend. You prove you know a word by using it out loud.

---

## 0. Decisions locked in
| Topic | Decision |
|---|---|
| Name | **Parrot** (may rename later) |
| Language | **Spanish only**, **Latin American** variety. English UI. |
| Main track | **Education** |
| Special tracks | Amazon Best Practical AI (primary). Optional: Photon (phone-line tutor / text nudges), Peri Forward Deployed (consult a campus language program/club), LangChain deepagents (if the lesson planner is built as a deepagent) |
| Pieces | Chrome extension (reading) + Web app (tutor, vocabulary, dashboard, settings) + one shared backend/DB |
| Voice | **ElevenLabs** for speech-to-text (Scribe v2 Realtime) and the tutor's voice (TTS) |
| Brain | **Claude**: fast model (Haiku) for corrections, stronger model (Sonnet) for conversation |
| Level setup | **Demo:** user picks a difficulty level. **Stretch:** 90-second placement check |
| Writing level | Not collected |
| Word path | Openly licensed Spanish frequency list, **common nouns first** (with article), then verbs, then adjectives. Skip function words. |
| "Known" words | Earned through **evidence levels**, never just "didn't hover" |
| Review scheduling | **FSRS** (spaced repetition), using an open-source JS implementation |
| Accounts | One demo account; extension pairs to web app with a code. No full login system. |

---

## 1. Why we're different (say this to judges)
- Browse-to-learn extensions already exist (Toucan, Taliri, Spritz, etc.). They stop at vocabulary.
- AI speaking tutors exist (Praktika, Langua, Speak). They don't know what you read.
- **Parrot connects them:** reading decides what you practice speaking, the tutor talks about the
  article you actually read, and a word only counts as learned once you use it correctly out loud.
- Privacy is visible: only runs on sites you allow, never on messages/homework, with a page that
  shows everything it knows about you.

---

## 2. Architecture

```
┌──────────────── Chrome Extension (MV3) ────────────────┐
│ content script: find words → swap → hover cards        │
│ tracks: seen / hover / knew-it / quiz events           │
└───────────────┬────────────────────────────────────────┘
                │ REST (pairing token)
┌───────────────▼──────────── Backend (Next.js API routes) ─────────┐
│ /api/candidates  /api/translate  /api/events  /api/tutor/*        │
│ learner model + FSRS scheduler + word list                        │
│ DB: Supabase (Postgres)                                           │
└───────────────▲────────────────────────────────▲──────────────────┘
                │                                │
┌───────────────┴──── Web App (Next.js) ─────┐   │ Claude API (Haiku + Sonnet)
│ onboarding · tutor · vocabulary · privacy  │   │ ElevenLabs (STT + TTS)
│ settings · pairing                          │───┘
└─────────────────────────────────────────────┘
```

**Tutor audio pipeline (two parallel lanes):**
```
Mic → ElevenLabs Scribe v2 Realtime (streaming STT)
        └─ final utterance (RAW, verbatim) ─┬─► CORRECTION LANE: Claude Haiku → JSON errors
                                            │      → on-screen correction (~1.5s)
                                            │      → learner model updates
                                            │      → "correction hint" to tutor
                                            └─► CONVERSATION LANE: Claude Sonnet (streaming)
                                                   → ElevenLabs TTS (streaming) → speaker
```

**Security:** never ship API keys to the browser or extension. All Claude/ElevenLabs calls go
through the backend. Mint a short-lived token for realtime STT if ElevenLabs supports it,
otherwise proxy the WebSocket through the backend.

### Repo layout
```
/extension      Chrome MV3 extension (TypeScript)
/web            Next.js app (UI + API routes)
/shared         shared TS types (events, word states, correction schema)
/scripts        word-list build script
/eval           test sentences + scripts for accuracy/latency numbers
specs.md
```

### Env vars
```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=        # Latin American Spanish voice
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

---

## 3. Word list (built once by script)

**Source:** an openly licensed Spanish frequency list (e.g., subtitle-based lists on GitHub).
**Check the license before using.**

**Build script (`/scripts/build-wordlist`):**
1. Take the top ~3,000 entries.
2. Drop function words (articles, prepositions, pronouns, conjunctions: *de, la, que, el, en, y…*).
3. Batch the remaining lemmas through Claude to produce, for each:
   ```json
   {
     "lemma": "casa",
     "rank": 210,
     "pos": "noun",              // noun | verb | adj | adv
     "gender": "f",              // nouns only
     "article": "la",            // nouns only
     "english": ["house", "home"],
     "english_forms": ["house", "houses", "home", "homes"],
     "cognate": false,
     "false_friend": false
   }
   ```
4. Assign difficulty bands by rank (approximate):
   | Band | Rank range |
   |---|---|
   | Beginner | 1–500 |
   | Intermediate | 500–1,500 |
   | Upper-intermediate | 1,500–3,000 |
5. Order within a band: **nouns → verbs → adjectives → adverbs**.
6. Store in a `words` table. Have a Spanish-speaking teammate spot-check 50 rows.

**Cognates** (*información*): fine early as confidence boosters, but they **don't count toward
learning stats**. **False friends** (*embarazada*): save for later, flag as a "fun fact" in hover cards.

---

## 4. Onboarding (web app)
1. **Pick level (demo version):** Beginner / Intermediate / Upper-intermediate, each with a
   plain-language description:
   - Beginner: "I know some basic words and phrases."
   - Intermediate: "I can follow simple articles with help."
   - Upper-intermediate: "I can read most news but miss some words."
2. Effect of the level:
   - Sets the **starting band**.
   - Words in bands **below** the chosen level start as `known_assumed` (low confidence). They're
     shown rarely as spot checks, and demoted if hovered.
3. **Pick reading sites** (allowlist): suggest a news site, Wikipedia, a recipe site. The user
   accepts each one; Chrome shows its own permission prompt.
4. **Pair the extension:** web app shows a 6-digit code; enter it in the extension popup.
5. Toggle: **"Use my reading in tutor lessons"** (default ON, explained in one sentence).

**Stretch: 90-second placement check**
- ~30 words across bands; user taps "know it" / "don't know."
- Include ~6 **fake Spanish-looking words**; claiming to know them lowers the score.
- Optional 30-second speaking sample; Claude estimates speaking level.

---

## 5. Chrome extension

### 5.1 Permissions & privacy
- Manifest V3. **No site access by default.** Sites are added one at a time with optional host
  permissions requested at runtime, so the extension technically cannot read other sites.
- **Hard never-list** (even if added by mistake): email, chat/messaging (Google Chat, Slack,
  Messages, Discord), banking/payments/checkout, health and insurance portals, school/work tools
  (Canvas, Google Docs, Overleaf, GitHub), login/password/form pages.
- Incognito: off (Chrome default).
- **Data sent to backend:** only the chosen sentences (for translation), word events, and article
  title + domain (title can be disabled). **Never:** full page text, URLs history, screenshots,
  anything typed.

### 5.2 Finding and choosing words
1. Walk visible text nodes (TreeWalker). **Skip:** `a, button, input, textarea, select, code, pre,
   script, style, [contenteditable]`, and anything inside forms.
2. Watch for dynamically loaded text (MutationObserver), debounced.
3. Tokenize; match English tokens against `english_forms` from the word list.
4. Ask backend `/api/candidates` for the scoring data (user's word states), cached locally.
5. **Score each candidate:**
   ```
   score = 3.0 * is_due_for_review
         + 2.0 * hovered_in_last_7_days
         + 1.5 * on_tutor_weak_list
         + 1.0 * is_new_in_current_band
         + 0.5 * matches_topic_pack        (stretch)
         - 5.0 * is_mastered               (mastered words appear only as rare refreshers)
         + small random jitter
   ```
6. **Mix:** aim for ~70% review/learning words, ~30% new words.
7. **Spacing rules:** max **one swap per sentence**, never adjacent, respect intensity and daily cap.
8. **Nouns are swapped with their article:** "the house" → "**la casa**" (teaches gender).

### 5.3 Translating in context
- Send only the selected sentences to `/api/translate` in one batch per page.
- Claude returns the exact span to replace and the correct form for that sentence
  ("ran" → "corrió"), **or `null` if the sense doesn't match** (e.g., river *bank* vs money *bank*).
- Cache by (lemma, sense). Show swaps only after the batch returns. Never block page load.
- **Stretch:** test Chrome's built-in on-device translation for single words, so less text leaves
  the laptop.

### 5.4 Hover card
- Spanish word (+ article), English meaning, 🔊 pronunciation (ElevenLabs TTS, cached).
- Buttons: **"Knew it"** / **"Didn't know"**.
- False-friend fun fact if flagged.
- A hover only counts after **~500 ms** (ignores mouse passing over).

### 5.5 Controls
| Control | Behavior |
|---|---|
| Main toggle | Toolbar click + shortcut **Alt+Shift+P** |
| Pause on this site | Per-site off switch |
| Snooze | 1 hour / until tomorrow |
| Study mode | List of homework/work sites where Parrot always stays off |
| Schedule | e.g., only 7–9am and evenings |
| Peek | Hold a key → whole page shows English; release → swaps return |
| Intensity | Off / Light (~2 per 100 words) / Normal (~5) / Immersion (~15) / **Auto (default)**: rises only as words become solid |
| Daily cap | Max 30 new words/day (configurable) |
| Per-page cap | Max 25 swaps per page |

### 5.6 Events the extension sends (`POST /api/events`, batched)
| Event | When |
|---|---|
| `seen` | Swapped word visible in viewport ≥ 2s (IntersectionObserver), once per word per article |
| `hover` | Hover ≥ 500 ms |
| `knew_it` / `didnt_know` | Hover-card buttons |
| `quiz_pass` / `quiz_fail` | Stretch: in-page masked 4-choice check |
| `reading` | Article title + domain (if allowed), once per page |

---

## 6. Learner model

### 6.1 Evidence levels (word state machine)
| State | How a word gets there |
|---|---|
| `new` | Never shown |
| `seen` | Shown and visible ≥2s, no hover |
| `learning` | Seen without hover ≥3 times across ≥2 different articles, **or** hovered |
| `known` → **"Your vocabulary"** | Passed an active check: `quiz_pass` **or used correctly in conversation with the tutor** (strongest evidence) |
| `mastered` | FSRS interval/stability ≥ 60 days |
| back to `learning` | Hovered again, `didnt_know`, `quiz_fail`, or used incorrectly in conversation |
| `known_assumed` | Below the user's chosen level at onboarding; low confidence, spot-checked |

**Rule:** not hovering is weak evidence only. It can move a word to `learning`, never to `known`.

### 6.2 FSRS mapping
Use an open-source JS FSRS library. Only **active** evidence creates FSRS reviews:
| Event | FSRS rating |
|---|---|
| Hover / `didnt_know` on a learning/known word | Again |
| `quiz_fail` / used incorrectly in speech | Again |
| `quiz_pass` | Good |
| `knew_it` button | Good |
| Used correctly in speech, unprompted | Easy |
| `seen` without hover | *No review*, only adds to the evidence count |

- Words **due** for review get the highest replacement priority (see 5.2).
- `mastered` words leave the active pool but resurface occasionally as refreshers. Nothing is ever
  deleted.

### 6.3 Web app vocabulary page
Three lists: **Learning now · Your vocabulary · Mastered**, plus counts and a simple streak.

---

## 7. Voice tutor (web app)

### 7.1 Session start
Backend builds tutor context:
- Up to 5 words hovered in the last 24h, with the sentence they appeared in
- Up to 5 words due for review
- Today's article titles (only if "Use my reading in lessons" is ON)
- Learner level + top recurring grammar errors

Claude (Sonnet) picks **one** article topic and opens with it:
> "Vi que hoy leíste sobre la huelga del transporte. ¿Qué opinas?"

It steers the conversation so the learner needs 3–5 target words. It says where the topic came
from, and drops it if the learner says "don't use my reading."

### 7.2 What gets corrected
| Mode | Catches |
|---|---|
| **Spoken (core)** | Verb conjugation, gender/number agreement, wrong word, word order, missing/extra words |
| **Typed (stretch)** | Everything above **plus** accent marks (*esta/está*), punctuation (incl. ¿ ¡), spelling |

**Speech has no punctuation or accent marks**, since speech-to-text inserts those itself. Never
grade punctuation or accents in spoken mode. Say this in the pitch.

### 7.3 The no-auto-correct rule (make-or-break)
- Grade **only the raw, verbatim transcript.** Store it separately from any display version.
- Corrector prompt: "This is a verbatim transcript of a learner. Never fix it. Quote the learner's
  exact words. Only flag errors you are confident were actually spoken."
- **First task Saturday: the transcription test** (see §10). If ElevenLabs Scribe "cleans up"
  learner errors, compare another transcription service with instructions to transcribe verbatim,
  and keep whichever preserves the most errors.

### 7.4 Correction policy (how a fluent friend corrects)
Every finished utterance shows **all** confident corrections on screen immediately. The **voice**
corrects selectively:
| Situation | Spoken response |
|---|---|
| Error blocks understanding | Brief check-in ("¿Quieres decir…?"), then continue |
| Repeated error on a `learning` grammar point | Short explicit correction + one-line rule |
| First-time error above learner's level | Recast only (repeat the sentence correctly in the reply) |
| Small slip on something known | Visual only, no spoken correction |
| Learner avoided a target word | Ask a question that requires it |

Limit: about **one spoken correction per 3–4 turns**, so the conversation keeps flowing.

### 7.5 Correction JSON (Haiku output, validated)
```json
{
  "utterance_id": "u_123",
  "errors": [
    {
      "span": "la problema",
      "type": "agreement",
      "correction": "el problema",
      "explanation_en": "'Problema' is masculine even though it ends in -a.",
      "severity": 2,
      "confidence": 0.9,
      "lemma": "problema"
    }
  ],
  "target_words_used": [{ "lemma": "aprovechar", "correct": true }],
  "overall_ok": false
}
```
- `type` ∈ `conjugation | agreement | word_choice | word_order | missing_word | extra_word`
  (+ `accent | punctuation | spelling` in typed mode)
- Show only errors with `confidence ≥ 0.7`.
- `target_words_used` feeds §6 (correct use → `known` / FSRS Easy; wrong use → back to `learning`).

### 7.6 Latency targets
| Step | Target |
|---|---|
| On-screen correction after learner stops speaking | ≤ 1.5 s |
| Tutor's voice starts replying | ≤ 2 s |
| Approach | Stream everything; fast model for corrections only; fastest ElevenLabs voice model during development, best voice for the demo |

### 7.7 Voice
- One Latin American Spanish ElevenLabs voice, matched to the dialect choice.
- Optional: clone a Spanish-speaking teammate's voice **with their consent**.
- **ElevenLabs Creator credits** are shared by STT + TTS; demo rehearsals burn them. Check balance
  and API access before building, and cache repeated audio (hover-card pronunciations).

### 7.8 Session recap (end of conversation)
Top 3 recurring errors, words you used correctly (now "known"), words to review tomorrow.

---

## 8. Web app pages
| Page | Contents |
|---|---|
| Onboarding | Level pick, site allowlist suggestions, pairing code, reading-in-lessons toggle |
| Tutor | Mic button, live transcript with inline corrections, tutor captions, recap |
| Vocabulary | Learning now / Your vocabulary / Mastered |
| **What Parrot knows** | Every stored word, event, and article title with delete buttons + "delete everything" |
| Settings | Intensity, daily cap, schedule, study-mode sites, toggles |

---

## 9. API endpoints (backend)
| Endpoint | Purpose |
|---|---|
| `POST /api/pair` | Exchange pairing code for extension token |
| `GET /api/candidates` | Word states + scores needed for selection |
| `POST /api/translate` | Batch in-context translation of chosen sentences |
| `POST /api/events` | Batched extension events → learner model + FSRS |
| `GET /api/tutor/context` | Build session context (§7.1) |
| `POST /api/tutor/correct` | Correction lane (Haiku) |
| `POST /api/tutor/reply` | Conversation lane (Sonnet, streaming) |
| `GET /api/stt-token` | Short-lived realtime STT credential (or WebSocket proxy) |
| `GET /api/vocab` · `GET/DELETE /api/data` | Vocabulary lists · privacy page |

---

## 10. Testing & numbers for the pitch
1. **Transcription test (do this first):** a teammate reads 15 deliberately wrong Spanish
   sentences. Measure what % of errors survive in the transcript. Decide the STT provider.
2. **Correction accuracy:** ~50 recorded sentences (planted errors + clean controls).
   Report precision, recall, and false-alarm rate on clean sentences.
3. **Latency:** median time to on-screen correction and to tutor voice start.
4. **Stretch, retention mini-test:** two people, 10 words, with vs. without Parrot; quiz Sunday morning.

---

## 11. Demo script (2 minutes)
1. **0:00–0:15** Problem: learners can't practice with fluent speakers, and vocab apps don't connect
   to speaking.
2. **0:15–0:45** Open a real news article. Words are swapped into Spanish (with articles). Hover two.
   Briefly show Chrome's permission prompt + "What Parrot knows."
3. **0:45–1:25** Open the tutor: "I saw you read about…". The speaker uses a hovered word **correctly**
   (it flips to "known" live) and makes a planted agreement error: correction appears instantly,
   tutor recasts it.
4. **1:25–1:45** Vocabulary page updates; next page load swaps fewer of the mastered words.
5. **1:45–2:00** Numbers from §10 + "free, for anyone without a fluent speaker nearby."

**Demo safety:** headset mic (noisy rooms), phone hotspot, pre-recorded backup video, keep English
explanations on screen (most judges don't speak Spanish).

---

## 12. Team roles
| Person | Owns |
|---|---|
| A — Extension | Permissions, never-list, word finding/swapping, hover cards, controls, events |
| B — Backend & learner model | Word-list script, DB schema, candidates/scoring, FSRS, evidence states, translate endpoint |
| C — Voice tutor | STT test, realtime pipeline, correction lane + JSON, conversation lane, TTS, latency |
| D — Web app & demo | Onboarding, tutor UI, vocabulary + privacy pages, settings, pairing, demo script/video. Stretch: Photon phone line |

---

## 13. Timeline (Saturday → Sunday)
| By | Milestone |
|---|---|
| Sat late morning | STT verbatim test done + provider chosen · word list built · DB schema live · extension swaps hard-coded words on 1 news site |
| Sat ~4pm | Extension ↔ backend events working · voice loop speaks Spanish end to end · corrections JSON shows on screen |
| Sat ~9pm | Tutor uses hovered words + article topic · evidence states + FSRS updating · vocabulary page |
| Sat late night | Privacy page, controls, polish · run §10 tests · record backup video |
| **Sun 3am** | **Feature freeze** |
| Sun 3–7:30am | Rehearse pitch, Devpost write-up, README, Discord usernames · **submit by 7:30am** (Devpost deadline 8:15am) |
| Sun 9:30am | Judging round 1 (special tracks judged only here) |

---

## 14. Risks & fallbacks
| Risk | Fallback |
|---|---|
| STT auto-corrects learner errors | Switch STT provider; typed mode as backup for grammar demo |
| Latency too high | Shorter prompts, smaller model for corrections, show visual correction before voice |
| Swaps break site layout | Limit demo to 2–3 tested sites |
| Wrong translations | `null` sense rejection; Spanish-speaking teammate spot-checks |
| ElevenLabs credits run out | Cache audio; cheaper voice model for dev; monitor usage |
| Behind schedule | Cut in this order: placement check → typed mode → topic packs → quiz → schedule/peek |

---

## 15. Out of scope (this weekend)
Other languages · native mobile app · full user accounts · writing level · pronunciation scoring ·
chat-app integration (stretch only: "say it in Spanish" for your *own* draft).

## 16. Open questions
- Which teammate is the fluent Spanish checker?
- Which 2–3 news/reading sites do we test and demo on?
- Do we build the Photon phone-line tutor if ahead Saturday night?
