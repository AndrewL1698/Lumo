# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Intermediate learners of Latin American Spanish (college students, young professionals) who read English
news every day but don't make time to study.

Second audience during HackPrinceton Fall 2026: hackathon judges, who mostly don't speak Spanish, watching a
2-minute demo on a projector.

## Product Purpose
Turn what you read into speaking practice. A Chrome extension swaps a few English words into Spanish on sites
you allow and notes which ones you look up. A voice tutor in the web app then chats with you about that article,
in Spanish, and corrects you instantly. A word counts as known only after you use it correctly out loud.

## Positioning
Reading decides what you practise speaking. Browse-to-learn extensions stop at vocabulary; AI speaking tutors
don't know what you read. Parrot connects the two, and proof of learning is correct use in speech.

## Operating Context
- The web app pages: Tutor (push to talk, live transcript with corrections, tutor replies, recap), Vocabulary
  (Learning now, Your vocabulary, Mastered, streak), What Parrot knows (everything stored, delete one or all),
  Settings, Onboarding (level, reading toggle, pairing code).
- Demo order on stage: What Parrot knows (a glance), Tutor (about 40 seconds), Vocabulary (about 15 seconds).
- One demo account; the extension pairs with a 6-digit code.

## Capabilities and Constraints
- UI and explanations in English; Spanish is Latin American. Spanish on screen needs English nearby.
- Grade only the raw speech-to-text transcript; never grade accents or punctuation in spoken mode; show only
  corrections with confidence >= 0.7.
- Privacy is visible: per-site opt-in, a hard never-list (email, chat, banking, health, school and work tools,
  login pages), and a page that shows and deletes everything stored.
- No API keys in the browser or the extension.
- Stack: Next.js 16 App Router, Tailwind v4, TypeScript; no new dependencies.

## Evidence on Hand
- Real seeded demo data: about 24 words with real states, an NPR demo article, activity events.
- README screenshots in `docs/img/`.
- No testimonials, customers, usage numbers or accuracy/latency results yet (eval pending). None may be invented.

## Product Principles
1. Show the real thing: real transcripts, real corrections, real stored data.
2. Honest grading: what was said is shown verbatim; nothing is "fixed" silently.
3. Privacy you can see and undo.
4. English first for the viewer, Spanish where the learning happens.
