"use client";
import { useEffect, useRef, useState } from "react";
import type { TutorStatus } from "@/app/tutor/session";
import { VOICE_EVENT, voiceLevel, voicePlaying } from "./voiceTap";

export type LuciReaction = "good" | "oops" | "loop" | null;

// Drives the mouth while the tutor speaks: real loudness from the voice tap when ElevenLabs audio plays,
// otherwise a gentle talking rhythm. One requestAnimationFrame loop, only while speaking.
function useLipSync(
  active: boolean,
  els: {
    smile: React.RefObject<SVGPathElement | null>;
    open: React.RefObject<SVGGElement | null>;
    lips: React.RefObject<SVGEllipseElement | null>;
    tongue: React.RefObject<SVGEllipseElement | null>;
  },
) {
  useEffect(() => {
    const apply = (open: number, round: number) => {
      const { smile, open: g, lips, tongue } = els;
      if (!smile.current || !g.current || !lips.current || !tongue.current) return;
      const closed = open < 0.1;
      smile.current.style.display = closed ? "" : "none";
      g.current.style.display = closed ? "none" : "";
      if (closed) return;
      let rx = 4.5 + 4.5 * open;
      let ry = 1.6 + 6.4 * open;
      if (round > 0.5) {
        rx = 3.6 + 2.2 * open; // "o": narrow and round
        ry = Math.max(ry, rx + 1);
      }
      lips.current.setAttribute("rx", rx.toFixed(2));
      lips.current.setAttribute("ry", ry.toFixed(2));
      tongue.current.setAttribute("rx", (rx * 0.6).toFixed(2));
      tongue.current.setAttribute("ry", (ry * 0.35).toFixed(2));
      tongue.current.setAttribute("cy", (73 + ry * 0.55).toFixed(2));
    };
    if (!active) {
      apply(0, 0);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let open = 0;
    let round = 0;
    let peak = 0.05;
    let raf = 0;
    const frame = (t: number) => {
      const lvl = voiceLevel();
      let target: number;
      let rnd: number;
      if (lvl) {
        peak = Math.max(peak * 0.995, lvl.rms, 0.01); // adapts to the voice's loudness
        const floor = Math.max(0.004, peak * 0.12); // below this counts as a pause
        target = Math.min(1, Math.max(0, (lvl.rms - floor) / (peak * 0.7)));
        rnd = lvl.low > 0.6 && target > 0.3 ? 1 : 0;
      } else {
        // Fallback: syllable-like rhythm (~4.5 per second) with a slower phrase swell.
        const s = t / 1000;
        target = Math.max(0, Math.sin(s * 9)) * (0.55 + 0.35 * Math.sin(s * 2.1 + 1));
        rnd = Math.sin(s * 1.3) > 0.8 ? 1 : 0;
      }
      open += (target - open) * (target > open ? 0.5 : 0.22); // quick to open, softer to close
      round += (rnd - round) * 0.2;
      apply(reduce ? Math.min(open, 0.15) : open, round);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      apply(0, 0);
    };
  }, [active, els]);
}

// Luci the firefly, the tutor's face. Pure SVG + CSS animations (globals.css, "Luci firefly" block).
// Decorative only: status text elsewhere carries the meaning for screen readers.
// mood follows the session status; reaction plays once after each answer (changing reactionKey replays it).
// Size comes from className (responsive), or `size` in px.
export function LuciFirefly({
  mood = "idle",
  reaction = null,
  reactionKey = 0,
  still = false,
  size,
  className = "",
}: {
  mood?: TutorStatus;
  reaction?: LuciReaction;
  reactionKey?: number;
  still?: boolean;
  size?: number;
  className?: string;
}) {
  const smileRef = useRef<SVGPathElement>(null);
  const openRef = useRef<SVGGElement>(null);
  const lipsRef = useRef<SVGEllipseElement>(null);
  const tongueRef = useRef<SVGEllipseElement>(null);
  const els = useRef({ smile: smileRef, open: openRef, lips: lipsRef, tongue: tongueRef }).current;
  // Talk while the session says "speaking", and whenever tutor audio is actually playing.
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => {
    if (still) return;
    const update = () => setVoiceOn(voicePlaying());
    update();
    window.addEventListener(VOICE_EVENT, update);
    return () => window.removeEventListener(VOICE_EVENT, update);
  }, [still]);
  useLipSync(!still && (mood === "speaking" || voiceOn), els);

  return (
    <div
      aria-hidden="true"
      className={`luci relative shrink-0 ${className}`}
      data-mood={mood}
      data-still={still ? "" : undefined}
      style={size ? { width: size, height: size } : undefined}
    >
      <div key={reactionKey} className="luci-react h-full w-full" data-react={reaction ?? undefined}>
        <svg viewBox="0 0 120 120" width="100%" height="100%" overflow="visible">
          <g className="luci-float">
            <g className="luci-lean">
              {/* tail light: a flat halo and the lamp itself */}
              <circle className="luci-halo" cx="60" cy="92" r="24" fill="#ffe9a0" />
              <ellipse className="luci-tail" cx="60" cy="90" rx="16" ry="13" fill="#ffd23a" />
              {/* wings */}
              <ellipse className="luci-wing luci-wing-l" cx="34" cy="46" rx="13" ry="21" fill="#6fa8d6" fillOpacity=".55" transform="rotate(-32 34 46)" />
              <ellipse className="luci-wing luci-wing-r" cx="86" cy="46" rx="13" ry="21" fill="#6fa8d6" fillOpacity=".55" transform="rotate(32 86 46)" />
              {/* antennae */}
              <path d="M52 40 C48 28 42 22 36 20 M68 40 C72 28 78 22 84 20" fill="none" stroke="#2a3a4a" strokeWidth="3" strokeLinecap="round" />
              <circle cx="36" cy="20" r="4" fill="#ffd23a" />
              <circle cx="84" cy="20" r="4" fill="#ffd23a" />
              {/* body */}
              <circle cx="60" cy="62" r="27" fill="#2a3a4a" />
              {/* face */}
              <g className="luci-eyes">
                <circle cx="49" cy="59" r="8.5" fill="#fcfcf8" />
                <circle cx="71" cy="59" r="8.5" fill="#fcfcf8" />
                <circle className="luci-pupil" cx="50" cy="60" r="4.6" fill="#1a2028" />
                <circle className="luci-pupil" cx="72" cy="60" r="4.6" fill="#1a2028" />
                <circle cx="51.8" cy="57.8" r="1.6" fill="#fcfcf8" />
                <circle cx="73.8" cy="57.8" r="1.6" fill="#fcfcf8" />
              </g>
              <circle cx="42" cy="70" r="3.6" fill="#f0a39a" fillOpacity=".7" />
              <circle cx="78" cy="70" r="3.6" fill="#f0a39a" fillOpacity=".7" />
              {/* mouth: a smile when closed; an open oval (wide, or round for "o") while talking */}
              <path ref={smileRef} d="M54 71 Q60 76 66 71" fill="none" stroke="#fcfcf8" strokeWidth="2.4" strokeLinecap="round" />
              <g ref={openRef} style={{ display: "none" }}>
                <ellipse ref={lipsRef} cx="60" cy="73" rx="6" ry="4" fill="#4a1f25" stroke="#fcfcf8" strokeWidth="1.6" />
                <ellipse ref={tongueRef} cx="60" cy="75" rx="3.5" ry="1.6" fill="#f0a39a" />
              </g>
            </g>
          </g>
          {/* thinking dots, shown while checking */}
          <g className="luci-think">
            <circle cx="88" cy="14" r="3.5" fill="#9a6a00" />
            <circle cx="99" cy="9" r="3.5" fill="#9a6a00" />
            <circle cx="110" cy="4" r="3.5" fill="#9a6a00" />
          </g>
          {/* sparks, shown on a good answer */}
          <g className="luci-sparks">
            <circle cx="14" cy="34" r="4" fill="#ffd23a" />
            <circle cx="106" cy="30" r="3" fill="#ffd23a" />
            <circle cx="22" cy="10" r="2.5" fill="#ffd23a" />
          </g>
        </svg>
        {reaction === "good" && (
          <span className="luci-bien absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xs bg-glow px-2 font-display text-base font-extrabold sm:text-xl text-ink">
            ¡Bien!
          </span>
        )}
      </div>
    </div>
  );
}

// Fly one spark from Luci to the "Your jar" nav link, then light the link up for a moment.
export function sparkToJar() {
  const from = document.querySelector("[data-luci-live] .luci-tail")?.getBoundingClientRect();
  const jar = document.querySelector<HTMLElement>('header a[href="/vocabulary"]');
  if (!jar) return;
  const lightJar = () => {
    jar.classList.add("jar-lit");
    setTimeout(() => jar.classList.remove("jar-lit"), 1400);
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!from || reduce) return lightJar();
  const to = jar.getBoundingClientRect();
  const spark = document.createElement("div");
  spark.setAttribute("aria-hidden", "true");
  spark.className = "pointer-events-none fixed z-[60] h-3.5 w-3.5 rounded-full bg-glow outline-2 outline-[#f2c400]";
  const x0 = from.left + from.width / 2 - 7;
  const y0 = from.top + from.height / 2 - 7;
  const dx = to.left + to.width / 2 - 7 - x0;
  const dy = to.top + to.height / 2 - 7 - y0;
  spark.style.left = `${x0}px`;
  spark.style.top = `${y0}px`;
  document.body.appendChild(spark);
  const anim = spark.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.35 + 40}px, ${dy * 0.5}px) scale(1.3)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.9 },
    ],
    { duration: 900, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
  );
  anim.onfinish = () => {
    spark.remove();
    lightJar();
  };
}
