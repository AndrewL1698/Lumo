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
**Official: Naren's accuracy set (`eval/accuracy/sentences.json`), 50 sentences = 35 planted errors + 15 correct controls.** Three runs on Nov 14 evening, on main `31d8e85` (with turn flags and the eval guard), against `npm run dev:web` on localhost.

| | Recall | Precision | False alarms | serverMs median / p90 |
|---|---|---|---|---|
| Run 1 | 91% (32/35) | 100% (32/32) | 0% (0/15) | 1.14 s / 1.68 s |
| Run 2 | 91% (32/35) | 100% (32/32) | 0% (0/15) | 1.05 s / 1.82 s |
| Run 3 | 91% (32/35) | 100% (32/32) | 0% (0/15) | 1.08 s / 1.75 s |
| **Reported (middle run)** | **91%** | **100%** | **0%** | **1.08 s / 1.75 s** |

- **By type (run 3):** agreement 8/8, word order 4/4, missing word 5/5, conjugation 7/8, word choice 5/6, extra word 3/4.
- **Missed in every run:** *y jugué* (a14, conjugation) and *está el sábado* (a21, ser/estar for events).
- **Missed in some runs:** *Lo tengo el libro* (a35, extra word; runs 1 and 3) and *niños dormieron* (a16, conjugation; run 2).
- **Never a false alarm:** no flag on any of the 15 correct sentences, and every flag raised was a real planted error.
- The eval doesn't change the demo user's words: `/correct` only credits words for sessions started through `/api/tutor/context` (checked: no `spoken_*` events after all 150 requests).

**Preliminary (Nov 14 afternoon, the 20 STT-test sentences, one run, before turn flags):** recall 87% (13/15), precision 100%, false alarms 0/5, serverMs median 1.0 s / p90 2.0 s. Superseded by the official set above.
