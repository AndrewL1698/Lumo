# Luci: brand concept (proposal)

> **Now Lumo.** This proposal named the product Luci; the team later renamed it Lumo (D-028). The look and the
> firefly carried over; only the name changed.

**Status:** proposed by Karthik on Nov 14. The product is still called Parrot everywhere until the
team agrees (see D-003 in `docs/decisions.md`). Nothing in `/web` or `/extension` needs to change yet.

**See it:** open [`luci.html`](luci.html) in a browser. On GitHub, download the file and open it
locally, since GitHub shows the HTML source rather than the page. The icon is [`luci-icon.svg`](luci-icon.svg).

## The idea in one line
Luci is a firefly that lives in your browser. Swapped words glow on the page, and **how brightly a
word glows shows how well you know it.** You can't make a word glow steady by hovering. You have to
say it out loud.

Why the name works: *luciérnaga* is Spanish for firefly. Lucía is a common Spanish name, and *lucía*
also means "it shone." All of it comes from *luz*, light.

## Glow = word state
These map onto `WordState` in `shared/src/words.ts`. This is a visual layer only, with no schema change.

| `WordState` | Look | Luci's life stage |
|---|---|---|
| `new` | not swapped, no glow | none |
| `seen` | faint glow (`--glow` at 18%) | glowworm |
| `learning` | flickering glow (`--glow` at 38%) | glowworm |
| due for review (`isDue`) | same as its state, plus a cocoon badge in the vocab list | glowing cocoon |
| `known` | steady full glow | firefly |
| `mastered` | steady glow, shown as a firefly in "your jar" | firefly in the jar |

The rule from CLAUDE.md non-negotiable #5 holds: hovering can move a word to `learning` (flicker),
never to `known` (steady). Pitch line: *"Luci can't light it for you. You light it by saying it."*

## The glowworm underline (the signature animation)
Luci starts life as a glowworm. A glowworm is five glowing dots that crawl under a swapped word
while the word lights up behind it. The extension already needs a marker for swapped words, so the
glowworm *is* that marker. The CSS is in `luci.html` (`.worm`, `.lit`, `@keyframes crawl`); it's
about 15 lines with no library.

Rules:
- Play it only after the translate batch returns, so it never blocks page load.
- Play it once per word, then settle into the static glow for that word's state.
- Under `prefers-reduced-motion`, skip the crawl and show the static glow.

## Names for each screen
| Screen | Luci name |
|---|---|
| Vocabulary page | **Your jar** (*el frasco*): every known word is a firefly in it |
| Swapped words on a page | **Sparks** (*chispas*): "Luci left 8 sparks on this article" |
| Voice tutor | **Night session**: you read by day, and the fireflies come out at night |
| Pause on a site | **Lights out**. Never-list sites are "always dark" |

## Tokens
Light theme only by design: no dark backgrounds.

```css
--bg:#f6f7f2;  --surface:#ffffff; --fg:#1a2028; --muted:#5f6772; --line:#e2e3da;
--sun:#fff7d9; --sun-line:#f1e2a6;               /* warm panels */
--glow:#ffd23a; --glow-soft:#ffe9a0;             /* the word glow */
--accent:#9a6a00;                                /* text-safe amber for labels and links */
```

Fonts: **Bricolage Grotesque** (headings, 600/800) and **Inter** (body), both from Google Fonts.
Don't put text in `--glow` on white; it fails contrast. Use `--accent` for colored text.

## Who would touch what (if adopted)
- **Shravan (UI):** tokens, fonts, the jar (vocab page) and glow chips in the web app.
- **Andrew (tutor):** "Night session" copy, and the moment a word flips to `known` in the tutor
  (that word lights up steady in the transcript).
- **Naren (extension):** the glowworm underline and state-based glow on swapped words; icon PNGs
  (16/48/128) exported from `luci-icon.svg`.
