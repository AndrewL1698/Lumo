# CLAUDE.md — Parrot (HackPrinceton Fall 2026)

Shared guidance for every teammate's Claude. Planning docs live in `/docs`:
- `docs/specs.md`: product source of truth (what we're building).
- `docs/architecture.md`: technical design. **Overrides `specs.md` wherever they disagree** (§11 lists every change).
- `docs/decisions.md`: log decisions here (STT choice, etc.). Documentation deliverables are tracked at the end of `docs/roadmap.md`.
- `docs/roadmap.md`: phased schedule and per-person tasks. `docs/plan.md`: ownership and working agreements.

This file covers how we work. Update the docs instead of silently deviating.

## The clock
- **Feature freeze: Sun Nov 15, 3:00am.** After that, only bug fixes, demo polish, and the backup video.
- **Devpost submit by Sun 7:30am** (hard deadline 8:15am). Judging 9:30am.
- Milestones and the cut order are in `docs/roadmap.md`. If we're behind, cut in that order; never cut
  the items it lists under "Never cut".

**What this means for how you write code:**
- Optimize for a working 2-minute demo (docs/specs.md §11), not production. Hard-code, stub, and mock
  freely to unblock yourself. Leave `// HACK:` or `// TODO(demo):` so we can find them.
- No refactors, abstractions, or "while I'm here" cleanups. Smallest change that works.
- No unit-test suites. The only tests that matter are the §10 eval numbers in `/eval`.
- Don't add a dependency when ~20 lines will do. Never add one that needs a native build step.
- If something takes >45 min longer than expected, stop and tell the team. Don't rabbit-hole.

## Repo layout & ownership
```
/docs        specs, architecture, roadmap, plan, voice-plan
/docs/briefs one task brief per person: paste yours into Claude to start a task
/extension   Chrome MV3 extension (TypeScript, esbuild)     owner: Naren
/web         Next.js app: UI + API routes + Supabase        owner: Karthik (API/DB), Andrew (tutor), Shravan (UI)
/shared      zod schemas + TS types (the contract)          owner: Andrew; see below
/scripts     word-list build + demo seed scripts            owner: Karthik
/eval        §10 test sentences + accuracy/latency scripts  owner: Naren (sentences), Karthik (accuracy), Andrew (latency)
```
- Each folder has its own `CLAUDE.md` with its files, commands and rules. Read it before working there.
- Stay in your own area. If a change in someone else's area is needed, tell them; don't just edit.
- **`/shared` is the contract.** Changing a type there breaks other people. Keep changes additive
  (new optional fields), and post in the team chat when you change it.
- API shapes are the zod schemas in `/shared` (endpoint list in `docs/architecture.md` §9). Match them exactly.

## Git
- `main` must always run. Pull (`git pull --rebase`) before you start and before you push.
- Commit small and often, scoped to your directory. Short-lived branches are fine; merge the same
  hour, not the next day.
- Never commit `.env*`, API keys, audio recordings of teammates, or `node_modules`.
- Don't force-push `main`.
- Commits and PRs are attributed to the teammate only: no `Co-Authored-By: Claude` trailer and no
  "Generated with Claude Code" line. `.claude/settings.json` turns these off; don't add them by hand.

## Non-negotiables (these break the product or the pitch if violated)
1. **No API keys in the browser or extension.** All Claude and ElevenLabs calls go through `/web`
   API routes. Realtime STT uses a short-lived token or a backend proxy.
2. **Grade the raw transcript only.** Store the verbatim STT output separately from any display
   text. The corrector never "fixes" the learner's words (docs/specs.md §7.3), and the server drops
   any flagged span that isn't a verbatim substring of the raw transcript.
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
  **`claude-sonnet-5-5`** for the conversation lane (streaming), both at effort `low` for latency.
  Keep the model IDs in one config constant, not scattered string literals. No assistant prefill
  (it returns a 400 on these models); get JSON via structured outputs.
- Correction output must be validated JSON. Show only errors with `confidence >= 0.7`.
- ElevenLabs: Scribe Realtime (STT) + TTS with **`eleven_flash_v2_5` in dev and in the demo**
  (fastest; `eleven_turbo_v2_5` is deprecated). **STT and TTS share one credit pool.** Cache all
  repeated audio (hover-card pronunciations). Model IDs live in `web/lib/config.ts`.
- Node 24, npm workspaces, TypeScript 6.0 (pinned: typescript-eslint doesn't support 7 yet), zod 4.
- Env vars: copy the root `.env.example` to `web/.env.local` (never committed). The build and the
  stub routes work with no env set.

## Commands
Run from the repo root.
- Install: `npm install` (once, at the root; never inside a workspace).
- Build everything: `npm run build`. Lint: `npm run lint`. Format: `npm run format`.
- Web app: `npm run dev:web` → http://localhost:3000. Stub API routes return `@parrot/shared` fixtures.
- Extension: `npm run build:ext` (or `npm run watch -w extension`), then `chrome://extensions` →
  Developer mode → **Load unpacked** → `extension/dist`. Click the reload icon after each rebuild.
- Shared contracts: `npm run build -w shared` (typecheck), `npm run check-fixtures -w shared`.
- Scripts and eval: `npx tsx scripts/<name>.ts`, `npx tsx eval/<path>.ts`.

## Demo-safety habits
- Only promise behavior on the 2–3 tested demo sites; don't chase layout bugs on others.
- Anything shown on stage should degrade gracefully: if a Claude/ElevenLabs call fails, show the
  on-screen correction anyway, or skip the swap; never show a stack trace or blank page.
- Never block page load in the extension. Swaps appear only after the translate batch returns.
