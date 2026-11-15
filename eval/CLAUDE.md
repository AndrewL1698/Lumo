# /eval — the §10 numbers for the pitch

Team rules: root `CLAUDE.md`. Specs: `docs/specs.md` §10. STT test design: `docs/voice-plan.md` §6.
These are the only tests we write. No unit-test suites.

## Owners
| Who | Paths |
|---|---|
| Naren | `sentences.json` (STT test set), the ~50-sentence accuracy set |
| Andrew | `stt-test/run.ts`, `stt-test/score.ts`, `stt-test/results.md`, `latency/summarize.ts`, `latency/probe.ts` |
| Karthik | correction-accuracy script (suggested: `accuracy/run.ts`) |

What exists: `accuracy/run.ts` + `accuracy/sentences.json` (50), `latency/summarize.ts`, `latency/probe.ts`,
`stt-test/run.ts` + `stt-test/score.ts`.

## Data formats
- `sentences.json`: array of `{ id, text, error_span, corrected_span, error_type }`. 15 error-planted sentences + 5 clean controls.
  - `error_span` includes a neighbouring word so it is distinctive (`"la problema"`, not `"la"`).
  - `error_type` uses the `SpokenErrorType` values from `@parrot/shared`: `conjugation`, `agreement`, `word_choice`, `word_order`, `missing_word`, `extra_word`.
  - Clean controls: `error_span`, `corrected_span`, `error_type` are `null`.
- `latency/turns.jsonl`: one `TurnTimeline` per line, appended by `/api/tutor/metrics`. Gitignored.
- `latency/probe-results/<ISO timestamp>.json`: one file per `latency/probe.ts` run (timings only, no audio).
- Audio recordings go in any `audio/` folder under `eval/` (gitignored). Never commit teammates' voices.

## Commands
- Run: `npx tsx eval/<path>.ts` from the repo root. Keys: `node --env-file=web/.env.local --import tsx eval/<path>.ts`.
- Latency probe (mic-free, needs `npm run dev:web`): `npx tsx eval/latency/probe.ts [--n 10] [--url …] [--file …] [--no-tts]`.
- Typecheck: `npx tsc -p eval`.

## Rules that bite here
- Grade only the raw transcript. Normalise (lowercase, strip punctuation and accents) only when *scoring*, never in the data.
- The accuracy script should call the running `POST /api/tutor/correct` (`CorrectRequest` → `CorrectResponse`) so it measures the real pipeline, including span validation and the 0.7 filter.
- Report: precision, recall, false-alarm rate on clean sentences; median and p90 latency.
- Cross-check every planted error and correction with a second Claude pass plus SpanishDict/RAE.

## Don't
- Don't edit `sentences.json` ids once the STT test has run on them; results refer to them.
- Don't edit `/web` from here. Need a hook into the pipeline? Ask Andrew.
