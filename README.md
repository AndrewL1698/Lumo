# Parrot

> **Your morning reading becomes tonight's conversation lesson.**
> Parrot swaps a few English words into Spanish on sites you choose, learns which ones you don't know yet,
> and then a voice tutor chats with you about what you read, correcting you instantly like a fluent friend.
> A word only counts as learned once you use it correctly out loud.

Built for HackPrinceton Fall 2026 · Amazon track: Best Practical AI Innovation.

<!-- TODO(demo): hero screenshot of the tutor page (docs/img/tutor.png) -->

## Who it's for and the problem
**For:** intermediate learners of (Latin American) Spanish, such as college students and young professionals, who already read
English news every day but never find time to study.

**The problem:** the two kinds of tools people use don't talk to each other.
- **Browse-to-learn extensions** (Toucan and similar) swap words while you read, but stop at vocabulary. You never practise speaking.
- **AI speaking tutors** (Speak, Praktika and similar) let you talk, but they don't know what you've been reading, so the
  conversation is generic and nothing you read gets practised.

## What's different
Parrot connects reading and speaking in one loop:
1. **Read:** on a news site you've enabled, a few English words become Spanish (*the strike → la huelga*). Hover one for
   the meaning and pronunciation. Parrot notes which words you looked up.
2. **Talk:** the tutor opens with the article you just read and steers the chat toward the words you struggled with.
   You hold Space and answer in Spanish.
3. **Get corrected, instantly:** your words appear on screen with mistakes struck through, the fix in green, and a
   one-line English reason. The tutor keeps talking; it doesn't stop to lecture you.
4. **Prove it:** use a target word correctly out loud and it moves to "Your vocabulary". Seeing or hovering a word is never
   enough.

UI and explanations are in English; the Spanish is Latin American.

## How it works
```
Chrome extension (MV3)                 Web app (Next.js)
  swaps words on allowed sites           Tutor · Vocabulary · What Parrot knows · Settings
  hover cards, reading events            push-to-talk, live corrections, recap
          │  pairing token                        │
          ▼                                       ▼
        Backend: Next.js API routes  ──►  Supabase (Postgres)
        learner model + FSRS scheduler + 3,000-word Spanish list
          │                      │
          ▼                      ▼
   Claude (Anthropic)       ElevenLabs
   Haiku: corrections        Scribe: speech-to-text
   Sonnet: tutor replies     Flash v2.5: tutor voice
```

- **Two lanes per turn.** When you release the talk button, the correction (Claude Haiku, target ≤1.5 s) and the tutor's
  reply (Claude Sonnet, streamed and spoken) start in parallel, so corrections appear while the tutor is still talking.
- **Honest grading.** Only the verbatim speech-to-text transcript is graded. The server drops any flagged span that isn't
  a verbatim substring of what you said, shows only corrections with confidence ≥ 0.7, and never grades accents or
  punctuation in spoken mode (speech-to-text adds those itself).
- **Structured output.** Corrections come back as validated JSON (zod schemas shared by the web app and the extension).
- **Word list.** The 3,000 most frequent Spanish words from subtitles, common nouns first, with profanity removed
  (see [`scripts/README.md`](scripts/README.md)).

More detail: [`docs/architecture.md`](docs/architecture.md) and [`docs/voice-plan.md`](docs/voice-plan.md).

### Agentic behavior
The tutor decides how to teach on every turn instead of following a script:
- **Plans the lesson** from your own data: words you hovered today, words due for review, and the article you read.
- **Chooses how to correct.** A first-time mistake is only shown on screen while the tutor models the right form in its
  reply. It corrects out loud only when the same mistake has come up at least twice and it hasn't interrupted you in the
  last few turns.
- **Steers the conversation** toward a target word you haven't used yet, every other turn.
- **Acts on the outcome.** A target word used correctly in speech updates your learner model and moves to "known".

<!-- TODO(demo): if J1/J2 ship, mention the on-screen "why" line and the "Today's lesson" card here. -->

### Adaptive intelligence
- **Learner model with evidence levels.** Hovering a word can move it to *learning*, but only active evidence (correct use in
  speech, or a quiz pass) moves it to *known*.
- **Spaced repetition (FSRS).** Each word has its own review schedule, so words you keep forgetting come back sooner.
- **Reading shapes speaking.** What you read and looked up decides tomorrow's target words, and repeated mistakes decide
  what the tutor watches for.

## Results
<!-- TODO(demo): fill from eval/README.md once the scripts have run. Don't invent numbers. -->
| Metric | Target | Measured |
|---|---|---|
| Correction precision | | _TBD_ |
| Correction recall | | _TBD_ |
| False-alarm rate on correct sentences | | _TBD_ |
| Time to correction (median) | ≤ 1.5 s | _TBD_ |
| Time to tutor voice (median) | ≤ 2 s | _TBD_ |

Method: [`eval/README.md`](eval/README.md).

## Screenshots
<!-- TODO(demo): capture after the demo data is final and put them in docs/img/. -->
| Tutor | Vocabulary | What Parrot knows |
|---|---|---|
| _docs/img/tutor.png_ | _docs/img/vocabulary.png_ | _docs/img/privacy.png_ |

## Privacy
- **Off by default.** The extension has no site access until you turn it on for a site; Chrome asks you to confirm each one.
- **Hard never-list.** Parrot never runs on email, chat, banking, health, school and work tools (Google Docs, Canvas,
  GitHub), or login and form pages, even if you allow them. This is enforced in code.
- **Minimal data.** It never sends full page text, your browsing history, or anything you type on other sites. It stores
  the words you look up, a short activity log, article titles and websites, and your tutor transcripts.
- **You can see and delete everything.** The "What Parrot knows" page lists every stored item with a delete button, plus
  "Delete everything".
- **No keys in the browser.** All Claude and ElevenLabs calls go through server routes; the extension and the web page
  never hold an API key.

## Setup and run
Requires Node 24 and Chrome.

```bash
npm install                                   # once, at the repo root
cp .env.example web/.env.local                # then fill in the values below (never commit this file)
npm run dev:web                               # web app on http://localhost:3000
```

`web/.env.local`:
| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (server only) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Speech-to-text and the tutor's voice (server only) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Database (server only). The URL is just `https://<project>.supabase.co` |
| `DEMO_USER_ID` | The single demo account |
| `NEXT_PUBLIC_API_BASE` | Where the extension sends requests (e.g. `http://localhost:3000`) |

The pages and stub API routes also work with no keys set (they return sample data).

**Database and demo data:**
```bash
npm run seed-words -w scripts   # load the Spanish word list
npm run seed-demo -w scripts    # reset the demo account to the demo state
```

**Chrome extension:**
1. `npm run build:ext`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `extension/dist`.
3. Open the Parrot popup, enter the pairing code shown on the web app's onboarding page, then enable a news site.

## Credits
- Word frequencies: **FrequencyWords** by Hermit Dave, derived from [OpenSubtitles 2018](http://www.opensubtitles.org/),
  licensed [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The derived word list is shared under the same licence.
- Claude (Anthropic) for corrections and conversation; ElevenLabs for speech-to-text and voice.

## Team
Andrew · Karthik · Shravan · Naren
