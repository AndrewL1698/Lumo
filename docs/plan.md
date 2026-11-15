# Lumo: Team Plan

How we split the work and how we operate this weekend. Schedule: [`roadmap.md`](roadmap.md). Design: [`architecture.md`](architecture.md). Product spec: [`specs.md`](specs.md).

## 1. Ownership

| Person | Owns | Why this split |
|---|---|---|
| **Andrew** | Hour-0 scaffold + `/shared` contracts. The whole **voice tutor**: STT token, `/api/tutor/correct`, `/api/tutor/reply`, TTS, `/api/tutor/context`, `/api/tutor/end` recap. Final integration. Amazon-track/Bedrock decision. | Highest risk, the most Claude usage, and touches every interface. |
| **Karthik** | **Backend data + learner model**: word-list script, DB schema + seed, `ts-fsrs` state machine as pure functions, `/api/pair`, `/api/events`, `/api/candidates`, `/api/translate`, `/api/vocab`, `/api/data`, `/api/settings`, demo seed script, `/eval` accuracy script. | Pure functions and CRUD against a written spec, so it's easy to unit-test and cheap in tokens. |
| **Shravan** | **Web app UI** (React): onboarding, tutor page UI (built on mock data; Andrew wires audio), vocabulary, "What Lumo knows", settings, pairing-code screen, README screenshots. | Frontend strength. Pages are independent, so short sessions work. |
| **Naren** | **Chrome extension** (scoped; see architecture §6) + **eval/demo assets**: STT test sentences, eval sentence set, demo script, backup video, Devpost. | The extension core is bounded once the MV3 skeleton exists. Demo work is mostly non-Claude. |

Andrew is the backstop. If anyone is blocked for more than 30 minutes, say so in the team chat and Andrew picks it up or pairs.

## 2. Working agreements

### Claude Pro budget (Karthik, Shravan, Naren)
- Each folder has a `CLAUDE.md` (Andrew writes it in Phase 0). Start each task by pasting your **task brief** (files, contract, done-when) instead of letting Claude explore the repo.
- Use **Sonnet** in Claude Code, not Opus. `/clear` between tasks. Keep sessions to one task.
- Build against `/shared` types and mock data. Don't read other people's folders.
- If you hit the usage limit, hand the brief to Andrew rather than waiting out the reset.

### Contracts
- `/shared` (zod schemas + TS types) is **frozen after Phase 0**. Changes go through Andrew and get announced in chat.
- API request/response shapes come from `/shared`. Validate on both sides.

### Git
- Branch per person per feature (`karthik/events-api`, `naren/hover-card`). Make small PRs into `main` and merge often (at least once per phase).
- `main` must always build. Don't commit `.env`.
- Never commit API keys. Keys live only in `/web/.env.local` on the server side.

### Communication
- Post in the team chat at each phase exit: done / blocked / cut.
- Any scope cut follows the cut order in `roadmap.md`.

## 3. No fluent Spanish speaker: how we cope
- **STT verbatim test:** two passes over the same 15 error-planted sentences. (a) ElevenLabs TTS reads them, which is a clean test of whether STT "fixes" grammar. (b) Teammates read them, which tests a real learner accent. Report the % of errors that survive in each pass.
- **Ground truth:** every planted error, its correction and every demo sentence gets a cross-check with a second Claude pass plus SpanishDict/RAE. Stored in `/eval/sentences.json`.
- **Demo:** use only scripted sentences that passed **≥5 rehearsal runs**. Keep the English explanations on screen.
- **Word-list QA:** run an automated Claude audit over all rows (gender, article, false-friend flags), then manually review the flagged rows. Optionally ask a mentor or attendee for 15 minutes (this could also count toward the Peri track).
- **Pitch angle:** "built by learners, for learners." We are the target user.

## 4. Open decisions (resolve in Phase 0/1)
| Decision | Owner | Default if undecided |
|---|---|---|
| STT provider (Scribe vs. alternative) | Andrew | Whichever preserves the most planted errors in the test |
| Does the Amazon track require AWS? | Andrew | **Resolved: no** (see `decisions.md` D-001) |
| Demo sites (2–3) | Naren | One news site + Wikipedia |
| Photon phone line? | Team, Sat 9pm | No, unless Phase 3 is done |

## 5. Definition of done (before Sun 3am freeze)
1. `npm run build` passes in `/web` and `/extension`. The learner-model sanity script walks a word through new → seen → learning → known.
2. Load the unpacked extension → pair → grant the demo site → swaps appear with articles. Hover and the Knew it / Didn't know buttons write `events` rows and update `user_words`.
3. Open the tutor → the opener references the article just read → speak a scripted sentence with a planted agreement error → the correction shows in ≤1.5s and the voice starts in ≤2s (logged). A target word used correctly flips to "known" (toast + vocab page).
4. "What Lumo knows" → delete everything → tables are empty for `DEMO_USER_ID` → reseed works.
5. `/eval` outputs precision / recall / false-alarm rate + median latencies for the pitch.
6. Full 2-minute demo on a hotspot with a headset. Backup video recorded.
