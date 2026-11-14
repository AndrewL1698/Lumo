# Brief: Andrew — scaffold, `/shared`, voice tutor, integration

Paste this whole file into a fresh Claude Code session to start a task. Then name the one task you are doing.

## Role
Andrew owns the Phase 0 scaffold and the `/shared` contracts, the whole voice tutor, and final integration. The tutor is push-to-talk: ElevenLabs Scribe for STT, a Haiku correction lane, a Sonnet conversation lane, sentence-chunked TTS, session context and recap. Andrew is also the team's backstop. Anyone blocked for more than 30 minutes hands their task to Andrew or pairs with Andrew. The detailed design and the ordered task list are in `docs/voice-plan.md`. This brief summarises it and adds the integration duties; it doesn't repeat the plan.

## Start here
- Plan: `docs/voice-plan.md` (§1 design decisions, §4 contracts, §5 prompts, §6 STT test, **§7 task list**, §8 hand-offs and cut list).
- Design: `docs/architecture.md` §8 (voice tutor), §10 (models). Rules: root `CLAUDE.md`, `web/CLAUDE.md`, `shared/CLAUDE.md`, `eval/CLAUDE.md`.
- Contracts: `shared/src/tutor.ts` (`CorrectRequest`, `CorrectResponse`, `CorrectionResult`, `TutorContext`, `TargetWord`, `WordUpdate`, `ReplyRequest`, `EndRequest`, `Recap`, `TurnTimeline`, `SttTokenResponse`, `SttBatchResponse`), `events.ts` (`TutorEventType`), `api.ts` (`TtsRequest`).
- Your files in `/web`: `lib/config.ts` (`MODELS`, `DEMO_USER_ID`, ElevenLabs ids), `lib/claude.ts`, `lib/elevenlabs.ts`, `lib/tutor/**`, `public/pcm-worklet.js`, `app/tutor-lab/page.tsx`. Routes: `app/api/{tts,stt-token,stt-batch}/route.ts` and `app/api/tutor/{context,correct,reply,end,metrics}/route.ts`.
- Your files in `/eval`: `stt-test/run.ts`, `stt-test/score.ts`, `stt-test/results.md`, `latency/summarize.ts`.

```
npm install
npm run build                          # all workspaces
npm run check-fixtures -w shared
npm run dev:web                        # http://localhost:3000, lab page at /tutor-lab?debug=1
npx tsx eval/stt-test/run.ts && npx tsx eval/stt-test/score.ts
npx tsx eval/latency/summarize.ts
```

Model settings (voice-plan §0): Haiku `claude-haiku-5-5` with `thinking: {type:"disabled"}`, effort `low`. Sonnet `claude-sonnet-5-5` with `thinking: {type:"between_tools"}`, effort `low`, streaming. No prefill, no `temperature`. Check `stop_reason` for `"refusal"`. TTS is `eleven_flash_v2_5` in dev and in the demo.

---

## Phases (task numbers are voice-plan §7)

| Phase | Tasks | Exit check for your part |
|---|---|---|
| 0 | **0** Scaffold, `/shared`, `lib/claude.ts` + `lib/elevenlabs.ts` stubs, `.env.example`, extension shell, folder `CLAUDE.md`s and these briefs | `npm run build` passes; teammates import `@parrot/shared` |
| 1 | **1** STT harness · **2** Pass A · **3** Shravan's mock + hook interface · **4** Pass B + pick provider | STT decision written into voice-plan §6 and posted |
| 2 | **5** `/api/tutor/correct` · **6** STT token, recorder, realtime, batch fallback · **7** `/api/tutor/reply` + policy · **8** TTS, chunker, audio queue, barge-in · **9** `useTutorSession` + timeline + metrics | Speak a sentence on `/tutor-lab` → corrections on screen + spoken reply; a line in `eval/latency/turns.jsonl` |
| 3 | **10** `/api/tutor/context` + opener · **11** wire Shravan's `/tutor` page · **12** target-word validation → `recordTutorEvent` → `wordUpdates` → toast | Scripted sentence flips a hovered word to `known` (toast + vocab page) |
| 4 | **13** latency pass · **14** `/api/tutor/end` recap · **15** failure drill · **16** bug bash with Karthik at the mic · then, if time allows, server side of the judge-facing extras J1 (`TurnDirective.why` → `X-Parrot-Why`) and J2 (`TutorContext.plan`) from `docs/roadmap.md` | Medians ≤1.5 s / ≤2 s (or the gap written down); demo steps 3–4 pass 5× in a row |
| Ship | Pitch numbers slide: STT survival %, precision / recall / false-alarm rate (Karthik), median latencies | Slide done before 7:30am |

Phase 0 leftovers outside the task list:
- Create the Supabase project and share keys.
- Get the Latin American voice ID from Naren (Naren's brief task 0.3; anyone free can do it) and set `ELEVENLABS_VOICE_ID` in `web/.env.local`. Needed for task 2.
- Record your own Pass B reading: you are the second reader alongside Karthik (task 4).

Cut list if behind: voice-plan §8, in order. Never cut on-screen corrections with span validation, the PTT loop with a spoken reply, or the "known" flip.

---

## Hand-offs (voice-plan §8)

| Direction | What | When |
|---|---|---|
| → Shravan | `CorrectResponse` examples (use `correctResponseFixture`, `correctResponseCleanFixture`), a mock emitting partial → final → corrections → caption stream, and the exact `useTutorSession` type: `{ status, partial, turns, targetWords, start(), pressTalk(), releaseTalk(), sendText(), end(), recap }` | Task 3 (Phase 1) |
| ← Naren | `eval/sentences.json` (15 + 5 controls); ElevenLabs balance; `meta.sentence` on hover events | Before task 2; hover meta by Phase 3 |
| ← Karthik | `applyEvent` accepting `spoken_correct` / `spoken_incorrect`; `recordTutorEvent(userId, lemma, type) → { from, to }`; `events.meta jsonb`; query helpers (recent hovers + sentence, due words, today's articles, settings, word details); seed data | Signature by end of Phase 2; data by Phase 3 start |
| ← Karthik (+ Andrew reads too) | Pass B readings (Karthik's reading decides) | Task 4 |
| ← Naren (or anyone free) | Latin American voice ID | Before task 2 |
| ← Karthik | Demo-speaker rehearsals | Phase 4 |

---

## Integration and backstop duties
- **Phase exits.** At each exit in `docs/roadmap.md`, check the exit line yourself, post done / blocked / cut, and apply the roadmap cut order if needed.
- **`main` always builds.** Merge teammates' PRs at least once per phase. Run `npm run build` and `npm run check-fixtures -w shared` after each merge.
- **Contract keeper.** All `/shared` changes go through you. Keep them additive, add a fixture for each new response, and post the change in team chat.
- **Route conformance.** When Karthik replaces a stub, curl it and parse the response with the `/shared` schema. A route that drifts from its schema breaks Shravan's or Naren's code silently.
- **Unblock.** If someone is blocked for 30+ minutes, or 45+ minutes over an estimate, take the task or pair. Teammates on Claude Pro may hand you their brief when they hit the usage limit.
- **Definition of done** (plan §5) is the final checklist before the 3:00am freeze. Run it top to bottom once Phase 3 exits.

---

## Decisions to make soon (found while writing the briefs)
1. **Pairing code source.** Onboarding shows a 6-digit code, but no endpoint or schema lets the web app get one. The briefs default to one hard-coded demo code. A `GET /api/pair` would need a new `/shared` schema.
2. **Scoring split.** Roadmap Phase 3 gives Karthik "scoring formula + 70/30 mix in candidates". But `Candidate` carries only flags, and only the extension knows which words are on the page. The briefs say Karthik computes the flags and Naren applies the weights and the mix. Confirm, and update the roadmap.
3. **Hover-card data.** The card needs the English meaning, the article and the false-friend flag, but `wordindex.json` is described as form → lemmas only. The briefs use the original English span plus the article from `replacement`, and suggest a `falseFriends` list in `wordindex.json`.
4. **Server-side never-list.** `TranslateRequest` carries no domain, so the server can only check `reading` events and the settings allowlist. Adding an optional `domain` to `TranslateRequest` is additive if you want more.
5. **Accuracy-set location.** The briefs suggest `eval/accuracy/sentences.json` (same format) so the STT test's `eval/sentences.json` stays at 20 entries.
6. **`/scripts` and `/eval` importing `web/lib`.** Karthik's scripts need `claude.ts` and `db.ts`. Keep those files free of `server-only` / Next-only imports and `@/` aliases, or give scripts another way in.
