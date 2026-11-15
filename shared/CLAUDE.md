# /shared — the API contract (`@parrot/shared`)

Owner: **Andrew**. Everyone imports it; only Andrew changes it. Team rules: root `CLAUDE.md`.

## What lives here
Source-only package (no build output). Import from `@parrot/shared`.

| File | Exports (main ones) |
|---|---|
| `src/words.ts` | `WordState`, `Level`, `Band`, `PartOfSpeech`, `Word`, `UserWord`, `IsoDate` |
| `src/events.ts` | `ExtensionEventType`, `TutorEventType`, `LearnerEventType`, `ExtensionEvent`, `EventsRequest`, `EventsResponse` |
| `src/candidates.ts` | `Candidate`, `CandidatesResponse` |
| `src/translate.ts` | `TranslateRequest`, `TranslateItem`, `TranslateResponse`, `SentenceTranslateRequest`, `SentenceTranslateResponse` |
| `src/tutor.ts` | `CorrectionResult`, `CorrectRequest`, `CorrectResponse`, `TutorContext`, `TargetWord`, `WordUpdate`, `ReplyRequest`, `Recap`, `TurnTimeline`, `SttTokenResponse`, `SttBatchResponse`, ... |
| `src/settings.ts` | `Intensity`, `Settings` |
| `src/api.ts` | `ApiError`, `PairRequest/Response`, `TtsRequest`, `VocabItem`, `VocabResponse`, `DataResponse`, `DataDeleteRequest/Response`, `StoredEvent`, `StoredArticle` |
| `src/fixtures.ts` | One parsed fixture per response, e.g. `settingsFixture`, `correctResponseFixture`, `correctResponseCleanFixture`, `vocabResponseFixture`, `dataResponseFixture`, `tutorContextFixture`, `recapFixture` |
| `src/index.ts` | Re-exports everything |

Each schema is a zod object plus a same-named inferred type: `Settings.parse(x)` and `type Settings`.

## Commands
- `npm run build -w shared` — typecheck.
- `npm run check-fixtures -w shared` — parses every fixture against its schema.

## Rules
- **Frozen after Phase 0.** Need a change? Ask Andrew. Andrew makes it and posts in team chat.
- Changes are **additive only**: new optional fields, new schemas. Never rename, remove, or tighten a field.
- Every new response schema gets a fixture in `fixtures.ts`, parsed at import.
- No runtime deps besides `zod`. No Node, DOM, Next, or Chrome APIs here (both web and extension import it).
- `fsrsCard` stays opaque (`z.record`) so `/shared` never depends on `ts-fsrs`.
- Field names match the specs where they exist (`explanation_en`, `target_words_used`). Don't "fix" casing.
- Validate on both sides: the server parses requests, the client parses responses.

## Don't
- Don't edit this folder unless you are Andrew.
- Don't copy schemas into `/web` or `/extension`. Import them.
