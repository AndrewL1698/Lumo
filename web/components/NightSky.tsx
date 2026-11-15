// The painted night behind every page (mounted once in app/layout.tsx): a soft slate-to-navy-to-moss
// sky, a band of uneven grass blades, and a light paper grain. Original artwork, drawn in code.
// Decorative only: fixed, behind all content, no pointer events.

function rng(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Grass blades as tapered brush strokes (filled curves), seeded so server and client draw the same field.
const GRASS = (() => {
  const r = rng(7);
  // six grass tones as CSS variables (globals.css), so light mode can repaint the meadow
  const tones = [0, 1, 2, 3, 4, 5].map((i) => `var(--grass-${i})`);
  const blades: { d: string; fill: string; o: number }[] = [];
  for (let i = 0; i < 260; i++) {
    const x = r() * 1460 - 10;
    const h = 40 + Math.pow(r(), 1.6) * 120;
    const lean = (r() - 0.5) * 70;
    const w = 2 + r() * 3.5;
    const base = 182;
    const tipX = x + lean;
    const tipY = base - h;
    const c1x = x + lean * 0.2;
    const c1y = base - h * 0.55;
    // left edge up, right edge back down: a thin, slightly curved stroke
    const d = `M${(x - w / 2).toFixed(1)} ${base} Q${(c1x - w / 3).toFixed(1)} ${c1y.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} Q${(c1x + w / 3).toFixed(1)} ${c1y.toFixed(1)} ${(x + w / 2).toFixed(1)} ${base} Z`;
    blades.push({ d, fill: tones[Math.floor(r() * tones.length)], o: 0.3 + r() * 0.45 });
  }
  return blades;
})();

export function NightSky({ children }: { children?: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="night-sky pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="night-sky-paint absolute inset-0" />
      {children}
      <div className="night-sky-grain absolute inset-0" />
    </div>
  );
}

// The grass grows at the very bottom of the page (behind the footer), not pinned to the screen, so
// text never scrolls over the blades. Rendered last in <body>, which is position: relative.
export function Grass() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[150px] w-full"
      viewBox="0 0 1440 182"
      preserveAspectRatio="xMidYMax slice"
    >
      {GRASS.map((b, i) => (
        <path key={i} d={b.d} style={{ fill: b.fill }} fillOpacity={b.o} />
      ))}
    </svg>
  );
}
