// Sanity walk through every row of specs §6.1 / §6.2. Not a test suite; just prints PASS/FAIL.
//   cd scripts && npm run learner-sanity
import { applyEvent, MASTERED_STABILITY_DAYS } from "./applyEvent";
import { emptyUserWord, type EventType, type UserWord } from "./types";
import { pickMix, toCandidate } from "./score";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

let clock = new Date("2026-11-14T12:00:00Z");
let n = 0;
function ev(w: UserWord, type: EventType, articleKey = "a1", at = clock): UserWord {
  return applyEvent(w, { id: `e${n++}`, type, lemma: w.lemma, articleKey, ts: at.toISOString() }, at);
}

// new → seen → (passive) learning
let w = emptyUserWord("casa");
w = ev(w, "seen", "a1");
check("seen: new → seen", w.state === "seen");
check("seen: no FSRS review", w.fsrsCard === null);
w = ev(w, "seen", "a1");
w = ev(w, "seen", "a1");
check("3 seens in 1 article stay seen", w.state === "seen", `seenCount=${w.seenCount}`);
w = ev(w, "seen", "a2");
check("≥3 seens across ≥2 articles → learning", w.state === "learning");
check("seen_articles deduped", w.seenArticles.length === 2);

// hover → learning with an Again review
let h = ev(emptyUserWord("perro"), "hover");
check("hover: new → learning", h.state === "learning");
check("hover: creates FSRS review + dueAt", h.fsrsCard !== null && h.dueAt !== null);
check("hover: sets lastHoverAt", h.lastHoverAt !== null);

// knew_it never makes known
let k = ev(emptyUserWord("libro"), "knew_it");
check("knew_it: new → learning (not known)", k.state === "learning");

// known only via active evidence
let q = ev(h, "quiz_pass");
check("quiz_pass → known", q.state === "known");
let s = ev(h, "speech_correct");
check("speech_correct → known", s.state === "known");

// regressions back to learning
for (const t of ["hover", "didnt_know", "quiz_fail", "speech_incorrect"] as const) {
  check(`${t}: known → learning`, ev(s, t).state === "learning");
}
check("hover: known_assumed → learning", ev({ ...emptyUserWord("agua"), state: "known_assumed" }, "hover").state === "learning");
check("speech_correct: known_assumed → known", ev({ ...emptyUserWord("agua"), state: "known_assumed" }, "speech_correct").state === "known");
check("seen does not touch known", ev(s, "seen").state === "known");

// mastered: keep using it correctly at each due date until stability ≥ 60 days
let m = s;
for (let i = 0; i < 12 && m.state !== "mastered"; i++) {
  clock = new Date(m.dueAt!);
  m = ev(m, "speech_correct", "a1", clock);
}
check(`known → mastered at stability ≥ ${MASTERED_STABILITY_DAYS}d`, m.state === "mastered", `stability=${m.fsrsCard?.stability.toFixed(1)}`);
check("mastered → learning on didnt_know", ev(m, "didnt_know", "a1", clock).state === "learning");

// reading is a no-op
check("reading: no change", JSON.stringify(ev(w, "reading")) === JSON.stringify(w));

// scoring + 70/30 mix
const now = new Date("2026-11-14T12:00:00Z");
const words: UserWord[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ ...emptyUserWord(`rev${i}`), state: "learning" as const, dueAt: "2026-11-01T00:00:00Z" })),
  ...Array.from({ length: 10 }, (_, i) => emptyUserWord(`new${i}`)),
  { ...emptyUserWord("old"), state: "mastered" as const },
];
const cands = words.map((x) => toCandidate(x, { wordBand: 1, userBand: 1, weakList: new Set(), now }));
const picked = pickMix(cands, 10, () => 0.5);
check("mix: 7 review / 3 new", picked.filter((l) => l.startsWith("rev")).length === 7 && picked.filter((l) => l.startsWith("new")).length === 3, picked.join(","));
check("mix: mastered not picked when others exist", !picked.includes("old"));
check("mix: fills from other group when short", pickMix(cands.filter((c) => c.lemma.startsWith("new")), 5).length === 5);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
