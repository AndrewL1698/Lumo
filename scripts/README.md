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
```

Needs `ANTHROPIC_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `web/.env.local`, and `web/db/schema.sql` applied first.

### Method

1. **Source:** top 10,000 word forms from the OpenSubtitles 2018 Spanish frequency list ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)). Subtitles reflect everyday spoken Spanish better than news or Wikipedia corpora.
2. **Filter:** drop ~170 hard-coded function words (articles, prepositions, pronouns, conjunctions, auxiliaries), numerals and non-letter tokens.
3. **Enrich (Claude Haiku 5.5, structured outputs):** batches of 100 forms are lemmatized (*tengo → tener*) and classified with part of speech, gender, singular article (*el agua*), English meanings, every English surface form a reader might see (*house/houses*, *eat/ate/eating*), and cognate/false-friend flags. Latin American usage. Function words and proper names come back as `other` and are dropped.
4. **Merge:** dedupe by lemma (most frequent form wins, English forms are unioned), rerank 1…N, keep the top 3,000. Bands: 1–500 Beginner, 501–1,500 Intermediate, 1,501–3,000 Upper-intermediate.
5. **Index:** invert `english_forms` into `{ englishForm: [lemma, …] }`, most frequent lemma first, for the extension's word matching (English↔Spanish is many-to-many).
6. **Audit:** a second, independent Haiku pass checks gender, article and false-friend flags on every noun. Disagreements are reviewed by hand. None of us is a fluent speaker, so flagged rows are also cross-checked against SpanishDict/RAE (see `docs/plan.md` §3).

Every Claude batch is cached in `build-wordlist/out/batches/`, so reruns only call Claude for missing or failed batches.

### Attribution

Word frequencies: **FrequencyWords** by Hermit Dave, derived from [OpenSubtitles 2018](http://www.opensubtitles.org/), licensed [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The derived `words` list is shared under the same licence.
