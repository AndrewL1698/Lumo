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
