# Parrot: Decision Log

Short entries. Newest at the bottom. Format: **ID · date · owner**, decision, why, alternatives.

---

### D-001 · Nov 14 · Andrew
**Decision:** Call Claude directly via `@anthropic-ai/sdk`. No AWS/Bedrock.
**Why:** The Amazon "Best Practical AI Innovation" track text lists no AWS or Bedrock requirement. Judging is on creativity, usefulness, technical implementation and UX.
**Alternative:** Bedrock client swap is a constructor change (architecture §8) if rules change.

### D-002 · _pending_ · Andrew
**Decision:** STT provider.
**Why:** _Fill in: % of planted errors surviving in TTS-read pass and teammate-read pass._
**Alternatives:** _Scribe v2 Realtime vs. batch fallback / other._

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
**Alternatives:** Settings page only (rejected: you'd switch tabs on stage). Takes over the settings part of Naren's task 3.3 (pending Naren's OK).

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
