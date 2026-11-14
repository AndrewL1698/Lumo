# Brief: Shravan — web app UI

Paste this whole file into a fresh Claude Code session to start a task. Then name the one task you are doing.

## Role
Shravan owns every page a person sees in the Parrot web app: onboarding, the voice tutor page, vocabulary, "What Parrot knows" (privacy) and settings. Shravan also owns the shared layout, the nav and the design tokens. The pages read and write data through API routes whose shapes are fixed in `@parrot/shared`. Those routes already return fixtures, so every page can be built today. Karthik replaces the data routes with real ones in Phase 3. Andrew provides the tutor's audio and speech logic as one React hook, `useTutorSession`; Shravan builds the tutor page against a mock of it. Judges mostly don't speak Spanish, so every Spanish word on screen needs English nearby.

## Start here
- Rules: root `CLAUDE.md`, then `web/CLAUDE.md`.
- Product: `docs/specs.md` §4 (onboarding), §6.3 (vocabulary), §7.8 (recap), §8 (pages), §11 (demo script). The tutor hook: `docs/voice-plan.md` §8 (hand-offs).
- Contracts: `shared/src/settings.ts`, `api.ts`, `tutor.ts`, `words.ts`, `fixtures.ts`. Import from `@parrot/shared`.

| You edit | Notes |
|---|---|
| `web/app/layout.tsx` | Shared layout and nav. Exists, bare. |
| `web/app/globals.css` | Tailwind v4 entry and design tokens (`@theme`). Create it if missing. |
| `web/app/page.tsx` | Home. Placeholder now. |
| `web/app/onboarding/page.tsx` | New |
| `web/app/tutor/page.tsx` | New |
| `web/app/vocabulary/page.tsx` | New |
| `web/app/privacy/page.tsx` | New. Titled "What Parrot knows". |
| `web/app/settings/page.tsx` | New |
| `web/components/` | New. Your shared components. |

Don't edit `web/app/api/**`, `web/lib/**` or `web/app/tutor-lab/` (Andrew's test page).

```
git pull --rebase && npm install
cp .env.example web/.env.local      # pages work on fixtures even with empty keys
npm run dev:web                     # http://localhost:3000
npm run build -w web                # must pass before you push
```

**Data pattern.** Use client components (`"use client"`) that `fetch("/api/...")` and parse the result with the `/shared` schema, e.g. `VocabResponse.parse(await res.json())`. The stub routes already return the fixtures. When Karthik's real routes land, your pages go live with no code change. For pure layout work you can also import fixtures directly (`vocabResponseFixture`).

## Claude Pro budget
- Start each task by pasting this brief. Don't let Claude explore the repo.
- Use **Sonnet** in Claude Code, not Opus. `/clear` between tasks. One task per session.
- Build against `/shared` types and fixtures. Don't read other people's folders.
- If you hit the usage limit, hand this brief to Andrew rather than wait for the reset.
- Blocked for more than 30 minutes? Say so in team chat. Andrew picks it up or pairs.

---

## Phase 0: Scaffold & contracts

### 0.1 Page shells, nav, layout, design tokens
- **Files:** `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, and an empty `page.tsx` for each of `/onboarding`, `/tutor`, `/vocabulary`, `/privacy`, `/settings`.
- Nav links: Tutor · Vocabulary · What Parrot knows · Settings. Onboarding is reachable from Home.
- Tokens: colours, type scale and spacing as CSS variables in `@theme`, so later pages stay consistent.
- **Done when:** all five routes render inside the shared layout with working nav, and `npm run build -w web` passes.

---

## Phase 1 → Sat late morning

### 1.1 Onboarding: `app/onboarding/page.tsx`
- **Level pick:** the three `Level` values with the specs §4 descriptions:
  - Beginner: "I know some basic words and phrases."
  - Intermediate: "I can follow simple articles with help."
  - Upper-intermediate: "I can read most news but miss some words."
- **"Use my reading in tutor lessons"** toggle (`useReadingInLessons`, default on), explained in one sentence.
- **Reading sites:** the web app can't grant site access (architecture §11 #4). Show short steps instead: "Open the Parrot popup on the site and click Enable." Suggest a news site and Wikipedia.
- **Pairing code:** show the 6-digit code to type into the extension popup. No endpoint gives the web app a code yet, so show the demo code Karthik picks, hard-coded with `// TODO(demo)`.
- **Saving:** `GET /api/settings`, change the fields, then `PUT /api/settings` with the full object.
- **Schemas:** `Settings`, `Level`.
- **Done when:** finishing onboarding sends a PUT whose body parses with `Settings` (check the network tab).

### 1.2 Vocabulary page on mock data: `app/vocabulary/page.tsx`
- Three lists: **Learning now** (`learning`), **Your vocabulary** (`known`), **Mastered** (`mastered`). Show counts and a streak (`streakDays`). Each item shows article + lemma, English, and when it is due.
- **Schemas:** `VocabResponse`, `VocabItem`. Data: `GET /api/vocab` (returns `vocabResponseFixture` for now).
- **Done when:** the page renders the fixture: casa and aprovechar under Learning, huelga under Your vocabulary, tiempo under Mastered, streak 2.

---

## Phase 2 → Sat ~4pm

### 2.1 Tutor page UI against a mock hook: `app/tutor/page.tsx`
Andrew's hook (`web/lib/tutor/client/useTutorSession.ts`, built in Phase 2) returns:
```ts
{ status, partial, turns, targetWords, start(), pressTalk(), releaseTalk(), sendText(), end(), recap }
```
Andrew sends the exact TypeScript type plus a mock in Phase 1. Until then, write your own mock with the same names in `app/tutor/mockTutorSession.ts`. Make the page import it in one line, so swapping to the real hook is a one-line change.

**UI pieces:**
- **Push-to-talk:** hold Space or hold the button. Call `pressTalk()` on down and `releaseTalk()` on up. Show the state from `status`.
- **Live transcript:** show `partial` while the learner talks.
- **Turns:** learner turns show the raw transcript **exactly as given**. Highlight each `correction.errors[].span` by finding it in that text. Never rewrite the text. Show `correction` and `explanation_en` next to or under the highlight. Tutor turns show captions as they stream.
- **Target words:** chips from `targetWords` (`TargetWord`: article + lemma, English).
- **"Now known" toast:** for each `wordUpdates` entry with `to === "known"`.
- **Typed fallback:** a text box that calls `sendText()`.
- **End:** `end()` shows the recap panel (`Recap`: `topErrors` with explanations, `wordsNowKnown`, `reviewTomorrow`, `summary_en`, `tips`).

**Schemas:** `CorrectResponse` (wrapper: `correction` (`CorrectionResult`), `wordUpdates` (`WordUpdate[]`), `serverMs`), `CorrectionError`, `TargetWord`, `TutorContext`, `Recap`.

**The mock should play one turn:** `partial` grows → final text `rawTextFixture` → `correctResponseFixture` → caption streams `replyTextFixture` word by word → on `end()`, `recapFixture`. Also use `correctResponseCleanFixture` for a turn with no errors.

**Done when:** on the mock, the two highlights ("yo tiene", "la problema") appear with English explanations, the caption streams, a "huelga is now known" toast shows, and End shows the recap. All of it should be readable by someone who doesn't speak Spanish.

---

## Phase 3 → Sat ~9pm (integration)

### 3.1 Wire vocabulary and settings to real APIs
- If you fetched the routes from the start, this is a check, not a rewrite. Confirm with Karthik that Karthik's routes are live, then reload.
- **Settings page** (`app/settings/page.tsx`, schema `Settings`, `Intensity`):
  - level
  - intensity (Off / Light / Normal / Immersion)
  - per-page cap (0–25)
  - "Use my reading in tutor lessons"
  - paused sites, with remove
  - allowlist: read-only, with "add sites from the extension popup"
- Daily cap, schedule and study mode are cut. Don't build them.
- **Done when:** a settings change survives a page reload, and the vocabulary page shows the seeded demo words.

### 3.2 "What Parrot knows": `app/privacy/page.tsx`
- Show everything stored: words (`UserWord`: lemma, state, seen count), events (`StoredEvent`: type, lemma, time), and article titles (`StoredArticle`: title, domain, time). Each item has a delete button.
- **"Delete everything"**, with a confirm step.
- **Data:** `GET /api/data` → `DataResponse`. `DELETE /api/data` with a JSON body `DataDeleteRequest`: `{ kind: "word", lemma }`, `{ kind: "event", id }`, `{ kind: "article", id }`, or `{ kind: "all" }`. The response is `DataDeleteResponse`.
- Add one plain sentence at the top: what Parrot stores, and that it never stores URLs, page text or anything typed.
- **Done when:** deleting an item removes it after a refetch, and "Delete everything" leaves all three lists empty (against Karthik's real route).

### 3.3 Tutor wiring support
- Andrew swaps your mock for the real `useTutorSession` (voice-plan §7 task 11). Be around to adjust layout. Don't edit `web/lib/tutor/`.

---

## Phase 4 → Sat late night · feature freeze Sun 3:00am

### 4.1 Polish
- Empty states on every page: no words yet, no data, tutor not started, and an API error (show a friendly line, never a stack trace).
- English explanations visible everywhere (corrections, hover terms, recap, vocab).
- Recap styling: it is on screen during the demo.
- **Done when:** every page looks finished both with empty data and with fixtures, and no Spanish appears without English nearby.

### 4.2 Judge-facing extras (after 4.1; cuttable)
Spec in `docs/roadmap.md` → "Judge-facing extras". Two small tutor-page additions that make the tutor's planning visible to judges:
- **J1:** one small grey line under each tutor caption, showing the `X-Parrot-Why` text from `/api/tutor/reply`.
- **J2:** a "Today's lesson" card above the transcript (topic + why, target words with reasons, one error to watch). Target words tick off from `wordUpdates`.
- Build against fixtures until Andrew's fields land.

---

## Ship: Sun 3:00–7:30am
- **README + screenshots** (root `README.md`): what Parrot is, how to run it, plus screenshots of each page.
- Rehearse the 2-minute demo with the team.

---

## Hand-offs

| Direction | What | When |
|---|---|---|
| ← Andrew | `useTutorSession` type and a mock that emits partial → final → `CorrectResponse` → caption stream; `CorrectResponse` examples (clean, two errors, with `wordUpdates`) | Phase 1 (voice-plan task 3) |
| → Andrew | Confirm your tutor page runs on that mock | Phase 1 |
| → Andrew | Tutor page ready to wire to the real hook | End of Phase 2 |
| ← Karthik | The demo pairing code | Phase 1 |
| ← Karthik | Real `/api/vocab`, `/api/settings`, `/api/data` | Phase 3 |
