# Parrot: Decision Log

Short entries. Newest at the bottom. Format: **ID · date · owner**, decision, why, alternatives.

---

### D-001 · Nov 14 · Andrew
**Decision:** Call Claude directly via `@anthropic-ai/sdk`. No AWS/Bedrock.
**Why:** The Amazon "Best Practical AI Innovation" track text lists no AWS or Bedrock requirement. Judging is on creativity, usefulness, technical implementation and UX.
**Alternative:** Bedrock client swap is a constructor change (architecture §8) if rules change.

### D-002 · Nov 14 · Andrew
**Decision:** STT is ElevenLabs **Scribe v2 Realtime** (`scribe_v2_realtime`, manual commit on button release), with batch `scribe_v2` as the fallback when the realtime socket fails or takes longer than 1.5 s.
**Why:** Pass A (the 20 eval sentences read by the TTS voice, `eval/stt-test/results.md`): planted errors survived in 73% (11/15) on v2 realtime, 80% (12/15) on batch v2 and 67% (10/15) on v3 realtime. Clean controls stayed clean on all three (5/5). Batch beats realtime by only one sentence, under the two-sentence switch rule in voice-plan §6. Realtime commits in about 70 ms (median) against about 270 ms for batch, and the browser measures about 190 ms from release to transcript. All three configurations "fix" the same three acoustically subtle errors (*Los noticias*, *Ellos piensa*, and one more). So the demo's planted error is one that survives every configuration, such as *la problema*.
**Pending:** Pass B (a teammate reading the 15 sentences). It can change the pick only if batch wins by two or more sentences.
**Alternatives:** Batch as the main path (more verbatim on Pass A, but adds about 200 ms to every turn); v3 realtime (lowest survival).

### D-003 · _proposed_ · Karthik
**Decision:** Rename Parrot to **Luci** (firefly mascot). Glow brightness on swapped words shows `WordState`, and a glowworm underline is the swap marker. Full concept in `docs/brand/`.
**Why:** The name ties to Spanish (*luciérnaga*, *lucía* = "it shone") and makes the "known needs active evidence" rule visible on the page.
**Alternatives:** Keep Parrot. Monarca (caterpillar-to-butterfly life cycle) was the runner-up.

### D-004 · Nov 14 · Andrew
**Decision:** The tutor's English support is set by the learner's level, in the speech itself. Beginners get a Spanish–English–Spanish sandwich, yes/no or this-or-that questions, and English answer frames ("You can say: Sí, me gusta"). Intermediate is Spanish with one English hint when stuck. Upper-intermediate is Spanish only. The on-screen English stays hidden until the learner answers.
**Why:** A complete beginner understood nothing of an all-Spanish 40-word reply. Spoken scaffolding keeps them listening (on-screen English would let them read instead). Answer frames never contain a word from the learner's list, so repeating the frame can't earn "known" (the echo rule would block it anyway).
**Alternatives:** English shown on screen right away (rejected: learners read instead of listen). English fading automatically across sessions (not built; pitched as next on the roadmap). Changing the level in Settings changes the style today.
**Voice:** TTS lets Flash v2.5 detect the language for texts over 3 words (the English parts sound right and the voice is more natural; picked by ear against forced Spanish). Texts of 3 words or fewer, such as hover-card words, stay forced to Spanish so a word like "once" isn't read as English.

### D-005 · Nov 14 · Karthik
**Decision:** The number of swapped words per page is set by a **slider in the extension popup** ("Spanish words per page", 0–25). It saves to the same `perPageCap` setting as the Settings page, and reloads the current tab so the change shows at once. The extension now reads Settings from the server instead of its built-in 25.
**Why:** It shows the core idea ("more of the page turns Spanish as you improve") live on stage. The Settings slider existed, but the extension ignored it.
**Alternatives:** Settings page only (rejected: you'd switch tabs on stage). Took over the settings part of Naren's task 3.3 (agreed with Naren); merged Sat evening.

### D-006 · Nov 14 · Karthik
**Decision:** **"Grow automatically"** (popup switch, on by default): swaps per page = a starting amount + 1 per solid word (known + mastered), up to 25. Off = the slider decides. Calculated in the extension from `/api/candidates`. No contract change.
**Why:** The spec's default "Auto" intensity, in its simplest form. Visible on stage: the count goes up after the stage word flips.
**Alternatives:** A server-computed cap (needs a `/shared` change); the spec's words-per-100 densities (later).

### D-007 · Nov 14 · Karthik
**Decision:** Never-met words are picked by **difficulty band vs. the learner's level**: easier bands are skipped (assumed known, specs §4), the learner's band is preferred, and harder bands are rare. Bands come from a new generated file, `extension/src/wordbands.json` (lemma → 1/2/3), produced by `scripts/build-wordlist` next to `wordindex.json`, whose shape is unchanged.
**Why:** Before this, every never-met word scored the same, so an intermediate learner got basic and advanced words at random.
**Alternatives:** Ship all 3,000 words through `/api/candidates` (heavier) or add band to `wordindex.json` (breaks its shape).

### D-008 · Nov 14 · Karthik (data) / Andrew (prompt)
**Decision:** The tutor sees **what the learner did with each hovered word** (knew it / didn't know / just looked) plus a one-line browser summary for today, via `getTutorContextData`. Andrew decides how the tutor talks about it.
**Why:** It makes the tutor feel like it was there: "you looked up *mercado* earlier, want to try it?"

### D-009 · Nov 14 · Karthik · **deferred (post-MVP)**
**Decision:** Hint-first hover card. Hover shows the Spanish with **Knew it / Hint**. "Hint" shows a clue, then **Got it / Show me**, and "Show me" reveals the English. Scoring: knew it = strong (Good), needed a hint = medium (Hard), revealed = didn't know (Again).
**Why deferred:** It changes the hover card (never-cut) and needs a new event type in `/shared`, too risky before the 3am freeze. Hint style is still to be decided (first letters, example sentence, or category).

### D-010 · Nov 14 · Karthik (agreed with Naren and Shravan)
**Decision:** Luci polish. (1) The extension is renamed **Luci** in all visible text and uses the web app's firefly icon (16/32/48/128 px). (2) The hover card takes the Luci look: a warm card, firefly-amber accents, and a drawn speaker icon instead of the emoji. "Knew it" / "Didn't know" get a hover outline and a ~0.5 s "✓" confirmation before the card closes. The event is still sent on click, and the 500 ms rule is unchanged. (3) On What Luci knows, the Words list is split into **Learning / Known / Mastered** (plus "Seen" when there are any).
**Why:** One look across the page, the card and the web app. Clicks felt like nothing happened. One mixed grid was hard to read on stage.
**Alternatives:** Keep internal ids and console prefixes (`data-parrot`, `[parrot]`) as they are, to avoid breaking anything late.

### D-011 · Nov 14 · Andrew
**Decision:** `/api/tutor/correct` reports what kind of turn it was: `correction.flag` is `english`, `off_topic` or `unclear` (absent for a normal answer), with `spanish_version` for English turns. The tutor's "En español, por favor" behaviour is a system-prompt rule on the conversation lane, on top of D-004: the learner's level still decides how much English the tutor speaks.
**Why:** Shravan's test showed "No mistakes found" for an English answer and for an answer that made no sense. On-stage, a wrong flag on a good answer is worse than a missed one, so the prompt leans to "answered" and the server drops an `english` flag when the transcript has no English word. English and unclear turns earn no target-word credit; off-topic turns are graded and credited as usual, so the "known" flip still fires.
**Measured:** On `eval/sentences.json` the flags never fire, false alarms stay at 0 of 5, and recall is 11–12 of 15, the same as before. The corrector's median server time is about the same (1.26–1.35 s against 1.22–1.30 s).
**Alternatives:** A fine-tune (no time before the freeze; the prompt is enough). Passing the corrector's flag to the tutor (not possible for the same turn: the two lanes run in parallel).

### D-012 · Nov 14 · Andrew
**Decision:** English for the tutor's lines comes from a separate Haiku call, `POST /api/tutor/translate`, fired by the client when the reply text is complete. The hook stores it as `turn.tutorEnglish`.
**Why:** `/api/tutor/reply` is a plain-text stream that is spoken as it arrives, so it has nowhere to carry English, and adding it to the correction call would slow the 1.5 s correction. A separate call costs neither first audio nor the correction, and it also covers the opener and the last turn.
**Alternatives:** Sonnet writes English after a delimiter in the stream (anything in the stream gets spoken; needs client stripping). Translate the previous tutor line inside `/correct` (adds output tokens to the latency-critical call and never covers the last line).

### D-013 · Nov 14 · Andrew
**Decision:** Keep `language_code: "es"` on both STT paths.
**Why:** Checked with two English clips: Scribe wrote the English words down as spoken on both the realtime and the batch path (realtime puts them in quotation marks). It does not translate, so the verbatim rule (specs §7.3) holds and the corrector can see that a turn was English. The clips were synthetic voice; a real accented speaker has not been checked.

### D-014 · Nov 14 · Andrew
**Decision:** The tutor's voice is slower for beginners: ElevenLabs `voice_settings.speed` 0.8, which measured about 25% longer on Flash v2.5. Intermediate and upper-intermediate stay at the normal pace. The client sends the learner's level with each `/api/tts` call (`TtsRequest.level`, optional); the speeds are `ELEVENLABS.ttsSpeed` in `web/lib/config.ts`. Hover-card words send no level and are unchanged.
**Why:** In testing the tutor spoke too fast for a beginner, though the pace suits upper-intermediate.
**Measured:** Averages over four sentences: speed 0.9 changes nothing, 0.85 is about 19% longer, 0.8 about 25%, 0.75 about 36%. Single clips vary a lot.

### D-015 · Nov 14 · Karthik (agreed with Naren, Andrew, Shravan)
**Decision:** (1) **Clicking** a swapped word opens the hover card instantly and counts as a look-up (once per word, same as a hover). Clicking anywhere outside the card closes it. Hover still opens after 500 ms. (2) **Time-of-day greetings** from one shared list (`web/lib/greetings.ts`): a line on the home page using the learner's clock and streak ("¡Hola, night owl! 🌙 · day 3 in a row"), and the tutor's opening sentence fits the time of day via one line of session info plus the opener rule.
**Why:** Clicking is what people try first on stage. The greetings make Luci feel like it knows you.
**Note:** The tutor uses the server's clock, which is the learner's on the localhost demo. A hosted version would send the browser's time.

### D-016 · Nov 14 · Karthik (heads-up to Naren and Shravan)
**Decision:** (1) Swapped words in the extension glow by word state, using the web app's three lights: **faint** = only came across it (never met / seen), **flickering** = learning (hovered or looked up), **solid bright** = known or mastered. A look-up turns a faint word to flickering right away. Flicker is off for reduced motion. (2) On the home page, hovering or focusing *cocina*, *mesa* or *abuela* (in the sentence and in the legend) shows its meaning (*la cocina · kitchen*, …). The text is static, with no API call.
**Why:** Before this, every swap looked the same, so the page couldn't show progress. The home demo's words had no meaning, which is exactly what visitors try to hover.

### D-017 · Nov 14 · Andrew
**Decision:** Latency pass for the tutor. (1) **Prompt caching** on both lanes' system prompts (Haiku and Sonnet 5.5 cache from 512 tokens; ours are about 1,000–1,800 with the schema). (2) A **hedged corrector**: two identical Haiku calls, and the first valid answer wins. (3) The first TTS chunk can go out as soon as a sentence ends at the end of a stream delta. Server-side refusal fallbacks stay on. Production mode is not needed: run one rehearsal turn after starting the server so every route is compiled.
**Why:** The probe (`eval/latency/probe.ts`) showed where the time goes. The corrector is about 700 ms to first token plus about 450 ms writing about 120 tokens, and its slow turns are random spikes (one sample took 1.9 s to first token), which a hedge absorbs. Sonnet sends its first words at about 600–800 ms, then pauses about 300–700 ms before the rest arrives in a burst, on both the plain and fallback paths. That pause, not our code, sets the first-chunk time.
**Measured** (20 turns each, wifi, from STT final; add about 190 ms for button release): correction median/p90 1194/1517 ms → 1128/~1330 ms. Audio ready 1528/1733 ms at baseline. Caching alone left correction unchanged, and fallbacks on vs off showed no difference beyond noise. Accuracy on the 20 sentences after the hedge: recall 10/15 and 12/15, false alarms 0/5. Over 40 hedged pairs the two answers never disagreed on the error count.
**Not done:** splitting the first chunk at its first comma ("Sí," at about 650 ms instead of the full sentence at about 1.3 s). It would cut first audio by about half a second, but may leave an audible pause after the first word. Decide by ear.

### D-018 · Nov 14 · Andrew (designed by Karthik; heads-up to Naren)
**Decision:** An **immersion dial** in the extension: the demo page turns more Spanish with each reload, driven by what the learner did. (1) The service worker counts progress points from events it already sees (hover +0.5, Knew it +2, Didn't know +1), times a popup rate (1× default, 3×, 5× for the 2-minute demo). (2) The percent picks one of **four fixed steps** (`extension/src/swapBudget.ts`): under 20% is today's behaviour on today's code path; 20%+ is ~40 words, 2 per sentence, easier words included; 55%+ is ~90 words, 3 per sentence and 3 whole sentences in Spanish; 85%+ is dense words plus about 4 whole plain paragraphs in Spanish, the rest still mixed. (3) New `POST /api/translate-sentences` (Haiku, structured output, file cache like `/api/translate`) for the whole sentences and paragraphs; hovering one shows the English and sends no event. (4) **Knew it** words show **steady** (learning tint, no flicker), tracked locally in the extension; Didn't know words flicker; solid stays for proven-known words. Knew it still never changes word state (§6.1). (5) The popup shows the percent, the rate, Reset progress, and "jump to" 0/35/70/100 buttons (pre-warm and stage fallback). "Grow automatically" off = the 0–25 slider with today's rules.
**Privacy:** at the top step nearly every body sentence of the page is sent to our server (each swapped word sends its sentence for context, plus whole paragraphs). It stays sentence-by-sentence, only on sites the learner enabled, with the never-list enforced and no URL. We say so if asked; `extension/CLAUDE.md` is reworded.
**Why:** On stage the page didn't change visibly during a 2-minute demo (cap ~14 words, one per sentence). The growth is driven by real hovers and clicks; the rate only compresses time, and we say so.
**Alternatives:** Smooth interpolation between steps (rejected: picks shift with every hover and miss the warm translate cache on stage). Raising the slider to 200 (rejected: `Settings.perPageCap` is capped at 25 in `/shared`). Showing Knew it words as solid (rejected: a self-report would look like proven knowledge).
**Update (Sat ~10pm, after the first laptop test):** (1) Every step, step 0 included, now uses one score-first picker and the shared apply code. Before, the picker filled its budget with repeats of a few high-scoring words, then threw the repeats away: on the NPR article auto mode picked 9 of 15 and the slider at 25 picked 13, so the slider looked broken. The old step-0 code also dropped a second swap in the same text node. (2) Any dial button in the popup switches "Grow automatically" back on (in slider mode the page ignores the dial, which made the buttons look dead). (3) `/api/translate` cleans each swap when serving it (`cleanSwap` in `web/lib/claude.ts`, so cached entries are fixed too): no Spanish article without an English determiner ("a smear una campaña" → "a smear campaña"), no no-op swaps ("Popular" → "Popular"), and for non-verbs the Spanish must contain the lemma's stem ("still" → "todavía" filed under *quieto* is dropped).
