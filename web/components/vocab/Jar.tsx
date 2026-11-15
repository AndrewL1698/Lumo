"use client";
import type { VocabItem, VocabResponse } from "@parrot/shared";
import { useMemo, useState } from "react";

// "Your jar": every word is a firefly in a glass jar, and the glow is how well you know it.
// learning = dim and flickering, known = steady, mastered = brightest. Fireflies are real buttons
// (hover or Tab to one to read it). Positions are stable per word (seeded from the lemma).

type Level = "learning" | "known" | "mastered";
type Fly = { w: VocabItem; level: Level; x: number; y: number; fresh: boolean; dur: number; delay: number };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Inside of the jar, in % of the drawing (see the SVG path below).
function inside(x: number, y: number): boolean {
  if (y < 30 || y > 90) return false;
  if (y < 40) return x > 24 && x < 76; // shoulders
  return x > 15 && x < 85;
}

function layout(words: { w: VocabItem; level: Level }[], fresh: Set<string>): Fly[] {
  const placed: Fly[] = [];
  const minD = words.length > 60 ? 5 : words.length > 30 ? 7 : 9;
  for (const { w, level } of [...words].sort((a, b) => a.w.lemma.localeCompare(b.w.lemma))) {
    const r = rng(hash(w.lemma));
    let x = 50;
    let y = 60;
    for (let tries = 0; tries < 60; tries++) {
      const cx = 15 + r() * 70;
      const cy = 30 + r() * 60;
      if (!inside(cx, cy)) continue;
      x = cx;
      y = cy;
      if (placed.every((p) => Math.hypot(p.x - cx, (p.y - cy) * 0.85) >= minD)) break;
    }
    placed.push({ w, level, x, y, fresh: fresh.has(w.lemma), dur: 7 + r() * 5, delay: -r() * 10 });
  }
  return placed;
}

const LEVEL_TEXT: Record<Level, string> = {
  learning: "Glowing faintly. You've met this word; say it correctly out loud to light it up.",
  known: "Glowing steady. You used it correctly out loud.",
  mastered: "Shining bright. You've kept remembering it for weeks.",
};

function when(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Luci will bring it up in your next session.";
  if (days === 1) return "Luci will bring it up again tomorrow.";
  if (days > 60) return `Luci will check on it in about ${Math.round(days / 30)} months.`;
  return `Luci will check on it in ${days} days.`;
}

export function Jar({ data, fresh }: { data: VocabResponse; fresh: Set<string> }) {
  const flies = useMemo(
    () =>
      layout(
        [
          ...data.learning.map((w) => ({ w, level: "learning" as const })),
          ...data.known.map((w) => ({ w, level: "known" as const })),
          ...data.mastered.map((w) => ({ w, level: "mastered" as const })),
        ],
        fresh,
      ),
    [data, fresh],
  );
  const [active, setActive] = useState<Fly | null>(null);
  const shown = active ?? flies.find((f) => f.fresh) ?? null;

  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-12">
      <div className="relative mx-auto aspect-[300/360] w-full max-w-[26rem]" onMouseLeave={() => setActive(null)}>
        <svg viewBox="0 0 300 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {/* the night inside the glass */}
          <path
            d="M100 50 L100 70 C48 84 34 112 34 150 L34 300 C34 326 56 342 90 342 L210 342 C244 342 266 326 266 300 L266 150 C266 112 252 84 200 70 L200 50 Z"
            className="jar-glass"
          />
          {/* glass outline and a shine */}
          <path
            d="M100 50 L100 70 C48 84 34 112 34 150 L34 300 C34 326 56 342 90 342 L210 342 C244 342 266 326 266 300 L266 150 C266 112 252 84 200 70 L200 50"
            fill="none"
            stroke="#8fa6b8"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path className="jar-shine" d="M56 160 C56 132 66 112 88 100" fill="none" stroke="#fcfcf8" strokeOpacity=".35" strokeWidth="6" strokeLinecap="round" />
          <path className="jar-shine" d="M56 186 L56 280" fill="none" stroke="#fcfcf8" strokeOpacity=".18" strokeWidth="6" strokeLinecap="round" />
          {/* lid with a tied string */}
          <rect x="88" y="26" width="124" height="26" rx="5" fill="#b98a4e" stroke="#8a6332" strokeWidth="3" />
          <path d="M92 40 L208 40" stroke="#8a6332" strokeWidth="2" />
          <path d="M210 40 C228 44 232 58 222 66" fill="none" stroke="#8a6332" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        {flies.map((f) => (
          <button
            key={f.w.lemma}
            type="button"
            className="jar-fly absolute -ml-3.5 -mt-3.5 grid h-7 w-7 place-items-center rounded-full"
            style={{ left: `${f.x}%`, top: `${f.y}%`, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}
            data-level={f.level}
            data-fresh={f.fresh ? "" : undefined}
            data-due={f.level !== "mastered" && f.w.dueAt && new Date(f.w.dueAt).getTime() <= Date.now() ? "" : undefined}
            data-active={shown?.w.lemma === f.w.lemma ? "" : undefined}
            aria-label={`${f.w.article ? `${f.w.article} ` : ""}${f.w.lemma}, ${f.w.english}. ${f.level === "learning" ? "Learning" : f.level === "known" ? "Known" : "Mastered"}.`}
            onMouseEnter={() => setActive(f)}
            onFocus={() => setActive(f)}
            onBlur={() => setActive(null)}
          >
            <span className="jar-light" />
          </button>
        ))}
      </div>

      <div className="min-h-48" aria-live="polite">
        {shown ? (
          <div>
            <p className="font-display text-5xl font-extrabold tracking-tight">
              {shown.w.article && <span className="mr-2 font-semibold text-muted">{shown.w.article}</span>}
              <span className={shown.level === "learning" ? "glow-learning" : "glow-known"}>{shown.w.lemma}</span>
            </p>
            <p className="mt-3 text-2xl text-ink">{shown.w.english}</p>
            <p className="mt-5 max-w-sm text-muted">{LEVEL_TEXT[shown.level]}</p>
            {shown.level !== "mastered" && when(shown.w.dueAt) && <p className="mt-1 max-w-sm text-muted">{when(shown.w.dueAt)}</p>}
            {shown.fresh && <p className="mt-4 font-display text-lg font-semibold text-ink">Just lit up in your last session.</p>}
          </div>
        ) : (
          <div>
            <p className="font-display text-3xl font-extrabold tracking-tight">Every word is a firefly.</p>
            <p className="mt-3 max-w-sm text-lg text-muted">
              The brighter it glows, the better you know it. Point at one, or press Tab, to read it.
            </p>
          </div>
        )}
        <ul className="mt-8 space-y-3" aria-label="What the glow means">
          {(
            [
              ["learning", "Learning", data.counts.learning],
              ["known", "Known", data.counts.known],
              ["mastered", "Mastered", data.counts.mastered],
            ] as const
          ).map(([level, name, n]) => (
            <li key={level} className="flex items-center gap-4">
              <span className="jar-legend grid h-8 w-8 place-items-center rounded-full bg-jar" data-level={level}>
                <span className="jar-light" />
              </span>
              <span className="text-lg">
                <span className="font-bold">{n}</span> {name.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
