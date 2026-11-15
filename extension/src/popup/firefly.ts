// Visual only: one Luci firefly wandering the popup (styles: .popup-fly in popup.html).
// No messages, no storage, no effect on the popup's controls: pointer-events are off and it only
// moves through empty space (the side gutters, the grass, the header gap), crossing cards briefly.
// Calm curvy legs (cubic Bézier, eased), transform only. Every few legs it lands on the Luci logo for a
// moment. Reduced motion: it just sits on the logo, glowing.

const SIZE = 24;
// The web app's cursor firefly (web/components/FireflyCursor.tsx), drawn pointing up.
const ART = `<svg viewBox="0 0 32 32" aria-hidden="true">
<g transform="rotate(-28 10.6 13)"><ellipse class="ff-wing ff-wing-l" cx="10.6" cy="13" rx="3" ry="5.6" fill="#6fa8d6" fill-opacity=".9" stroke="#2a3a4a" stroke-width=".7"/></g>
<g transform="rotate(28 21.4 13)"><ellipse class="ff-wing ff-wing-r" cx="21.4" cy="13" rx="3" ry="5.6" fill="#6fa8d6" fill-opacity=".9" stroke="#2a3a4a" stroke-width=".7"/></g>
<circle class="ff-halo" cx="16" cy="22.5" r="8.5" fill="#ffe9a0"/>
<ellipse class="ff-tail" cx="16" cy="22" rx="4.2" ry="5.2" stroke="#b07d00" stroke-width=".8"/>
<ellipse cx="16" cy="14.5" rx="3.8" ry="4.6" fill="#2a3a4a" stroke="#8fa6c4" stroke-width=".6"/>
<circle cx="16" cy="8" r="3.4" fill="#2a3a4a" stroke="#8fa6c4" stroke-width=".6"/>
<path d="M14.9 5.1 Q14 3.2 12.6 2.9 M17.1 5.1 Q18 3.2 19.4 2.9" fill="none" stroke="#2a3a4a" stroke-width=".9" stroke-linecap="round"/>
<circle cx="14.7" cy="7.7" r=".9" fill="#fcfcf8"/><circle cx="17.3" cy="7.7" r=".9" fill="#fcfcf8"/>
</svg>`;

type P = { x: number; y: number };
type Leg = { from: P; c1: P; c2: P; to: P; start: number; dur: number; toLogo: boolean };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t); // ease in-out: no sudden starts or stops
const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

function startFirefly(): void {
  const el = document.createElement("div");
  el.className = "popup-fly";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = ART;
  document.body.append(el);

  const logo = document.getElementById("luci-logo");
  /** Perched on the top edge of the logo, a little to the right. */
  const perch = (): P => {
    const r = logo?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2 - SIZE / 2 + 5, y: r.top - SIZE / 2 + 3 } : { x: 14, y: 4 };
  };

  let pos = perch();
  let angle = 0;
  const draw = (p: P, a: number) => {
    // never past the popup's edges, so it can't create sideways overflow
    const maxX = document.body.offsetWidth - SIZE;
    p = { x: Math.min(Math.max(p.x, 0), maxX), y: Math.max(p.y, 0) };
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) rotate(${a.toFixed(1)}deg)`;
  };
  draw(pos, 0);
  el.dataset.resting = "";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /** Somewhere empty: mostly the side gutters and the grass, sometimes the gap in the header. */
  const emptySpot = (): P => {
    // the popup's own size (its body), not the window's
    const w = document.body.offsetWidth;
    const h = Math.min(document.body.offsetHeight, window.innerHeight);
    const pick = Math.random();
    if (pick < 0.32) return { x: rand(0, 4), y: rand(70, h - 90) }; // left gutter
    if (pick < 0.64) return { x: rand(w - SIZE - 4, w - SIZE), y: rand(70, h - 90) }; // right gutter
    if (pick < 0.9) return { x: rand(10, w - SIZE - 10), y: rand(h - 52, h - SIZE - 4) }; // over the grass
    return { x: rand(90, Math.max(100, w - 150)), y: rand(2, 12) }; // between the title and "Open Luci"
  };

  let legsUntilLogo = Math.floor(rand(3, 6));
  const newLeg = (now: number): Leg => {
    const toLogo = legsUntilLogo-- <= 0;
    if (toLogo) legsUntilLogo = Math.floor(rand(3, 6));
    const to = toLogo ? perch() : emptySpot();
    const dx = to.x - pos.x;
    const dy = to.y - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    // bend the path sideways for a lazy curve
    const nx = -dy / dist;
    const ny = dx / dist;
    const bend = rand(18, 46) * (Math.random() < 0.5 ? -1 : 1);
    return {
      from: { ...pos },
      c1: { x: pos.x + dx * 0.3 + nx * bend, y: pos.y + dy * 0.3 + ny * bend },
      c2: { x: pos.x + dx * 0.7 - nx * bend * 0.6, y: pos.y + dy * 0.7 - ny * bend * 0.6 },
      to,
      start: now,
      dur: Math.max(1800, (dist / rand(30, 42)) * 1000), // about 35 px a second
      toLogo,
    };
  };

  let leg: Leg | null = null;
  let restUntil = performance.now() + 1400; // a moment on the logo when the popup opens

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!leg) {
      // resting or hovering: a gentle bob, wings slow, head eases upright
      angle += (0 - angle) * 0.06;
      draw({ x: pos.x, y: pos.y + Math.sin(now / 520) * 0.8 }, angle);
      if (now < restUntil) return;
      leg = newLeg(now);
      delete el.dataset.resting;
    }
    const t = Math.min(1, (now - leg.start) / leg.dur);
    const e = ease(t);
    const next = {
      x: bez(leg.from.x, leg.c1.x, leg.c2.x, leg.to.x, e),
      y: bez(leg.from.y, leg.c1.y, leg.c2.y, leg.to.y, e),
    };
    const vx = next.x - pos.x;
    const vy = next.y - pos.y;
    if (Math.hypot(vx, vy) > 0.05) {
      // face where it's going (the art points up), turning smoothly rather than snapping
      const target = (Math.atan2(vy, vx) * 180) / Math.PI + 90;
      const diff = ((target - angle + 540) % 360) - 180;
      angle += diff * 0.08;
    }
    pos = next;
    draw({ x: pos.x, y: pos.y + Math.sin(now / 430) * 1.2 }, angle);
    if (t >= 1) {
      // land: a long rest on the logo, a short hover anywhere else
      restUntil = now + (leg.toLogo ? rand(2600, 4200) : rand(300, 1100));
      if (leg.toLogo) el.dataset.resting = "";
      leg = null;
    }
  };
  requestAnimationFrame(frame);
}

startFirefly();
