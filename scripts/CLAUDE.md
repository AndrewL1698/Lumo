# /scripts — word-list build and demo seed

Owner: **Karthik**. Team rules: root `CLAUDE.md`. Specs: `docs/specs.md` §3, `docs/architecture.md` §5 and §7.

## What lives here
Only `package.json`, `tsconfig.json` and `README.md` exist now. Planned scripts:

| Script | Does |
|---|---|
| `build-wordlist.ts` | Frequency list → lemmatize + dedupe → drop function words → Haiku batches → seed `words` table, and write `extension/src/wordindex.json` (English form → lemmas). Plus a Claude audit pass (gender, article, false friend). |
| `seed-demo.ts` | Backdates FSRS history for ~20 words for `DEMO_USER_ID` so "due" and "mastered" exist in the demo. Must be safe to rerun after "delete everything". |
| `learner-sanity.ts` | Walks a word through every row of specs §6.1/§6.2 via `applyEvent` and prints each state. Not a test suite. |

## Commands
- Run: `npx tsx scripts/<name>.ts` from the repo root.
- Keys: load `web/.env.local`, e.g. `node --env-file=web/.env.local --import tsx scripts/<name>.ts`.
- Typecheck: `npx tsc -p scripts`.

## Rules that bite here
- Row shapes come from `@parrot/shared` (`Word`, `UserWord`). Parse rows with them before writing.
- Claude calls: import the helper from `web/lib/claude.ts` (the only file that imports the Anthropic SDK). Model `claude-haiku-5-5` from `MODELS` in `web/lib/config.ts`. Structured outputs, no prefill.
- DB: reuse `web/lib/db.ts` (service client). Never put keys in a script file.
- Check the frequency list's licence. CC-BY-SA lists need attribution in the README.
- Cache Claude batch results to disk so a rerun doesn't pay again.
- Only `DEMO_USER_ID` (`00000000-0000-4000-8000-000000000001`) gets seeded.

## Don't
- Don't hand-edit `extension/src/wordindex.json`; regenerate it. Tell Naren when its shape or size changes.
- Don't add a dependency with a native build step.
