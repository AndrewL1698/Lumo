---
name: Lumo
description: Spanish speaking practice built from what you read today.
colors:
  ink-ground: "#0e1013"
  panel: "#14171b"
  off-white-ink: "#e8ebef"
  slate-secondary: "#8a929d"
  hairline: "#23272d"
  go-green: "#2f9e5b"
  wait-amber: "#d99a1e"
  stop-red: "#d64545"
typography:
  display:
    fontFamily: "B612, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "B612, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: "B612, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
  transcript:
    fontFamily: "B612, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "B612, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "B612 Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.05em"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
spacing:
  row: "12px"
  block: "24px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.off-white-ink}"
    textColor: "{colors.ink-ground}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#c9ced5"
  button-secondary:
    backgroundColor: "{colors.ink-ground}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.ink-ground}"
    textColor: "{colors.stop-red}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  talk-button:
    backgroundColor: "{colors.off-white-ink}"
    textColor: "{colors.ink-ground}"
    rounded: "{rounded.sm}"
    height: "64px"
  talk-button-listening:
    backgroundColor: "{colors.wait-amber}"
    textColor: "{colors.ink-ground}"
  input:
    backgroundColor: "{colors.ink-ground}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
---

# Design System: Lumo

## Overview

**Creative North Star: "The Corrected Proof"**

Lumo treats what a learner says the way an editor treats a manuscript: the words are kept exactly as spoken, and every
judgement is written onto them, never in place of them. A slip is struck through in red and the correct form is set
directly above it, the way a teacher marks a page. Nothing else on screen competes with those marks.

The ground is a dark, flat instrument surface. Panels are separated by single hairlines rather than raised by shadows,
and type does the structuring: B612 for reading, B612 Mono for numbers and labels. Colour is never decoration. It only
appears when something has been judged: right, still learning, or wrong. The density is that of a working tool used
on a projector, so sizes run large and copy stays short and plain.

**Key Characteristics:**
- Verbatim transcript with interlinear corrections (red strike below, green fix above).
- Dark flat ground, 1px hairlines, no shadows, corners of 2 to 4px.
- Colour carries verdicts only.
- Words instead of icons; no emoji.
- Skeleton placeholders shaped like the content they replace.

## Colors

A near-black instrument ground with an off-white ink and three verdict signals.

### Primary
- **Go Green** (go-green): correct and known. The correction text set above a slip, "No mistakes found", the Your
  vocabulary count, "Just learned" highlights, the "Now known" notice outline, a target word once used.

### Secondary
- **Wait Amber** (wait-amber): learning and listening. The talk button while held, the Learning now count, the
  learning state on stored words, notices that something degraded (mic blocked, audio missing), rehearsal mode.

### Tertiary
- **Stop Red** (stop-red): a mistake or a destructive action. The strike through a slip, delete hovers, "Delete
  everything", error panels.

### Neutral
- **Ink Ground** (ink-ground): the page background everywhere.
- **Panel** (panel): the selected option card in Settings and Onboarding; the only lifted surface.
- **Off-White Ink** (off-white-ink): body text, headings, and the fill of the primary button.
- **Slate Secondary** (slate-secondary): explanations, subtitles, labels, dates, inactive nav links.
- **Hairline** (hairline): every divider and border, 1px.

### Named Rules
**The Verdict-Only Rule.** Green, amber and red appear only when something has been judged or is waiting on a
judgement. A neutral element never borrows a verdict colour for emphasis.

**The No-White Rule.** No surface is pure white. The brightest fill is the off-white ink, and its hover goes darker
(#c9ced5), never brighter.

## Typography

**Body Font:** B612 (with ui-sans-serif, system-ui)
**Label/Mono Font:** B612 Mono (with ui-monospace)

**Character:** B612 was drawn for cockpit displays: legible at a glance, calm under pressure. The mono cut labels
speakers, counts, states and dates, and lines numbers up with tabular figures.

### Hierarchy
- **Display** (700, 2.25rem, 1.25): the home page headline only.
- **Headline** (700, 1.875rem): page titles.
- **Title** (700, 1.25rem): section headings and list column heads.
- **Transcript** (400, 1.5rem, 1.6): what the learner said and what the tutor replied, the largest reading text.
- **Body** (400, 1rem to 1.125rem, 1.5): explanations and descriptions, kept to about 70 characters a line.
- **Label** (400, 0.75rem, 0.05em tracking, uppercase): speaker names (You, Tutor), error types, state words.

### Named Rules
**The Mono-Means-Data Rule.** B612 Mono is for numbers, labels, states and timestamps. Sentences people read are
always set in B612.

## Layout

A single centred column (max 64rem) with a 16px side gutter. The Tutor conversation narrows to 48rem and sets each turn
as a two-column row: a fixed 5rem speaker label and the content. On phones the label stacks above the content.

Lists are hairline-separated rows, not boxes. The Vocabulary page uses three equal columns joined by 1px gaps on a
hairline background, collapsing to one column on phones.

The Tutor's talk controls sit in a bar pinned to the bottom of the viewport at the column's width, so the demo never
needs scrolling; the page scrolls itself to the newest turn. On phones the bar is a single row: the talk button and End
session, with the status sentence kept for screen readers only.

Rhythm: 12px inside rows, 24px between blocks, 40px between sections, with more space above a heading than below.

## Elevation & Depth

The system is flat. There are no shadows anywhere. Depth comes from hairlines and from a single tonal step (the Panel
colour) on the selected option in a choice group.

### Named Rules
**The Flat-Ground Rule.** Nothing is raised. If two things need separating, draw a 1px hairline between them.

## Shapes

Corners are nearly square: 2px for small marks and highlights, 3px for buttons, inputs and panels, 4px at most. Borders
are always 1px. There are no circles, pills or soft cards.

## Components

### Buttons
- **Shape:** nearly square (3px).
- **Primary:** off-white fill with ink-ground text, bold; hover darkens to #c9ced5. Used for the one main action on a
  screen (Start lesson, Save, Send).
- **Secondary:** hairline border with off-white text; hover brightens the border to slate.
- **Danger:** red text with a translucent red border; hover fills faintly red. Its confirm step uses a solid red fill.
- **Focus:** a 2px off-white outline, offset 2px.
- **Motion:** colour only, 150ms. Nothing lifts, scales or glows.

### Talk Button (signature control)
A large flat bar (64px tall) labelled in words: "Hold to talk", then "Release to send" while held. Held, it turns Wait
Amber; while the tutor checks, it is disabled with a hairline outline. Holding the Space bar does the same.

### Interlinear Correction (signature component)
The learner's transcript is rendered verbatim. Each confident slip is a `<ruby>`: the slip struck through in Stop Red as
the base, the correction in Go Green B612 Mono at 0.7em set above it. Only lines that carry a correction grow taller.
Below the transcript, a hairline list repeats each fix with its error type label and a one-line English reason.

### Inputs / Fields
- **Style:** ink-ground fill, 1px hairline border, 3px corners, slate placeholder.
- **Focus:** the border brightens to slate.

### Navigation
The wordmark "Lumo" in bold, then text links in slate. The active link is off-white with a 1px underline set well
below the baseline. Hover changes colour only. On phones the links become one horizontal scroll strip beside the
wordmark.

### Notices
The "Now known" notice is a flat ink-ground panel with a Go Green 1px outline, a mono label, the word set large and one
plain sentence. It enters once (opacity and an 8px rise, 200ms, strong ease-out) because a word becoming known is a real
event, and leaves after five seconds.

## Do's and Don'ts

### Do:
- **Do** keep the learner's words verbatim and put every judgement on top of them.
- **Do** use Go Green, Wait Amber and Stop Red only for correct, learning and wrong.
- **Do** label things with words ("Delete", "Hold to talk", "Type your answer instead"), never icons.
- **Do** show loading with grey skeleton blocks shaped like the content (rows, columns, word grid, form).
- **Do** keep hover changes to colour and transitions under 300ms with an ease-out curve.

### Don't:
- **Don't** add shadows, gradients, glass, glows or rounded pill shapes.
- **Don't** use emoji, stock icon sets, unicode symbols as icons, or checkmark bullets.
- **Don't** use a pure white surface or any purple.
- **Don't** use em dashes in interface copy.
- **Don't** set Inter, Geist or Space Grotesk.
- **Don't** add a coloured stripe on the side of a box, or a small label above a heading.
