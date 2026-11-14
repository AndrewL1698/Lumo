# Shravan's plan: Parrot web app UI (HackPrinceton Fall 2026)

## Context
Shravan owns the **web app UI** (React/Next.js pages under `/web`, not `/web/app/api`). Andrew owns the scaffold, `/shared` and the tutor pipeline. Karthik owns the data APIs. Naren owns the extension. The goal is the UI needed for the 2-minute demo (specs §11), built on mock data so nothing waits on teammates, then wired to real APIs in Phase 3. Once approved, this plan is saved to `docs/plan-shravan.md` and committed on branch `shravan` (a new file; no shared docs are edited).

Repo state at 1am Sat: only docs. There is no `/web`, no `/shared` and no `.gitignore`, so Andrew's Phase 0 scaffold isn't in yet.

---

## 1. My tasks (from docs/roadmap.md)

| Phase / deadline | Task |
|---|---|
| **P0, ~2:30am Sat** (~1.5h) | Page shells, nav, layout, design tokens for all web pages |
| **P1, Sat late morning (~11am)** | Onboarding (level pick, reading-in-lessons toggle, pairing-code display) + vocabulary page on mock data |
| **P2, Sat ~4pm** | Tutor page UI: push-to-talk button, live transcript with inline correction highlights, tutor captions, recap panel, all driven by a mock `CorrectionResult` stream (Andrew wires the audio) |
| **P3, Sat ~9pm** | Wire vocabulary + settings to real APIs. "What Parrot knows" page (list, per-item delete, delete everything) |
| **P4, Sun 3:00am freeze** | Polish, empty states, English explanations visible everywhere, recap styling |
| **Ship, Sun 3–7:30am** | README + screenshots; rehearse the demo |

Also in plan.md §1: settings page and pairing-code screen.

## 2. How my parts connect

All calls are same-origin `/web/app/api/*` routes. My code holds no keys and makes no direct calls to Claude or ElevenLabs.

| Page | Types (`/shared`) | Endpoints | Tables (read by backend) |
|---|---|---|---|
| Shell/nav | none | none | none |
| Onboarding | `Settings` {level, intensity, perPageCap, allowlist[], pausedSites[], useReadingInLessons} | `GET/PUT /api/settings` (Karthik); pairing code: **no endpoint defined** ⚠️ | `settings`, `pair_codes`, `user_words` (known_assumed) |
| Tutor | `CorrectionResult` (specs §7.5), `TutorContext`, recap: **no type** ⚠️ | `GET /api/tutor/context` → TutorContext; `POST /api/tutor/correct` {raw utterance} → CorrectionResult; `POST /api/tutor/reply` → streamed text; `POST /api/tutor/end` → recap; `GET /api/stt-token` (all Andrew; he wires them) | `tutor_sessions`, `utterances` (raw_text vs display_text) |
| Vocabulary | `UserWord`, `WordState`; response: **no type** ⚠️ | `GET /api/vocab` → Learning / Your vocabulary / Mastered + streak (Karthik) | `user_words` ⋈ `words` |
| What Parrot knows | **no type** ⚠️ | `GET /api/data`, `DELETE /api/data` (one item / everything) (Karthik) | `user_words`, `events`, `articles` (+ sessions/utterances?) |
| Settings | `Settings` | `GET/PUT /api/settings` | `settings` |

### ⚠️ Gaps and contradictions to settle with the team
1. **Pairing code:** web onboarding must *display* a 6-digit code, but no endpoint creates one (`POST /api/pair` is the extension exchanging it). Arch #15 says pairing is a static token. → Propose: a static demo code from a constant, or `GET /api/pair/code` (Karthik).
2. **Missing `/shared` schemas:** `VocabResponse`, `DataResponse` + delete request (`{kind: 'word'|'event'|'article', id}` vs `{all: true}`), `TutorRecap` (`/api/tutor/end`), and the `/api/tutor/reply` stream format (plain text chunks?).
3. **Casing:** specs §7.5 uses snake_case (`explanation_en`, `target_words_used`); arch §4 uses camelCase (`fsrsCard`, `articleKey`). Andrew should pick one so I match the actual zod.
4. **Highlight positioning:** `span` has no offset, so a repeated phrase is ambiguous. → I'll highlight the first not-yet-used occurrence; optional additive `start` field later.
5. **Which text the transcript shows:** spans are validated against `raw_text`. → I render **raw_text** (it's what's graded); `display_text` isn't shown.
6. **Onboarding site picking:** specs §4.3 has it in the web app; arch #4 moves it to the extension popup (arch wins). → Onboarding shows suggested sites + "add them from the Parrot popup" text only.
7. **Level → `known_assumed`:** nothing says who seeds those rows when level is saved (side effect of `PUT /api/settings`?). Karthik.
8. **Streak:** undefined. Propose: consecutive days with ≥1 event.
9. **"Delete everything" scope:** user_words, events, articles only, or also tutor_sessions/utterances/settings? plan.md DoD #4 says "tables are empty."
10. **Tutor UI ↔ pipeline seam:** nothing defines it. I'll export a `TutorView` component driven by a `TutorSessionState` prop + callbacks (`onPressStart/onPressEnd/onEnd`), local to `/web`, with a mock driver. Andrew's real hook supplies the same shape.
11. **"Now known" toast:** roadmap P3 gives it to Andrew. I build the component; his pipeline triggers it from `target_words_used[].correct` (arch #16).
12. **Settings fields:** specs §8 lists daily cap/schedule/study mode; arch §6 trims them. I follow arch's `Settings` only.
13. **`.gitignore`** doesn't exist yet; Andrew's scaffold should add `.env*`, `node_modules`, `.next`.

## Decisions (from Shravan, 1am Sat)
- **Wait for Andrew's scaffold** before step 1. Step 0 happens now; I'll pull `main` once he pushes (pull/rebase only with your OK).
- **Per-feature branches** off `main`: `shravan/shell`, `shravan/tutor-ui`, `shravan/vocab`, `shravan/onboarding`, `shravan/privacy`, `shravan/settings`, `shravan/polish`. The plan doc is committed on `shravan`. Merges happen only when you say so.
- **Sleep ~3–8am Sat.**
- **Gap defaults accepted:** static pairing code, render `raw_text`, highlight the first match, `TutorSessionState` seam defined by me. I'll post these in the team chat for Andrew and Karthik.

## Schedule
| Block | Steps | Roadmap gate |
|---|---|---|
| Sat 1–3am | 0, plus 1 if the scaffold lands (otherwise post the gaps and sleep) | P0 exit |
| Sat 8–11:30am | 1 (if not done), 2, 3, 6, 8 | P1: onboarding + vocab on mocks |
| Sat 11:30am–4pm | 4, 5, 7 | P2: tutor UI on mock stream |
| Sat 4–9pm | 9, 10, 11, 12 | P3: wired + full demo once |
| Sat 9pm–Sun 3am | 13 + bug fixes / slack | P4 freeze |
| Sun 3–7:30am | 14, rehearse | Submit 7:30 |

Step 3 (riskiest) moves up to Saturday morning, right after mocks, so the tutor highlights are proven before Phase 2.

## 3. Build plan
Steps run in schedule order (above). Each one ends with: build, test the "done when", commit on its feature branch, summary. Mocks live in `web/lib/mocks/`. `web/lib/api.ts` fetchers fall back to mocks when `NEXT_PUBLIC_USE_MOCKS=1` or the route fails (no secret in that flag).

| # | Step | Tag | ~Time | Done when… |
|---|---|---|---|---|
| 0 | **Preflight:** confirm Andrew's scaffold + `/shared` are on `main` (or agree I start in `/web/app` only), `.gitignore` covers `.env*`, post gaps 1–5 and 10 in chat | MUST | 15m | `npm run dev` serves `/web`; `git check-ignore web/.env.local` prints the path |
| 1 | **Shell:** root layout, nav (Tutor · Vocabulary · What Parrot knows · Settings · Onboarding), Tailwind tokens (colors, type scale big enough for a projector), shared `EmptyState`/`ErrorState`/`Card` | MUST | 45m | `npm run build` passes; all 5 routes render; nav works at 375px and desktop |
| 2 | **Mocks + typed fetch layer:** fixtures for CorrectionResult (incl. "la problema", a 0.5-confidence error, a span not in the text), TutorContext, vocab, data, recap, settings; `api.ts` fetchers | MUST | 30m | `tsc` passes; fixtures parse with `/shared` zod (or local mirror types marked `// TODO(demo): use @parrot/shared`) |
| 3 | **Riskiest: transcript + inline correction highlights:** filter `confidence ≥ 0.7`, locate verbatim span in raw text, highlight with correction + `explanation_en` shown inline (not hover-only, for judges); skip unfound spans; multiple/overlapping errors | MUST | 60m | "Creo que la problema es grande" highlights "la problema" → "el problema" + English reason; low-confidence and not-found errors don't render; no crash |
| 4 | **Tutor page + mock driver:** PTT (hold Space or button; idle/listening/checking/speaking states), opener caption from TutorContext, utterance list, streaming caption, `TutorSessionState` seam (#10) | MUST | 60m | Holding Space on `/tutor` plays a full scripted turn from mocks: transcript → corrections at ~1.2s → caption streams; no mic or API calls |
| 5 | **"Now known" toast + recap panel:** toast from `target_words_used.correct`; End session → recap (top 3 errors, words now known, review tomorrow) | MUST | 45m | Mock turn using "aprovechar" correctly shows toast; End shows styled recap from mock |
| 6 | **Vocabulary page (mock):** 3 lists with counts, article + English meaning, streak, per-list empty states, refetch on window focus (for demo step 4) | MUST | 45m | Renders mock with items in every list; empty mock shows 3 empty states |
| 7 | **What Parrot knows (mock):** words / events / article titles sections, per-item delete (optimistic), "Delete everything" with confirm | MUST | 45m | Deleting one row removes it; delete-all empties all sections with empty states |
| 8 | **Onboarding (mock):** 3 level cards with specs §4 descriptions, reading-in-lessons toggle + one-sentence explanation, pairing code display, "add sites in the popup" text → `PUT /api/settings` | Pairing code: MUST (setup); rest NICE | 45m | Finishing onboarding sends a valid `Settings` payload (logged under mocks) and shows the code |
| 9 | **Hand off tutor UI to Andrew:** walk him through the seam; fix mismatches when the real pipeline plugs in | MUST | 30m | Speaking a scripted sentence shows the real Haiku correction in my UI |
| 10 | **Wire vocab to `GET /api/vocab`** | MUST | 30m | With mocks off, after Karthik's seed, Mastered/Learning show DB rows; a word flipped in the tutor appears in "Your vocabulary" after a refocus |
| 11 | **Wire What Parrot knows to `GET/DELETE /api/data`** | MUST | 45m | Delete everything → Supabase tables empty for `DEMO_USER_ID`; reseed repopulates the page |
| 12 | **Settings page + wire `GET/PUT /api/settings`** (level, intensity, per-page cap, paused sites, reading toggle) | NICE | 45m | A changed setting survives reload |
| 13 | **Polish:** loading skeletons, graceful API failure (never blank, never stack trace), English everywhere, recap styling, projector check | MUST | 60m | Full §11 run on localhost; with `/api` down, every page shows a friendly state |
| 14 | **README + screenshots** (setup commands, page screenshots, word-list CC-BY-SA attribution) | MUST (ship) | 45m | README renders on GitHub with 4 screenshots + run steps |

Total ≈ 11h of building, leaving slack for integration, sleep and rehearsal.

## 4. Risks and fallbacks
| Risk | Fallback |
|---|---|
| Scaffold / `/shared` late (blocks step 1) | Build components that only touch `/web/app/(pages)` and `/web/components`, with local mirror types; don't create `package.json`/config myself unless Andrew says so |
| `/shared` changes or doesn't match my mocks | Parse every response with the zod schema at the fetch boundary so drift shows up as a clear error; mock fallback keeps pages alive |
| Tutor seam mismatch at 9pm integration | Agree on the `TutorSessionState` shape at the P2 start; keep the mock driver behind a flag as a rehearsal tool |
| API credits burned by UI | React StrictMode double-runs effects in dev, so guard `tutor/context`/session start against double calls; no polling of paid routes; use mocks while styling |
| Latency looks slow | Corrections render the moment `/correct` returns, independent of voice; show a "checking…" state at release |
| Merge conflicts | Touch only page/component files; ask before editing `layout.tsx`/Tailwind config after Andrew's scaffold; never `package.json` without announcing; small commits, merge every phase (with your OK) |
| Demo staleness (vocab doesn't update live) | Refetch on focus plus a manual refresh button |
| My Claude budget | One step per session, `/clear` between steps (plan.md asks for Sonnet) |

## 5. Verification
Each step: `npm run build` in `/web` + the step's "done when" checked in the browser at `localhost:3000`. End-to-end: run specs §11 steps 2–4 on localhost with mocks off.
