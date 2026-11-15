# eval

STT verbatim test, correction-accuracy and latency scripts (specs §10, docs/voice-plan.md §6).

## Correction accuracy (Karthik)

How often the tutor's grammar checker catches a real mistake, and how often it complains about correct Spanish.

### Method
- **Sentences.** Naren's set, in the format described in `eval/CLAUDE.md`. Each "planted" sentence contains exactly one deliberate learner mistake: a gender agreement, a conjugation, word choice, a missing word, and so on. "Control" sentences are correct Spanish. Every planted mistake and its correction is cross-checked with a second Claude pass and SpanishDict/RAE.
- **The real pipeline.** Each sentence is sent to the running `POST /api/tutor/correct`, the same endpoint the tutor uses on stage, as typed input. So the numbers include the server's own safety rules. Flagged text that isn't a verbatim part of the sentence is dropped, and only flags with confidence ≥ 0.7 count, which matches what the learner sees.
- **What counts as "caught".** A planted mistake is caught if any flag overlaps its position in the sentence. Both are compared after lowercasing and removing accents and punctuation, at scoring time only; the data is never changed. Overlap by position matters, because the checker often draws the boundary differently. For example, the planted span is *que agua* and the flag is *agua es esencial*. They share *agua* at the same spot, so it counts.
- **Numbers.**
  - **Recall:** planted mistakes caught ÷ planted mistakes.
  - **Precision:** flags that hit a planted mistake ÷ all flags.
  - **False-alarm rate:** control sentences with at least one flag ÷ control sentences.
  - **Latency:** median and p90 of the server's own timing (`serverMs`) and of the full round trip.
  - Plus a per-mistake-type table.
- **Run-to-run variation.** The model isn't deterministic, so run it 2–3 times and report the middle run.

### Run it
```bash
npm run dev:web                                   # in another terminal
npx tsx eval/accuracy/run.ts                      # default: eval/sentences.json
npx tsx eval/accuracy/run.ts --file <path.json>   # e.g. the 50-sentence accuracy set
```
It prints the numbers and writes `eval/accuracy/results.json`, with every response, so misses can be inspected. The run creates throwaway session ids, and `/api/tutor/correct` doesn't record learner events for sessions it didn't start, so running the eval never changes the demo user's words.

### Results
**Official (accuracy set, ~50 sentences):** _pending Naren's set_

| | Recall | Precision | False alarms | serverMs median / p90 |
|---|---|---|---|---|
| Run 1 | | | | |
| Run 2 | | | | |
| Run 3 | | | | |

**Preliminary (Nov 14, the 20 STT-test sentences: 15 planted + 5 controls, one run):** recall 87% (13/15), precision 100% (13/13), false alarms 0% (0/5), serverMs median 1.0 s / p90 2.0 s.
- Caught every agreement (5/5) and missing-word (2/2) mistake, 4/5 conjugation and 2/3 word choice.
- Never flagged: *está mañana* (ser/estar) and *Fueron las once* (preterite vs. imperfect for telling the time).
- These are not the pitch numbers: 20 sentences is a small sample.

## Latency (Andrew)

Targets (specs §7.6): the on-screen correction within **1.5 s** of the learner releasing the talk button, and the tutor's voice within **2 s**.

### Method
- **Pitch numbers come from the browser.** Every tutor turn posts its timestamps to `/api/tutor/metrics`, which appends one line to `eval/latency/turns.jsonl` (gitignored). `npx tsx eval/latency/summarize.ts` prints median and p90 from button release to: STT final, correction shown, reply first token, first chunk, and audio start. It reports voiced and typed turns separately.
- **Tuning numbers come from the probe.** `npx tsx eval/latency/probe.ts --n 20` replays turns without a mic, the way the browser does: `/correct` and `/reply` in parallel, the real chunker, then `/api/tts` for the first chunk. Times start at STT final, so add the STT time (about 190 ms in the browser) to compare. It runs a little optimistic: no history, fixture context, later chunks and decoding not timed. Each run is saved in `eval/latency/probe-results/`.

### Results
**Browser, voiced turns** (from button release; laptop on wifi unless noted):

| Who / when | n | Correction median / p90 | Audio start median / p90 |
|---|---|---|---|
| Andrew, Sat afternoon (before tuning) | 8 | 1311 / 1999 ms | 1860 / 2306 ms |
| Shravan, Sat evening (before tuning)* | 11 | 1461 / 2115 ms | 1344 / 1873 ms |
| _After tuning, wifi_ | | _pending_ | _pending_ |
| _After tuning, phone hotspot (the demo setup)_ | | _pending_ | _pending_ |

\* His first chunk → audio gap was 8 ms, so his audio was cached or from the browser voice; his audio number is not comparable.

**Probe** (20 turns, wifi, from STT final; details in `docs/decisions.md` D-016):

| | Correction median / p90 | Reply first token | Audio ready median / p90 |
|---|---|---|---|
| Baseline | 1194 / 1517 ms | 759 ms | 1528 / 1733 ms |
| Caching + hedged corrector | 1128 / ~1330 ms | 748 ms | 1664 / 1884 ms (n=9) |

## STT verbatim test (Andrew)
Does the transcriber keep the learner's mistakes, or quietly fix them? Method: `docs/voice-plan.md` §6. Results: `eval/stt-test/results.md`. Decision: `docs/decisions.md` D-002.

| Pass A (TTS voice reads the 20 sentences) | Errors survived | Clean controls kept | Commit → transcript |
|---|---|---|---|
| Scribe v2 realtime (**in use**) | 73% (11/15) | 5/5 | 67 ms |
| Scribe v2 batch (fallback) | 80% (12/15) | 5/5 | 272 ms |
| Scribe v3 realtime | 67% (10/15) | 5/5 | 69 ms |

Pass B (a teammate's voice) is pending.
