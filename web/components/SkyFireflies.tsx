"use client";
import { useEffect, useRef } from "react";

// Fireflies over the painted night (inside NightSky, behind all content). One canvas, ~50 lights:
// dense near the ground, sparse higher up, a few with a big soft halo. They drift very slowly and twinkle.
// ~30fps, paused while the tab is hidden; reduced motion draws them once, static.
type Fly = { x: number; y: number; core: number; halo: number; base: number; ax: number; ay: number; sp: number; tw: number; p1: number; p2: number; p3: number };

function makeFlies(n: number): Fly[] {
  let seed = 20261114;
  const r = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: n }, () => {
    const big = r() < 0.12;
    return {
      x: r(),
      y: 1 - Math.pow(r(), 1.7) * 0.82, // most near the bottom, a few high up
      core: big ? 2.6 + r() * 1.2 : 1 + r() * 1.6,
      halo: big ? 22 + r() * 14 : 6 + r() * 7,
      base: big ? 0.75 + r() * 0.25 : 0.45 + r() * 0.4,
      ax: 10 + r() * 26,
      ay: 6 + r() * 14,
      sp: 0.025 + r() * 0.05, // radians per second: a full drift takes minutes
      tw: 0.5 + r() * 0.9, // twinkle speed
      p1: r() * 6.28,
      p2: r() * 6.28,
      p3: r() * 6.28,
    };
  });
}

export function SkyFireflies() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let flies: Fly[] = [];

    const draw = (ms: number) => {
      const t = ms / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const f of flies) {
        const x = f.x * w + (reduce ? 0 : Math.sin(t * f.sp * 6.28 + f.p1) * f.ax);
        const y = f.y * h + (reduce ? 0 : Math.cos(t * f.sp * 5 + f.p2) * f.ay);
        const a = reduce ? f.base : f.base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * f.tw + f.p3)));
        const halo = ctx.createRadialGradient(x, y, 0, x, y, f.halo);
        halo.addColorStop(0, `rgba(255, 222, 120, ${(a * 0.42).toFixed(3)})`);
        halo.addColorStop(0.45, `rgba(255, 205, 70, ${(a * 0.14).toFixed(3)})`);
        halo.addColorStop(1, "rgba(255, 200, 60, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, f.halo, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 244, 190, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, f.core, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flies = makeFlies(w < 700 ? 30 : 52);
      draw(performance.now());
    };
    resize();
    window.addEventListener("resize", resize);
    if (reduce) return () => window.removeEventListener("resize", resize);

    let raf = 0;
    let last = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (ms - last < 33) return; // ~30fps is plenty for slow drift
      last = ms;
      draw(ms);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
