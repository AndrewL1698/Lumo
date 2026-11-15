"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { TutorStatus } from "@/app/tutor/session";
import { MS_PER_UNIT, SHAPES, segAt, trackFor, unitsBeforeChar, type Shape, type Viseme } from "./visemes";
import { VOICE_EVENT, currentSpeech, heardVoice, voiceLevel, voicePlaying } from "./voiceTap";

export type LuciReaction = "good" | "oops" | "loop" | null;

type MouthEls = {
  line: React.RefObject<SVGPathElement | null>;
  open: React.RefObject<SVGGElement | null>;
  fill: React.RefObject<SVGPathElement | null>;
  clip: React.RefObject<SVGPathElement | null>;
  teeth: React.RefObject<SVGRectElement | null>;
  tongue: React.RefObject<SVGEllipseElement | null>;
  outline: React.RefObject<SVGPathElement | null>;
  bob: React.RefObject<HTMLDivElement | null>;
  last: { current: Shape }; // the shape currently on screen
  tween: { current: number }; // rAF id of a running blend (0 = none)
};

// Reaction faces (the body stays still; reactions use the mouth, eyes and glow).
const GRIN: Shape = { w: 8, h: 4.2, curve: 3.5, teeth: 0.6, round: 0 };
const HMM: Shape = { w: 4.2, h: 0, curve: 1.6, teeth: 0, round: 0 };

/** Blend the mouth from what's on screen to `to` over `ms` (no snapping). Cancels any running blend. */
function tweenMouth(els: MouthEls, to: Shape, ms = 160) {
  cancelAnimationFrame(els.tween.current);
  const from = { ...els.last.current };
  const t0 = performance.now();
  const step = () => {
    const x = Math.min(1, (performance.now() - t0) / ms);
    const e = 1 - (1 - x) * (1 - x) * (1 - x); // ease-out
    const p = { ...from };
    for (const k of KEYS) p[k] = from[k] + (to[k] - from[k]) * e;
    drawMouth(els, p, 0);
    els.tween.current = x < 1 ? requestAnimationFrame(step) : 0;
  };
  els.tween.current = requestAnimationFrame(step);
}

const MOUTH_Y = 71;

function drawMouth(els: MouthEls, p: Shape, bob: number) {
  els.last.current = { ...p };
  const { line, open, fill, clip, teeth, tongue } = els;
  if (!line.current || !open.current || !fill.current || !clip.current || !teeth.current || !tongue.current) return;
  // head nod: its own HTML wrapper (fixed box, fixed origin), so it never fights the float or the lean
  void bob; // the body never moves (no nod); kept in the signature for the loop's bookkeeping
  const { w, h, curve, round } = p;
  const L = (60 - w).toFixed(2);
  const R = (60 + w).toFixed(2);
  if (h < 0.7) {
    // lips together: a smile at rest, a flatter, pressed line for m/b/p
    line.current.style.display = "";
    open.current.style.display = "none";
    line.current.setAttribute("d", `M${L} ${MOUTH_Y} Q60 ${(MOUTH_Y + curve).toFixed(2)} ${R} ${MOUTH_Y}`);
    line.current.setAttribute("stroke-width", curve < 2 ? "3" : "2.4");
    return;
  }
  line.current.style.display = "none";
  open.current.style.display = "";
  // Cubic curves: control points pulled toward the corners make "o" round; inset makes wide shapes lens-like.
  const tA = h * (0.15 + 0.45 * round); // how far the top lip lifts
  const bA = h * 0.85 + curve * 0.3; // how far the bottom lip drops
  const cTop = (MOUTH_Y - tA / 0.75).toFixed(2);
  const cBot = (MOUTH_Y + bA / 0.75).toFixed(2);
  const ix = w * (0.05 + 0.5 * (1 - round));
  const a = (60 - w + ix).toFixed(2);
  const b = (60 + w - ix).toFixed(2);
  const d = `M${L} ${MOUTH_Y} C${a} ${cTop} ${b} ${cTop} ${R} ${MOUTH_Y} C${b} ${cBot} ${a} ${cBot} ${L} ${MOUTH_Y} Z`;
  fill.current.setAttribute("d", d);
  clip.current.setAttribute("d", d);
  els.outline.current?.setAttribute("d", d);
  const top = MOUTH_Y - tA;
  const bottom = MOUTH_Y + bA;
  teeth.current.setAttribute("x", (60 - w * 0.6).toFixed(2));
  teeth.current.setAttribute("width", (w * 1.2).toFixed(2));
  teeth.current.setAttribute("y", (top - 0.5).toFixed(2));
  teeth.current.setAttribute("height", Math.min(2.4, 0.6 + h * 0.4).toFixed(2));
  teeth.current.setAttribute("opacity", p.teeth.toFixed(2));
  tongue.current.setAttribute("cy", (bottom - h * 0.12).toFixed(2));
  tongue.current.setAttribute("rx", (w * 0.55).toFixed(2));
  tongue.current.setAttribute("ry", Math.max(0.5, h * 0.22).toFixed(2));
  tongue.current.setAttribute("opacity", Math.min(1, Math.max(0, (h - 2.5) / 2)).toFixed(2));
}

const KEYS = ["w", "h", "curve", "teeth", "round"] as const;
const MIN_HOLD_MS = 60;

// Lip-sync. Timing, best source first: the clip's text spread over its real duration (ElevenLabs), the
// browser voice's word boundaries, or (no audio at all, e.g. rehearsal) the reply text at a speaking pace.
// Loudness then scales how open the mouth is, and quiet audio eases it back to rest.
// One requestAnimationFrame loop, only while Luci is talking.
function useLipSync(
  active: boolean,
  els: MouthEls,
  speechText: React.RefObject<string>,
  onTextDone: React.RefObject<() => void>,
) {
  useEffect(() => {
    if (!active) return;
    cancelAnimationFrame(els.tween.current); // lip-sync takes over from any reaction blend
    const p: Shape = { ...els.last.current };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    let last = began;
    let peak = 0.05;
    let loudS = 0; // smoothed loudness (EMA)
    let loudShown = 0; // what the mouth uses; only follows loudS past a small dead zone
    let gateOpen = false; // audio "is talking" with hysteresis, so lips don't flicker at the threshold
    let nodEnv = 0; // stressed-syllable impulse, decays
    let bob = 0; // eased nod that follows nodEnv
    let lastSeg = -1;
    let lastText = "";
    let held: Viseme = "rest"; // current shape, held for at least MIN_HOLD_MS
    let heldSince = began;
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(64, now - last);
      last = now;

      const sp = currentSpeech();
      let track = null;
      let units = -1;
      if (sp?.text) {
        track = trackFor(sp.text);
        if (sp.duration) units = ((now - sp.start) / sp.duration) * track.total;
        else if (sp.anchor) units = unitsBeforeChar(track, sp.anchor.char) + (now - sp.anchor.t) / MS_PER_UNIT;
        else units = (now - sp.start) / MS_PER_UNIT;
      } else if (!sp && !heardVoice() && speechText.current) {
        track = trackFor(speechText.current); // no audio in this session: follow the text
        units = (now - began) / MS_PER_UNIT;
        if (units >= track.total) onTextDone.current();
      }

      // loudness: normalise, smooth (fast attack, slower release), dead zone, hysteresis gate
      const lvl = voiceLevel();
      const hasLevel = !!lvl;
      if (lvl) {
        peak = Math.max(peak * 0.995, lvl.rms, 0.01);
        const floor = Math.max(0.004, peak * 0.12);
        const raw = Math.min(1, Math.max(0, (lvl.rms - floor) / (peak * 0.7)));
        loudS += (raw - loudS) * (1 - Math.exp(-dt / (raw > loudS ? 45 : 140)));
        if (Math.abs(loudS - loudShown) > 0.04) loudShown = loudS;
        if (gateOpen && loudS < 0.05) gateOpen = false;
        else if (!gateOpen && loudS > 0.12) gateOpen = true;
      }

      let want: Viseme = "rest";
      if (track) {
        const key = sp?.text ?? speechText.current;
        if (key !== lastText) {
          lastText = key;
          lastSeg = -1;
        }
        const i = segAt(track, units);
        if (i >= 0) {
          const seg = track.segs[i];
          want = seg.v;
          if (i !== lastSeg && seg.stress) nodEnv = 1; // nod on stressed syllables
        }
        lastSeg = i;
      } else if (sp && hasLevel) {
        // audio we could not match to text: pick a shape from loudness and tone
        want = loudShown > 0.55 ? (lvl!.low > 0.6 ? "ou" : "a") : loudShown > 0.25 ? "ei" : "ltn";
      }
      if (hasLevel && !gateOpen) want = "rest"; // a pause in the audio: lips close

      // each shape shows for at least MIN_HOLD_MS, so very short sounds don't flicker
      if (want !== held && now - heldSince >= MIN_HOLD_MS) {
        held = want;
        heldSince = now;
      }
      const target = SHAPES[held];
      const scale = hasLevel ? 0.5 + 0.7 * loudShown : 1;

      // ~70ms blend between shapes
      const k = 1 - Math.exp(-dt / 30);
      for (const key of KEYS) {
        const goal = key === "h" ? target.h * scale : target[key];
        p[key] += (goal - p[key]) * k;
      }
      // nod: impulse decays, the head eases toward it (no single-frame jump)
      nodEnv *= Math.exp(-dt / 180);
      bob += (nodEnv - bob) * (1 - Math.exp(-dt / 70));
      const shown = reduce ? { ...p, h: Math.min(p.h, 1.2) } : p;
      drawMouth(els, shown, reduce ? 0 : bob);
      const name = held;
      els.bob.current?.setAttribute("data-viseme", name); // debug: current mouth shape
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      tweenMouth(els, SHAPES.rest); // ease back to rest when the talking ends
      els.bob.current?.setAttribute("data-viseme", "rest");
    };
  }, [active, els, speechText, onTextDone]);
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
  speechText = "",
}: {
  speechText?: string; // the reply Luci is saying (used when there is no audio to follow)
  mood?: TutorStatus;
  reaction?: LuciReaction;
  reactionKey?: number;
  still?: boolean;
  size?: number;
  className?: string;
}) {
  const els = useRef<MouthEls>({
    line: { current: null },
    open: { current: null },
    fill: { current: null },
    clip: { current: null },
    teeth: { current: null },
    tongue: { current: null },
    outline: { current: null },
    bob: { current: null },
    last: { current: { ...SHAPES.rest } },
    tween: { current: 0 },
  }).current;
  const clipId = `luci-mouth-${useId().replace(/:/g, "")}`;
  const reactRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = reactRef.current;
    if (!el || !reaction) return;
    el.removeAttribute("data-react");
    void el.offsetWidth; // restart the one-off reaction animation only
    el.setAttribute("data-react", reaction);
  }, [reactionKey, reaction]);
  const textRef = useRef(speechText);
  useEffect(() => {
    textRef.current = speechText;
  }, [speechText]);
  // Talk while the session says "speaking", and whenever tutor audio is actually playing.
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => {
    if (still) return;
    const update = () => setVoiceOn(voicePlaying());
    update();
    window.addEventListener(VOICE_EVENT, update);
    return () => window.removeEventListener(VOICE_EVENT, update);
  }, [still]);
  // Without audio (rehearsal, or a reply whose audio failed), Luci finishes saying the reply text even if
  // the status has moved on; the loop ends this once the text is done.
  const [textTalk, setTextTalk] = useState(false);
  useEffect(() => {
    if (!still && mood === "speaking" && !heardVoice()) setTextTalk(true);
  }, [mood, still]);
  const textDone = useRef(() => setTextTalk(false));
  const talking = !still && (mood === "speaking" || voiceOn || textTalk);
  useLipSync(talking, els, textRef, textDone);
  // Reaction faces when Luci isn't talking: a grin (correct / word learned) or a gentle "hmm" (mistake).
  useEffect(() => {
    if (still || talking) return;
    tweenMouth(els, reaction === "good" || reaction === "loop" ? GRIN : reaction === "oops" ? HMM : SHAPES.rest, 200);
  }, [reaction, reactionKey, talking, still, els]);
  useEffect(() => () => cancelAnimationFrame(els.tween.current), [els]);

  return (
    <div
      aria-hidden="true"
      className={`luci relative shrink-0 ${className}`}
      data-mood={mood}
      data-still={still ? "" : undefined}
      style={size ? { width: size, height: size } : undefined}
    >
      <div className="h-full w-full">
       <div className="h-full w-full">
        <div ref={els.bob} className="h-full w-full">
         <div ref={reactRef} className="luci-react relative h-full w-full" data-react={reaction ?? undefined}>
        <svg viewBox="0 0 120 120" width="100%" height="100%" overflow="visible">
              {/* tail light: a flat halo and the lamp itself */}
              <circle className="luci-halo" cx="60" cy="92" r="24" fill="#ffd23a" />
              <ellipse className="luci-tail" cx="60" cy="90" rx="16" ry="13" fill="#ffd23a" />
              {/* wings: fixed angle on the group, the beat on the shape */}
              <g transform="rotate(-32 34 46)">
                <ellipse className="luci-wing luci-wing-l" cx="34" cy="46" rx="13" ry="21" fill="#6fa8d6" fillOpacity=".55" />
              </g>
              <g transform="rotate(32 86 46)">
                <ellipse className="luci-wing luci-wing-r" cx="86" cy="46" rx="13" ry="21" fill="#6fa8d6" fillOpacity=".55" />
              </g>
              {/* antennae */}
              <path d="M52 40 C48 28 42 22 36 20 M68 40 C72 28 78 22 84 20" fill="none" stroke="#6a7f9f" strokeWidth="3" strokeLinecap="round" />
              <circle cx="36" cy="20" r="4" fill="#ffd23a" />
              <circle cx="84" cy="20" r="4" fill="#ffd23a" />
              {/* body */}
              <circle className="luci-body" cx="60" cy="62" r="27" fill="#2a3a4a" />
              {/* face */}
              <g className="luci-eyes">
                <circle cx="49" cy="59" r="8.5" fill="#fcfcf8" />
                <circle cx="71" cy="59" r="8.5" fill="#fcfcf8" />
                <circle className="luci-pupil" cx="50" cy="60" r="4.6" fill="#1a2028" />
                <circle className="luci-pupil" cx="72" cy="60" r="4.6" fill="#1a2028" />
                <circle cx="51.8" cy="57.8" r="1.6" fill="#fcfcf8" />
                <circle cx="73.8" cy="57.8" r="1.6" fill="#fcfcf8" />
              </g>
              {/* happy eyes for reactions (crescents), shown instead of the round eyes */}
              <g className="luci-eyes-happy" fill="none" stroke="#fcfcf8" strokeWidth="3" strokeLinecap="round">
                <path d="M43 61 Q49 53 55 61" />
                <path d="M65 61 Q71 53 77 61" />
              </g>
              <circle cx="42" cy="70" r="3.6" fill="#f0a39a" fillOpacity=".7" />
              <circle cx="78" cy="70" r="3.6" fill="#f0a39a" fillOpacity=".7" />
              {/* mouth: lips together (smile / pressed) or open with teeth and tongue; shaped per sound */}
              <path ref={els.line} d="M54 71 Q60 76 66 71" fill="none" stroke="#fcfcf8" strokeWidth="2.4" strokeLinecap="round" />
              <g ref={els.open} style={{ display: "none" }}>
                <clipPath id={clipId}>
                  <path ref={els.clip} d="M54 71 Q60 71 66 71 Z" />
                </clipPath>
                <path ref={els.fill} d="M54 71 Q60 71 66 71 Z" fill="#4a1f25" />
                <g clipPath={`url(#${clipId})`}>
                  <rect ref={els.teeth} x="56" y="70" width="8" height="2" rx="0.6" fill="#fcfcf8" opacity="0" />
                  <ellipse ref={els.tongue} cx="60" cy="75" rx="3.5" ry="1.6" fill="#f0a39a" opacity="0" />
                </g>
                <path ref={els.outline} d="M54 71 Q60 71 66 71 Z" fill="none" stroke="#fcfcf8" strokeWidth="1.6" strokeLinejoin="round" />
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
       </div>
      </div>
    </div>
  );
}

// A word became known: a tiny firefly flies from Luci's tail to "Your jar" in the nav, which then lights up.
const TINY_FIREFLY = `<svg viewBox="0 0 32 32" width="22" height="22"><g transform="rotate(-45 16 16)">
<ellipse cx="10.6" cy="13" rx="3" ry="5.6" transform="rotate(-28 10.6 13)" fill="#6fa8d6" fill-opacity=".9" stroke="#2a3a4a" stroke-width=".7"/>
<ellipse cx="21.4" cy="13" rx="3" ry="5.6" transform="rotate(28 21.4 13)" fill="#6fa8d6" fill-opacity=".9" stroke="#2a3a4a" stroke-width=".7"/>
<circle cx="16" cy="22.5" r="7.6" fill="#ffe9a0" fill-opacity=".9"/><ellipse cx="16" cy="22" rx="4.4" ry="5.4" fill="#ffe46b" stroke="#b07d00" stroke-width=".8"/>
<ellipse cx="16" cy="14.5" rx="3.8" ry="4.6" fill="#2a3a4a"/><circle cx="16" cy="8" r="3.4" fill="#2a3a4a"/></g></svg>`;

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
  const fly = document.createElement("div");
  fly.setAttribute("aria-hidden", "true");
  fly.className = "pointer-events-none fixed z-[60]";
  fly.innerHTML = TINY_FIREFLY;
  const x0 = from.left + from.width / 2 - 11;
  const y0 = from.top + from.height / 2 - 11;
  const dx = to.left + to.width / 2 - 11 - x0;
  const dy = to.top + to.height / 2 - 11 - y0;
  fly.style.left = `${x0}px`;
  fly.style.top = `${y0}px`;
  document.body.appendChild(fly);
  // a gentle arc up and over, slowing as it reaches the jar
  const anim = fly.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.3 + 60}px, ${dy * 0.45}px) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.9 },
    ],
    { duration: 1300, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
  );
  anim.onfinish = () => {
    fly.remove();
    lightJar();
  };
}
