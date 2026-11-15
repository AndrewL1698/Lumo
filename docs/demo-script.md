# Luci: Demo Script (2 minutes)

Owner: Naren. Locked after Phase 3. Only use sentences that passed ≥5 rehearsal runs. Setup: headset mic, phone hotspot, localhost, demo user seeded. **Immersion (D-019):** NPR set to **Always on for this site** in the popup (not "Try on this page", which ends on reload), then, after `seed-demo`, popup **Reset progress** → **Demo** speed. See "Immersion beat" below.

| Time | Presenter says | On screen | Fallback if it fails |
|---|---|---|---|
| 0:00 | Problem + who it's for (1 line) | | |
| 0:15 | | Demo news site with swapped Spanish words; the amber edge glow shows Luci is on | |
| 0:30 | | Hover **empresa**: translation, article, 🔊, Knew it / Didn't know | |
| 0:50 | "It planned this session before I said anything." | Open tutor; **Tonight's lesson card** is open: the article and why it was picked, the target words each with a reason, one mistake to watch. Opener references the article just read | Card absent (plan failed) → skip the line, go straight to the opener |
| 1:05 | | Speak scripted sentence 1; **correction appears on screen**. Why line here just reads _"Just talking…"_ — don't point at it yet | Show pre-recorded correction |
| 1:30 | "It caught that, and chose not to interrupt me." | Speak scripted sentence 2; **empresa** used correctly → "now known" toast, lesson card ticks it off, vocab page. **Why line now reads _"Not correcting out loud yet…"_** — point at it here | If the why line differs, drop the line and stay on the toast |
| 1:40 | "It knows *empresa* now, so the article gets more Spanish." | Switch to the NPR tab and **reload**: *empresa* is solid gold, and the page jumps from ~5% to ~40% Spanish (about 15 → 80 words). Optional: open the popup to show the number | Slow or unchanged → popup **Jump to 35** → reload (pre-warmed) |
| 1:50 | Eval numbers (precision / recall / latency), privacy line | Pitch slide | |
| 2:00 | Close | | |

### What the why line actually says, turn by turn

J1's why line is **not free text from the model** — it is one of six fixed shapes built in code
(`web/lib/tutor/policy.ts`, `WHY` + `whyLine`). There is **no "recast"** anywhere in the codebase.

**It always lags one turn.** The reply lane runs in parallel with the correction lane, so the line
under a reply is computed from the turns *before* that utterance — it can never describe the
sentence the learner just spoke (the comment on `whyLine` says exactly this). `turnIndex` only
advances in `recordCorrection`, once per learner utterance.

| turn | what the presenter does | `turnIndex` when the reply is built | why line |
|---|---|---|---|
| opener | — | 0 | _Opening with something you read today_ |
| 1:05 | sentence 1 (planted error) | 0, overridden | _Just talking: keeping the conversation going_ |
| 1:30 | sentence 2 (`empresa` used correctly) | 1 | _Not correcting out loud yet: Luci waits until a mistake comes up in two turns_ |

At 1:05 the policy's counter is still on the opener, and `finalWhy` catches that case and returns
`WHY.talking` — so there is nothing worth pointing at. By 1:30 the error from 1:05 is in
`errorCounts` at 1, which is `>= 1` but `< MIN_REPEATS`, giving the "not correcting out loud yet"
line. `steerLemma` does not pre-empt it, because that needs `turnIndex >= 2`.

**So the beat belongs at 1:30, not 1:05** — say the error once, then at 1:30 read that line out as
the point: Luci noticed and chose *not* to interrupt. A decision the judges can watch it make,
which is what the "Agentic behavior" rubric wants, and it costs no extra turns.

The **on-screen correction still appears at 1:05** — that is the correction lane, independent of
this policy. Only the spoken correction and its why line are gated.

**Getting the `Explaining out loud: '<span>' has come up <n> times` line instead** needs both gates
in `nextDirective`: `count >= MIN_REPEATS` (2) **and** `turnsSince >= MIN_TURNS_BETWEEN_CORRECTIONS`
(3). That means saying the error twice with a filler turn between — three extra turns we do not
have in 2 minutes. Not recommended; noted so the choice is deliberate.

## Scripted sentences (cross-checked with a second Claude pass + SpanishDict/RAE)

**1. Planted agreement error — spoken at 1:05.**

> **Yo creo que la problema del tráfico es muy grave.**

- Error span `la problema` → `el problema`, `error_type: agreement`.
- **Why this one:** `la problema` is the only planted error we have STT evidence for.
  `eval/stt-test/results-dev/A.json` shows all four configs (rt v2, rt v3, batch v2, batch v3)
  transcribed it **verbatim** without fixing the gender. If STT normalises the error, the
  correction never fires and the demo beat is dead — so this is the de-risked choice.
- **Only one valid correction:** `problema` is masculine, categorically (Greek `-ma` noun). No
  reading makes `la problema` acceptable.
- Rest of the sentence is clean: `es muy grave` is correct (`ser` for an inherent property;
  `está grave` would be about a person's health, not a problem).

**2. Target word used correctly — spoken at 1:30.**

> **La empresa va a construir un tren nuevo.**

- Target lemma `empresa`, the word hovered at 0:30. Used correctly, so it counts as active
  evidence and moves to `known` (specs §6.1). Hovering alone must never do that.
- **It must be `empresa`, not any swapped word.** `creditTargetWords` validates only against
  `session.context.targetWords`, so a word that is not a session target cannot flip however
  correctly it is used. The demo seed sets `empresa` up as the one that flips: it is the newest
  hover on the NPR article and is left in `learning`. (Found by Shravan; verified in
  `web/lib/tutor/targetWords.ts`.)
- `lemmaKey` strips a leading article, so saying "La empresa" credits `empresa`.
- The hover card shows the replacement with its article (`la empresa`), and the sentence opens
  with exactly that, so what the judge read at 0:30 is what they hear at 1:30.
- No planted error anywhere. The accuracy eval measured a 0% false-alarm rate on clean sentences
  (0/15), so this should draw no correction.

**Backup if the 5× pass shows STT fixing `la problema`:**

> **Mi hermana está muy cansado hoy.** → `cansado` → `cansada`

Same error type, also categorical, but unproven against STT. Use only if sentence 1 fails.

**The demo page.** The seed records `empresa` as hovered on the **NPR Jensen Huang article**, so
that is the page to open, and `company` is guaranteed to be among its swaps. **Karthik has the
exact URL the seed was built from — get it from him and paste it here.** Until that URL is written
down, this script is not locked: opening a different NPR article would break both the 0:30 hover
and the 1:30 flip.

> Demo URL: _pending from Karthik_

## Immersion beat (D-019, added Sun ~1am, Andrew; Naren to confirm the timing)

**What judges see:** the tutor turns a word "known", and the article on the next reload has more Spanish in it. The page's Spanish is driven by what the learner has proven, not by a slider.

**How the number moves:**
- Immersion % = understanding points × speed × 0.25. A known word = 2 points, a "Knew it" = 1, a hover = 0.
- After `seed-demo`: 9 known words = 18 points ≈ **5%**.
- At **Demo** speed (70×), each point after Demo was picked adds 17.5%. *empresa* turning known at 1:30 is +2 points → **~40%**.
- The percent never drops, even if a gold word gets hovered (hovering sends it back to "learning").

**Say it straight if asked:** "Demo speed compresses a week of practice into one sentence. At normal speed each known word adds a quarter of a percent."

**Setup (in this order):**
1. `npm run seed-demo -w scripts`.
2. In the popup, **Reset progress**, then **Demo**.
   - Never seed after Reset. A reseed wipes progress while the dial keeps its peak, which hides the tutor's gain.

**Pre-warm:** run the whole script once as a rehearsal. It translates exactly the ~40% page and fills the cache, so the 1:40 reload is quick. Then redo the setup above.

**Optional extra growth:** click **Knew it** on other non-gold words before the tutor (+17.5% each).
- Don't click Knew it on *empresa*: it stops counting once *empresa* is known, so it adds nothing in the end.
- At 55% and above, whole Spanish sentences appear.

## Rehearsal log

Five clean runs in a row before this script is locked. A run passes only if **every** box is true:
swaps appear and the edge glow is on · the hover card opens with audio · the lesson card is present
and names the article · sentence 1 is transcribed **verbatim** (the error is still there) · the
on-screen correction appears · the why line matches what this script says · sentence 2 flips the
word to known and ticks it off the card · the 1:40 reload shows *empresa* gold and the percent near 40%.

| Run | Date/time | Pass? | STT kept the error? | Why line seen | Issues |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
