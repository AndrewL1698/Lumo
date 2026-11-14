"use client";
import { useEffect, useRef, useState } from "react";

// Custom firefly cursor for every page (mounted once in app/layout.tsx). Decorative only.
// - Follows the mouse 1:1: the latest pointer position is applied once per animation frame via transform
//   (no React state per frame). pointer-events: none, so it never blocks a click.
// - Hotspot (HOT, HOT) is the firefly's head. Wings flutter (CSS, wing shapes only); the body stays still.
// - Over text fields it hides and the normal I-beam shows; over links/buttons the tail glows brighter.
// - Touch devices: not rendered. Reduced motion: no flutter, no trail. Hidden when the mouse leaves.
const HOT = 6;
const TRAIL_SIZE = 40;
const TRAIL_EVERY_MS = 35;
const TAIL = { x: 14, y: 14 }; // tail light, relative to the hotspot

const TEXT_FIELD =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, [contenteditable="true"]';
const CLICKABLE = 'a, button, summary, label, select, [role="button"], input[type="checkbox"], input[type="radio"], input[type="range"], input[type="submit"], input[type="button"]';

export function FireflyCursor() {
  const [enabled, setEnabled] = useState(false);
  const fly = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const update = () => setEnabled(fine.matches);
    update();
    fine.addEventListener("change", update);
    return () => fine.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = fly.current;
    const pool = trail.current;
    if (!el || !pool) return;
    const root = document.documentElement;
    root.classList.add("firefly-cursor"); // hides the native cursor (globals.css)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Trail: a fixed pool of dots, reused round-robin.
    const dots: HTMLDivElement[] = [];
    if (!reduce) {
      for (let i = 0; i < TRAIL_SIZE; i++) {
        const d = document.createElement("div");
        d.className = "firefly-dot";
        pool.appendChild(d);
        dots.push(d);
      }
    }
    let next = 0;
    let lastDot = 0;

    let x = -100;
    let y = -100;
    let dirty = false;
    let raf = 0;
    const frame = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      el.style.transform = `translate3d(${x - HOT}px, ${y - HOT}px, 0)`;
    };
    const setState = (state: "hidden" | "text" | "link" | "normal") => {
      if (el.dataset.state !== state) el.dataset.state = state;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      x = e.clientX;
      y = e.clientY;
      dirty = true;
      if (!raf) raf = requestAnimationFrame(frame);
      const t = e.target instanceof Element ? e.target : null;
      const overText = !!t?.closest(TEXT_FIELD);
      setState(overText ? "text" : t?.closest(CLICKABLE) ? "link" : "normal");
      const now = performance.now();
      if (dots.length && !overText && now - lastDot >= TRAIL_EVERY_MS) {
        lastDot = now;
        const d = dots[next];
        next = (next + 1) % dots.length;
        d.getAnimations().forEach((a) => a.cancel());
        d.style.transform = `translate3d(${x + TAIL.x - 3}px, ${y + TAIL.y - 3}px, 0)`;
        d.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 1300, easing: "ease-out", fill: "forwards" });
      }
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) setState("hidden"); // left the browser window
    };
    const onBlur = () => setState("hidden");
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("blur", onBlur);
      cancelAnimationFrame(raf);
      root.classList.remove("firefly-cursor");
      dots.forEach((d) => d.remove());
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={trail} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" />
      <div
        ref={fly}
        aria-hidden="true"
        data-state="hidden"
        className="firefly-cursor-el pointer-events-none fixed left-0 top-0 z-[100] h-8 w-8"
        style={{ transform: "translate3d(-100px, -100px, 0)" }}
      >
        <svg viewBox="0 0 32 32" width="32" height="32">
          {/* drawn pointing up, then turned so the head points up-left like an arrow */}
          <g transform="translate(-2 -2) rotate(-45 16 16)">
            <g transform="rotate(-28 10.6 13)">
              <ellipse className="ff-wing ff-wing-l" cx="10.6" cy="13" rx="3" ry="5.6" fill="#6fa8d6" fillOpacity=".9" stroke="#2a3a4a" strokeWidth=".7" />
            </g>
            <g transform="rotate(28 21.4 13)">
              <ellipse className="ff-wing ff-wing-r" cx="21.4" cy="13" rx="3" ry="5.6" fill="#6fa8d6" fillOpacity=".9" stroke="#2a3a4a" strokeWidth=".7" />
            </g>
            <circle className="ff-halo" cx="16" cy="22.5" r="7.6" fill="#ffe9a0" />
            <ellipse className="ff-tail" cx="16" cy="22" rx="4.2" ry="5.2" stroke="#b07d00" strokeWidth=".8" />
            <ellipse cx="16" cy="14.5" rx="3.8" ry="4.6" fill="#2a3a4a" />
            <circle cx="16" cy="8" r="3.4" fill="#2a3a4a" />
            <path d="M14.9 5.1 Q14 3.2 12.6 2.9 M17.1 5.1 Q18 3.2 19.4 2.9" fill="none" stroke="#2a3a4a" strokeWidth=".9" strokeLinecap="round" />
            <circle cx="14.7" cy="7.7" r=".9" fill="#fcfcf8" />
            <circle cx="17.3" cy="7.7" r=".9" fill="#fcfcf8" />
          </g>
        </svg>
      </div>
    </>
  );
}
