# /web — Next.js app: UI pages + API routes + Supabase

Next.js 16 App Router, Tailwind v4, React 19. Team rules: root `CLAUDE.md`. Contracts: `@parrot/shared`.

## Owners (stay in your rows)
| Who | Paths |
|---|---|
| Shravan | `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/{onboarding,tutor,progress,vocabulary,privacy,settings}/page.tsx`, `components/` |
| Karthik | `app/api/{pair,candidates,translate,events,vocab,data,settings,progress}/route.ts`, `lib/learner/`, `lib/curriculum/` (the course, D-022), `lib/db.ts` queries |
| Andrew | `app/api/{tts,stt-token,stt-batch}/route.ts`, `app/api/tutor/**`, `app/tutor-lab/`, `lib/tutor/`, `lib/claude.ts`, `lib/elevenlabs.ts`, `lib/config.ts` |

## What lives here
- `lib/config.ts`: `DEMO_USER_ID`, `MODELS`, ElevenLabs ids. Every model id comes from here.
- `lib/claude.ts`: the **only** file that imports `@anthropic-ai/sdk`.
- `lib/elevenlabs.ts`: STT token, TTS, batch STT. `lib/db.ts`: lazy Supabase service client.
- `lib/http.ts`: `parseBody` / `json` helpers for route handlers.
- `app/api/**/route.ts`: 15 stub routes that return `/shared` fixtures. Replace a stub only if you own it.

## Commands
- `npm run dev -w web` (or `npm run dev:web` from root) → http://localhost:3000
- `npm run build -w web`, `npm run typecheck -w web`, `npm run lint` (root)
- Env: copy root `.env.example` to `web/.env.local`. Never commit it.

## Rules that bite here
- **Keys are server-only.** Never read `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` or `SUPABASE_SERVICE_KEY` in a client component. Only `NEXT_PUBLIC_*` vars reach the browser.
- **All Claude calls go through `lib/claude.ts`.** Need a new call (e.g. translate)? Add a function there and tell Andrew.
- Models: `claude-haiku-5-5` (corrections, translate, word list), `claude-sonnet-5-5` (tutor reply). Effort `low`. Use `MODELS`, never string literals.
- **No assistant prefill, no `temperature`** (both return 400). Get JSON via structured outputs.
- **Raw transcript is never edited.** `utterances.raw_text` is written once; `display_text` is separate. Only `raw_text` is graded. Drop any correction span that isn't a verbatim substring of it.
- Never grade accents or punctuation in spoken mode. Show only corrections with `confidence >= 0.7`.
- Every route resolves to `DEMO_USER_ID`. No auth beyond the extension's Bearer token.
- Parse request bodies with the `/shared` schema; return the `/shared` response shape exactly. Errors use `ApiError`.
- A failed Claude/ElevenLabs/DB call must degrade (fixture, empty list, captions only), never a stack trace.
- Use relative imports in `lib/` so `/scripts` and `/eval` can import these files with `tsx`.

## Don't
- Don't edit another owner's routes, pages or `lib/` folders. Tell them.
- Don't add a client-side Supabase client or RLS. Server routes only.
