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
