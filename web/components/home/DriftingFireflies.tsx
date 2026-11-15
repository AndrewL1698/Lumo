// A few fireflies drifting slowly behind the home hero. Decorative (aria-hidden, no pointer events).
// Translate-only paths of 18-30s each; with reduced motion they stay put and just glow.
const FLIES = [
  { x: 6, y: 18, d: 26, delay: -3, size: 10 },
  { x: 18, y: 72, d: 22, delay: -11, size: 8 },
  { x: 34, y: 8, d: 30, delay: -7, size: 9 },
  { x: 47, y: 88, d: 24, delay: -15, size: 11 },
  { x: 58, y: 30, d: 28, delay: -2, size: 8 },
  { x: 71, y: 64, d: 20, delay: -9, size: 10 },
  { x: 84, y: 14, d: 27, delay: -18, size: 9 },
  { x: 93, y: 50, d: 23, delay: -5, size: 8 },
];

export function DriftingFireflies() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -inset-y-8 -z-10 overflow-hidden">
      {FLIES.map((f, i) => (
        <span
          key={i}
          className="home-fly absolute rounded-full"
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: f.size,
            height: f.size,
            animationDuration: `${f.d}s, ${3 + (i % 3)}s`,
            animationDelay: `${f.delay}s, ${f.delay / 3}s`,
            animationName: `home-drift-${i % 3}, home-pulse`,
          }}
        />
      ))}
    </div>
  );
}
