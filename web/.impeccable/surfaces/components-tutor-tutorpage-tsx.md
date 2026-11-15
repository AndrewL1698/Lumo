---
version: 1
slug: "components-tutor-tutorpage-tsx"
primary_target: "components/tutor/TutorPage.tsx"
related_targets: ["app/vocabulary/page.tsx","app/privacy/page.tsx","app/layout.tsx"]
---

Scope: the Lumo web app shell and its on-camera Operate surfaces (Tutor, Vocabulary, What Lumo knows), then home, Settings, Onboarding, footer, Privacy and Terms pages. Mode: Operate.
Audience and job: a learner practising spoken Spanish; on stage, judges reading a projector. Tasks: talk, read corrections, see words move to known, see and delete stored data.
Constraints: English UI; raw transcript shown verbatim; no behaviour changes; Tailwind only, no new dependencies.

## Direction contract
THESIS: A working practice tool, read like a corrected proof. Refuses the category default of rounded pastel chat bubbles, emoji rewards and gradient cards.
OWN-WORLD: ground #0e1013, text #e8ebef, secondary #8a929d, 1px hairlines #23272d. Colour only as verdicts: green #2f9e5b correct/known, amber #d99a1e learning/listening, red #d64545 mistake/delete. B612 text, B612 Mono for numbers and labels. Corners 2-4px, flat panels, no shadows, words instead of icons.
STORY: the viewer hears Spanish, sees exactly what was said, sees each slip struck in red with the fix set above it in green, then sees the word land in the vocabulary list.
FIRST VIEWPORT: Tutor: a thin top bar (Lumo wordmark, four text links); target words as a mono row; the conversation as a single column of hairline-separated turns, tutor turns plain, learner turns with interlinear corrections; a bottom bar pinned at the column width (aligned with the conversation it controls) holding a large flat "Hold to talk" control left, status word centre, End session right.
FORM: seed: none (pinned) "Color: background #0e1013, text off-white #e8ebef, secondary #8a929d, hairlines #23272d. Accents are only the verdict colors ... Type: B612 for text, B612 Mono for numbers and labels ... Shape: corners 2-4 px, flat panels, 1 px dividers, no shadows. Labels: words, not icons." First viewport: the user pinned the world only; the Tutor layout keeps the incumbent working screen (Operate mode: layout, navigation and controls stay the standard ones), restyled. Signature move: interlinear correction (ruby) over the verbatim transcript.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
