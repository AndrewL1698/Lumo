# scripts

Build and seed scripts for Parrot. Owner: Karthik.

## Word list (`build-wordlist/`)

Builds the ~3,000-lemma Spanish vocabulary in the `words` table and the extension's `extension/src/wordindex.json`.

```bash
cd scripts && npm install
npm run build-wordlist:sample   # first 2 Haiku batches, no DB write (sanity check, ~1¢)
npm run build-wordlist          # full build + seed Supabase
npm run audit-words             # second Haiku pass → build-wordlist/out/audit.json
npm run seed-words              # re-seed after hand-editing out/words.json
npm run check-words -- price money tasa   # in the list? band? cognate (tutor skips)? for picking demo pages
```

Needs `ANTHROPIC_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `web/.env.local`, and `web/db/schema.sql` applied first.

### Method

1. **Source:** top 10,000 word forms from the OpenSubtitles 2018 Spanish frequency list ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)). Subtitles reflect everyday spoken Spanish better than news or Wikipedia corpora.
2. **Filter:** drop ~170 hard-coded function words (articles, prepositions, pronouns, conjunctions, auxiliaries), numerals and non-letter tokens.
3. **Enrich (Claude Haiku 5.5, structured outputs):** batches of 100 forms are lemmatized (*tengo → tener*) and classified with part of speech, gender, singular article (*el agua*), English meanings, every English surface form a reader might see (*house/houses*, *eat/ate/eating*), and cognate/false-friend flags. Latin American usage. Function words and proper names come back as `other` and are dropped.
4. **Merge:** dedupe by lemma (most frequent form wins, English forms are unioned), rerank 1…N, keep the top 3,000. Bands: 1–500 Beginner, 501–1,500 Intermediate, 1,501–3,000 Upper-intermediate.
5. **Index:** invert `english_forms` into `{ englishForm: [lemma, …] }`, most frequent lemma first, for the extension's word matching (English↔Spanish is many-to-many).
6. **Audit:** a second, independent Haiku pass checks gender, article and false-friend flags on every noun. Disagreements are reviewed by hand. None of us is a fluent speaker, so flagged rows are also cross-checked against SpanishDict/RAE (see `docs/plan.md` §3).

7. **Overrides:** `build-wordlist/overrides.json` holds hand fixes (drops and per-lemma field changes) applied at merge time, so rebuilds don't undo them. The audit's 16 flags were cross-checked against the RAE/DLE via ChatGPT: 9 fixes applied, 6 flags rejected as real false friends, 1 junk row (`modal`) dropped. Because the source is subtitles, the top 3,000 also contained profanity, insults and anatomy words (*mierda*, *puta*, *joder*, *pendejo*, *idiota*, …). Those 19 lemmas are dropped too, so nothing vulgar is ever swapped onto a page or shown on stage. Their slots went to the next-ranked words, and `wordindex.json` was regenerated (same shape). Neutral words such as *sexo*, *tonto* and *maldición* were kept. After changing `drop`, also delete the dropped rows from `words` (and any `user_words` that point at them): `seed-words` only upserts.

Every Claude batch is cached in `build-wordlist/out/batches/`, so reruns only call Claude for missing or failed batches.

## Learner model + demo seed

```bash
npm run learner-sanity        # walks specs §6.1/§6.2 through web/lib/learner, prints PASS/FAIL
npm run seed-demo -- --dry    # print the demo state plan, no DB writes
npm run seed-demo             # wipe + reseed user_words for DEMO_USER_ID (needs seeded `words`)
```

`seed-demo` resets the demo user (`DEMO_USER_ID`) to the demo state:

- **24 `user_words`** with backdated FSRS history: 4 mastered, 6 due, 5 known (always including *problema*), 5 learning (not due), and 4 hovered on the demo article in the last ~2h: *negocio*, *mundo*, *mercado* and the stage word *empresa* (`FLIP_LEMMA`). *empresa* is left in `learning` and is the newest hover, since the tutor targets the 3 newest hovers. It flips to known live on stage.
- **Article and events:** only the NPR demo article ("Nvidia CEO Jensen Huang resigns amid spy scandal : NPR"), with one `reading` event and one `hover` per hovered word. Each hover carries the real post-swap sentence in `meta.sentence`. Old seed articles (the "Workers strike…" one) are deleted on every run.
- **One past tutor session** (yesterday) whose recap has a gender-agreement error (*la problema → el problema*, 3×). This feeds the tutor's `topErrors` and the `onWeakList` flag.
- **Settings** reset to `settingsFixture`.

`articleKey` is lowercase SHA-256 hex (UTF-8) of `` `${location.hostname}\n${document.title}` ``, the same recipe as the extension (confirmed with Naren: NPR = `59809d94…8271`). The script is idempotent: it wipes the user's `user_words` and every seed-owned row by its fixed id before writing, so it's safe after "Delete everything". Hover times are relative to now, and the tutor only looks back 24h, so **rerun it right before judging**.
HACK: `ts-fsrs` is installed here, not in `/web`, until the scaffold lands. Both commands set `NODE_PATH` so `web/lib/learner` can resolve it.

### Attribution

Word frequencies: **FrequencyWords** by Hermit Dave, derived from [OpenSubtitles 2018](http://www.opensubtitles.org/), licensed [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The derived `words` list is shared under the same licence.
