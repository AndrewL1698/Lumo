# CLAUDE.md — Parrot (HackPrinceton Fall 2026)

Shared guidance for every teammate's Claude. **`specs.md` is the source of truth** for product
decisions; this file covers how we work. If they disagree, specs.md wins. Update it instead of
silently deviating.

## The clock
- **Feature freeze: Sun Nov 15, 3:00am.** After that, only bug fixes, demo polish, and the backup video.
- **Devpost submit by Sun 7:30am** (hard deadline 8:15am). Judging 9:30am.
- Milestones are in specs.md §13. If we're behind, cut in this order: placement check → typed mode
  → topic packs → quiz → schedule/peek (§14).

**What this means for how you write code:**
- Optimize for a working 2-minute demo (specs.md §11), not production. Hard-code, stub, and mock
  freely to unblock yourself. Leave `// HACK:` or `// TODO(demo):` so we can find them.
- No refactors, abstractions, or "while I'm here" cleanups. Smallest change that works.
- No unit-test suites. The only tests that matter are the §10 eval numbers in `/eval`.
- Don't add a dependency when ~20 lines will do. Never add one that needs a native build step.
- If something takes >45 min longer than expected, stop and tell the team. Don't rabbit-hole.

## Repo layout & ownership
```
/extension   Chrome MV3 extension (TypeScript)              owner: A
/web         Next.js app: UI + API routes + Supabase        owner: B (API/DB), C (tutor), D (UI)
/shared      shared TS types: events, word states, correction JSON   everyone; see below
/scripts     word-list build script                         owner: B
/eval        §10 test sentences + accuracy/latency scripts  owner: C
```
- Stay in your own area. If a change in someone else's area is needed, tell them; don't just edit.
- **`/shared` is the contract.** Changing a type there breaks other people. Keep changes additive
  (new optional fields), and post in the team chat when you change it.
- API shapes are defined in specs.md §9; the correction JSON in §7.5; events in §5.6. Match them exactly.

## Git
- `main` must always run. Pull (`git pull --rebase`) before you start and before you push.
- Commit small and often, scoped to your directory. Short-lived branches are fine; merge the same
  hour, not the next day.
- Never commit `.env*`, API keys, audio recordings of teammates, or `node_modules`.
- Don't force-push `main`.

## Non-negotiables (these break the product or the pitch if violated)
1. **No API keys in the browser or extension.** All Claude and ElevenLabs calls go through `/web`
   API routes. Realtime STT uses a short-lived token or a backend proxy.
2. **Grade the raw transcript only.** Store the verbatim STT output separately from any display
   text. The corrector never "fixes" the learner's words (specs.md §7.3).
3. **Never grade accents or punctuation in spoken mode.** STT inserts them itself.
4. **Extension privacy:** no host access by default, runtime per-site permissions, and the hard
   never-list (email, chat, banking, health, Docs/Canvas/GitHub, login and form pages) is enforced
   in code even if the user allowlists them. Never send full page text, URLs history, or typed input.
5. **"Known" requires active evidence** (quiz pass or correct use in speech). Not hovering alone can
   move a word to `learning`, never to `known` (§6.1).
6. Spanish is **Latin American**; UI and explanations are in **English** (judges mostly don't speak Spanish).

## Stack & config
- TypeScript everywhere. Next.js (App Router) for `/web`; Supabase Postgres for the DB.
- Claude models: **`claude-haiku-5-5`** for the correction lane (latency ≤1.5s),
  **`claude-sonnet-5-5`** for the conversation lane (streaming). Keep the model IDs in one config
  constant, not scattered string literals.
- Correction output must be validated JSON. Show only errors with `confidence >= 0.7`.
- ElevenLabs: Scribe v2 Realtime (STT) + TTS. **STT and TTS share one credit pool.** Cache all
  repeated audio (hover-card pronunciations), use the cheapest/fastest voice model during dev, and
  switch to the best voice only for the demo.
- Env vars (in `/web/.env.local`, never committed):
  ```
  ANTHROPIC_API_KEY=
  ELEVENLABS_API_KEY=
  ELEVENLABS_VOICE_ID=
  SUPABASE_URL=
  SUPABASE_SERVICE_KEY=
  ```

## Commands
_Fill these in as each piece is scaffolded so nobody has to guess._
- Web app: `TODO`
- Extension build / load unpacked: `TODO`
- Word-list build: `TODO`
- Eval scripts: `TODO`

## Demo-safety habits
- Only promise behavior on the 2–3 tested demo sites; don't chase layout bugs on others.
- Anything shown on stage should degrade gracefully: if a Claude/ElevenLabs call fails, show the
  on-screen correction anyway, or skip the swap; never show a stack trace or blank page.
- Never block page load in the extension. Swaps appear only after the translate batch returns.
