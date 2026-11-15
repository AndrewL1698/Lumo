# Brief: Karthik — backend data, learner model, extension-facing APIs

Paste this whole file into a fresh Claude Code session to start a task. Then name the one task you are doing.

## Role
Karthik owns Lumo's data layer. That is the Supabase schema, the Spanish word list, and the learner model (`applyEvent` with `ts-fsrs`). It also covers the API routes the extension and web pages call: `/api/pair`, `/api/candidates`, `/api/translate`, `/api/events`, `/api/vocab`, `/api/data` and `/api/settings`. Karthik also writes the demo seed script and the `/eval` correction-accuracy script. Andrew's voice tutor calls Karthik's learner model to flip a word to `known`. Karthik is also **the demo speaker**: Karthik talks to the tutor on stage and reads the STT test sentences.

## Start here
- Rules: root `CLAUDE.md`, then `web/CLAUDE.md`, `scripts/CLAUDE.md`, `eval/CLAUDE.md`.
- Design: `docs/architecture.md` §5 (DB), §7 (learner model), §9 (endpoints). Product: `docs/specs.md` §3 (word list), §5.2 (scoring), §6 (learner model).
- Contracts: `shared/src/words.ts`, `events.ts`, `candidates.ts`, `translate.ts`, `settings.ts`, `api.ts`, `fixtures.ts`. Import from `@parrot/shared`.
- Your stub routes (they return fixtures now): `web/app/api/{pair,candidates,translate,events,vocab,data,settings}/route.ts`.
- Helpers already there: `web/lib/config.ts` (`DEMO_USER_ID`, `MODELS`), `web/lib/db.ts` (lazy Supabase service client), `web/lib/http.ts` (`parseBody` / `json`), `web/lib/claude.ts` (only file that imports the Anthropic SDK).

```
git pull --rebase && npm install
cp .env.example web/.env.local      # fill in the keys
npm run dev:web                     # http://localhost:3000
curl localhost:3000/api/vocab       # returns vocabResponseFixture until you replace it
npm run build -w web                # must pass before you push
```

Facts to keep handy:
- `DEMO_USER_ID = 00000000-0000-4000-8000-000000000001`. It is already in `web/lib/config.ts` and `.env.example`. Every route uses it. No login, no RLS.
- The extension sends `Authorization: Bearer <token>`. Web pages call without a token.
- Translate uses Haiku (`claude-haiku-5-5` via `MODELS`). Add your function to `web/lib/claude.ts` and tell Andrew. Use structured outputs and no prefill.

## Claude Pro budget
- Start each task by pasting this brief. Don't let Claude explore the repo.
- Use **Sonnet** in Claude Code, not Opus. `/clear` between tasks. One task per session.
- Build against `/shared` types and fixtures. Don't read other people's folders.
- If you hit the usage limit, hand this brief to Andrew rather than wait for the reset.
- Blocked for more than 30 minutes? Say so in team chat. Andrew picks it up or pairs.

---

## Phase 0: Scaffold & contracts

### 0.1 SQL schema
- **Files:** `supabase/migrations/0001_init.sql` (suggested location; anywhere is fine, just tell the team). Apply it in the Supabase SQL editor.
- **Tables:** the eight in architecture §5 (`words`, `user_words`, `events`, `articles`, `tutor_sessions`, `utterances`, `pair_codes`, `settings`), **plus `events.meta jsonb`** (agreed; holds the hover sentence).
  - `events.id uuid primary key`, so retries are idempotent (`insert ... on conflict (id) do nothing`).
  - `events.type text` must accept every `LearnerEventType`, including the tutor's `spoken_correct` / `spoken_incorrect`.
  - `events.lemma` and `events.article_key` are nullable. Tutor events have no article.
  - `utterances.raw_text` (verbatim STT, never updated) and `display_text` are separate columns.
- **Schemas:** `Word`, `UserWord`, `ExtensionEvent`, `StoredEvent`, `StoredArticle`, `Settings`.
- **Done when:** all eight tables exist, a `select` from each works through `web/lib/db.ts`, and `settings` has a row for `DEMO_USER_ID` with the `settingsFixture` values.

### 0.2 Start the word-list script
See 1.1. Pick the frequency list and check its licence.

---

## Phase 1 → Sat late morning

### 1.1 `scripts/build-wordlist.ts`
- **Steps (specs §3):** take the top ~3,000 entries, lemmatize and dedupe, drop function words, then run Haiku batches. Assign bands by rank (1–500 beginner, 500–1,500 intermediate, 1,500–3,000 upper-intermediate). Within a band, order nouns, verbs, adjectives, adverbs. Seed `words`. Finish with a Claude audit pass (gender, article, false friend) and review the flagged rows by hand.
- **Outputs:**
  - `words` rows. Each row must parse with `Word`.
  - `extension/src/wordindex.json`: lowercase English form → lemmas, e.g. `{ "house": ["casa"], "houses": ["casa"] }`. Tell Naren the final shape. The hover card also needs the false-friend flag; consider adding a `falseFriends: string[]` list (agree this with Naren).
- **Run:** `node --env-file=web/.env.local --import tsx scripts/build-wordlist.ts`. Cache Claude results on disk.
- **Done when:** `words` has ~2–3k rows, `wordindex.json` is generated, `npm run build -w extension` still passes, and the audit flags are reviewed. If the list is CC-BY-SA, the attribution is in the README.

### 1.2 STT test: Pass B reading (for Andrew)
- Read the 15 test sentences into Andrew's lab page (`/tutor-lab`, record button). It takes about 5 minutes. **Karthik's reading decides the STT provider** (voice-plan §6).
- **Done when:** Andrew confirms the recordings are in.

---

## Phase 2 → Sat ~4pm

### 2.1 Learner model: `web/lib/learner/`
- **Files:** `web/lib/learner/applyEvent.ts` (or `index.ts`), plus `scripts/learner-sanity.ts`. Add the dependency with `npm install ts-fsrs -w web`.
- **API:** `applyEvent(userWord, event, now) → userWord`, a pure function. `event.type` is any `LearnerEventType`.
- **Schemas:** `UserWord`, `WordState`, `LearnerEventType`, `TutorEventType`.

| Event | State | FSRS rating |
|---|---|---|
| `seen` | count +1, add `articleKey`; `new → seen`; `seen → learning` at ≥3 sightings across ≥2 articles | none |
| `hover`, `didnt_know` | → `learning` (also from `known`/`mastered`/`known_assumed`); set `lastHoverAt` on hover | Again |
| `knew_it` | unchanged (**never** → `known`) | Good |
| `quiz_pass` | → `known` | Good |
| `quiz_fail` | → `learning` | Again |
| `spoken_correct` | → `known` | Easy |
| `spoken_incorrect` | → `learning` | Again |
| `reading` | none (writes an `articles` row instead) | none |
| any review | → `mastered` when FSRS stability ≥ 60 days | — |

- **For Andrew:** `recordTutorEvent(userId, lemma, type: TutorEventType) → Promise<{ from: WordState; to: WordState }>`. It loads or creates the `user_words` row, calls `applyEvent`, saves it, and writes an `events` row with `article_key = null`. Andrew calls it from `/api/tutor/correct` and turns `{ from, to }` into a `WordUpdate`. **Agree on the signature by the end of Phase 2.**
- **Done when:** `npx tsx scripts/learner-sanity.ts` walks one word through `new → seen → learning → known`, then (with a backdated card) `→ mastered → learning`, and prints each step. Hovering alone never reaches `known`.

### 2.2 `POST /api/pair`
- **Schemas:** `PairRequest` → `PairResponse`.
- A static token for `DEMO_USER_ID` is fine (architecture §11 #15). Use `pair_codes` or a hard-coded demo code with `// HACK:`.
- **Done when:** the right code returns a token; a wrong code returns 401 with `ApiError`.

### 2.3 `POST /api/events`
- **Schemas:** `EventsRequest` → `EventsResponse`.
- Insert with `on conflict (id) do nothing` and count the duplicates. For each new event, run `applyEvent` and upsert `user_words`. Store `meta` in `events.meta` (`meta.sentence` is the hover sentence). A `reading` event upserts an `articles` row from `meta.title` / `meta.domain`.
- **Done when:** posting the same batch twice returns `duplicates` equal to the batch size the second time, and `user_words` changes only once.

### 2.4 `GET /api/candidates`
- **Schemas:** `CandidatesResponse`, `Candidate`.
- Return every `user_words` row with its flags. Scoring is in 3.1.
- **Done when:** the extension gets real states, and the response parses with `CandidatesResponse`.

### 2.5 `POST /api/translate`
- **Schemas:** `TranslateRequest` → `TranslateResponse` (`TranslateItem`).
- One Haiku call per batch. Results come back in the same order as the items. `span` is the exact English text **including its determiner**, and `replacement` is the inflected Spanish. Return `null` on a sense mismatch. Cache by (lemma, sense); an in-memory `Map` is fine.
- **Done when:** "Workers joined the strike on Monday." with lemma `huelga` returns `{ span: "the strike", replacement: "la huelga", lemma: "huelga" }`, and "He sat on the river bank." with lemma `banco` returns `null`.

**Phase 2 exit (with Naren):** hovering a swapped word writes an `events` row (with `meta.sentence`) and updates `user_words`.

---

## Phase 3 → Sat ~9pm (integration)

### 3.1 Scoring flags in `/api/candidates`
- `isDue` (`dueAt <= now`), `hoveredRecently` (last 7 days), `onWeakList` (the lemma appears in recent `utterances.correction` errors), `isNewInBand` (state `new` and band = `Settings.level`), `isMastered`.
- Words in bands below the user's level count as `known_assumed` (specs §4). Computing this on read is fine.
- The specs §5.2 weights and the 70/30 review/new mix need the words on the current page, so the **extension** applies them. Your job is correct flags. Confirm this split with Naren.
- **Done when:** after the demo seed, the fixture-style mix of flags shows up for real words.

### 3.2 `GET /api/vocab`
- **Schemas:** `VocabResponse`, `VocabItem`.
- `learning` = state `learning`, `known` = "Your vocabulary", `mastered`. Take `article` and `english` from `words` (join the English list with `"; "`). `streakDays` = consecutive days with at least one event.
- **Done when:** Shravan's vocabulary page shows real lists, and a `spoken_correct` moves a word into `known`.

### 3.3 `GET/PUT /api/settings`
- **Schemas:** `Settings`. PUT takes the full object.
- **Done when:** GET after PUT returns the same object. Onboarding and the extension both read it.

### 3.4 `GET/DELETE /api/data` ("What Lumo knows")
- **Schemas:** `DataResponse` (`StoredEvent`, `StoredArticle`, `UserWord`), `DataDeleteRequest` → `DataDeleteResponse`.
- `kind: "all"` deletes every row for `DEMO_USER_ID` in `user_words`, `events`, `articles`, `tutor_sessions` and `utterances` (plan §5 item 4: "tables are empty"). Settings can stay.
- **Done when:** after delete-all, those tables are empty for `DEMO_USER_ID`, and rerunning the seed restores the demo.

### 3.5 Query helpers for Andrew's `/api/tutor/context`
- **File:** `web/lib/learner/queries.ts` (suggested).
- **Helpers:** recent hovers with their sentence (`{ lemma, sentence? }[]` from `events.meta.sentence`), due lemmas, today's article titles, `getSettings(userId) → Settings`, and word details (`article`, `english`) for a list of lemmas.
- **Done when:** Andrew can build `TutorContext` from them. **Needed by the start of Phase 3.**

### 3.6 Demo seed: `scripts/seed-demo.ts`
- About 20 words for `DEMO_USER_ID`, with backdated FSRS history so some are due and some are mastered. Include a few hovers (with `meta.sentence`) on the demo article, one `articles` row for it, and the word that flips to `known` on stage left in `learning`. Agree the article with Naren and the flip word with Andrew.
- **Done when:** after delete-all, rerunning it restores all three vocab lists, and `/api/tutor/context` shows hovered words and the article title.

---

## Phase 4 → Sat late night · feature freeze Sun 3:00am

### 4.1 Correction-accuracy script: `eval/accuracy/run.ts` (suggested)
- **Input:** Naren's ~50-sentence set (planted errors plus clean controls), in the same format as `eval/sentences.json`.
- Post each sentence to the running `POST /api/tutor/correct` (`CorrectRequest` with `sttPath: "typed"`) and read the `CorrectResponse`.
- **Scoring:** a planted error is caught if any returned `errors[].span` overlaps `error_span` after normalising (lowercase, no accents or punctuation).
  - Recall = caught / planted.
  - Precision = caught / all flags.
  - False-alarm rate = clean sentences with at least one flag / clean sentences.
  - Also record the median `serverMs`.
- **Done when:** the script prints the three numbers plus a per-`SpokenErrorType` table, and Andrew has them for the pitch slide.

### 4.2 Server-side never-list check
- Reject never-list domains in `PUT /api/settings` (`allowlist`) and in `/api/events` (`meta.domain` on `reading` events). The list is in root `CLAUDE.md` rule 4. `TranslateRequest` carries no domain, so translate can't check it (see Open items).
- **Done when:** a `reading` event from `mail.google.com` is rejected or ignored.

### 4.3 Demo speaker rehearsal
- Rehearse the scripted tutor sentences with a headset. Each one must pass at least 5 runs (plan §3). Andrew runs the bug bash with Karthik at the mic.
- **Done when:** demo steps 3–4 (specs §11) pass 5 times in a row.

---

## Ship: Sun 3:00–7:30am
- Rehearse the 2-minute demo as the speaker (headset mic, phone hotspot, localhost).
- Bug fixes only. Reseed right before judging.

---

## Hand-offs

| Direction | What | When |
|---|---|---|
| → Andrew | `events.meta jsonb` column | Phase 0 |
| → Andrew | `applyEvent` accepting `spoken_correct` / `spoken_incorrect`; `recordTutorEvent(userId, lemma, type) → { from, to }` | Signature by end of Phase 2 |
| → Andrew | Query helpers (3.5) and seed data (3.6) | Phase 3 start |
| → Andrew | Pass B recordings; later, demo-speaker rehearsals | Phase 1; Phase 4 |
| → Naren | `extension/src/wordindex.json` and its shape | Phase 1 |
| → Naren | Real `/api/pair`, `/api/candidates`, `/api/translate`, `/api/events` | Phase 2 |
| → Shravan | Real `/api/vocab`, `/api/settings`, `/api/data` | Phase 3 |
| ← Naren | Hover events with `meta.sentence`; the ~50-sentence accuracy set; the demo article | Phase 2; Phase 3–4; Phase 3 |
| ← Andrew | Working `/api/tutor/correct` for the accuracy script | Phase 2 exit |

## Open items (check with Andrew)
- **Pairing code source.** Onboarding has to show a 6-digit code, but `/shared` has no endpoint for the web app to get one. Default: accept one hard-coded demo code in `/api/pair` and tell Shravan which. If you want a real `GET /api/pair`, Andrew has to add a schema first.
- **Scoring split:** the extension applies the weights and mix; you provide the flags (3.1).
- **Never-list in translate:** adding an optional `domain` to `TranslateRequest` would let the server check it. That is a `/shared` change, so ask Andrew.
