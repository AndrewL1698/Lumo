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

const MOUTH_Y = 60;
/** The chibi face keeps every lip-sync shape, drawn small (w / h / curve scaled), so the mouth stays cute. */
const MOUTH_SCALE = 0.55;

function drawMouth(els: MouthEls, shape: Shape, bob: number) {
  els.last.current = { ...shape }; // unscaled, so blends and lip-sync keep working in the original units
  const p = { ...shape, w: shape.w * MOUTH_SCALE, h: shape.h * MOUTH_SCALE, curve: shape.curve * MOUTH_SCALE, teeth: 0 };
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
    line.current.setAttribute("stroke-width", curve < 1.1 ? "2" : "1.7");
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
  teeth.current.setAttribute("opacity", "0"); // a tiny, gentle mouth: never teeth
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

// Eyes follow the real mouse (the firefly cursor is drawn on top of it; we read the pointer itself).
// Only the eye ovals move, inside a small radius, eased every frame through an SVG transform on a ref (no React
// state). After ~3 s without movement, or when the mouse leaves the window, they drift back to centre. While Luci
// talks she mostly looks at you, with a short glance at the cursor now and then. Off on touch screens, with
// reduced motion, and on still (older) Lucis. The blink scales the outer eye group, so the eyes still vanish in it.
const LOOK_RANGE = { x: 1.6, y: 1.2 }; // in viewBox units; the eye oval is 6 x 7.8
const LOOK_FULL_PX = 320; // cursor this far away (screen px) = full glance
const EYE_LINE = { x: 60, y: 51 }; // eye midpoint in the 120 x 120 viewBox
const IDLE_MS = 3000;

function useEyeTracking(
  svgRef: React.RefObject<SVGSVGElement | null>,
  lookRef: React.RefObject<SVGGElement | null>,
  still: boolean,
  talkingRef: React.RefObject<boolean>,
) {
  useEffect(() => {
    if (still) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return; // pupils stay centred
    let mx = 0;
    let my = 0;
    let lastMove = -Infinity; // no cursor yet: look ahead
    let cx = 0;
    let cy = 0;
    let shownX = NaN;
    let shownY = NaN;
    let nextGlance = performance.now() + 2500;
    let glanceUntil = 0;
    let last = performance.now();
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      mx = e.clientX;
      my = e.clientY;
      lastMove = performance.now();
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) lastMove = -Infinity; // left the window
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, now - last);
      last = now;
      let tx = 0;
      let ty = 0;
      const active = now - lastMove < IDLE_MS;
      let look = active;
      if (active && talkingRef.current) {
        // talking: eyes on the learner, with a brief glance at the cursor every few seconds
        if (now >= nextGlance) {
          glanceUntil = now + 700;
          nextGlance = now + 2600 + Math.random() * 2400;
        }
        look = now < glanceUntil;
      }
      const svg = svgRef.current;
      if (look && svg) {
        const r = svg.getBoundingClientRect();
        const ex = r.left + (r.width * EYE_LINE.x) / 120;
        const ey = r.top + (r.height * EYE_LINE.y) / 120;
        const dx = mx - ex;
        const dy = my - ey;
        const dist = Math.hypot(dx, dy) || 1;
        const m = Math.min(1, dist / LOOK_FULL_PX);
        tx = (dx / dist) * m * LOOK_RANGE.x;
        ty = (dy / dist) * m * LOOK_RANGE.y;
      }
      // ease toward the target (quicker when following, gentler drifting home)
      const k = 1 - Math.exp(-dt / (look ? 110 : 380));
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      if (Math.abs(cx - shownX) > 0.01 || Math.abs(cy - shownY) > 0.01 || Number.isNaN(shownX)) {
        shownX = cx;
        shownY = cy;
        lookRef.current?.setAttribute("transform", `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      lookRef.current?.removeAttribute("transform");
    };
  }, [still, svgRef, lookRef, talkingRef]);
}

// Luci the firefly, the tutor's face: an original soft chibi character (round head, plump body, small oval eyes,
// rosy cheeks, translucent veined wings, a glowing tail). Pure SVG + CSS animations (globals.css, "Luci firefly").
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
  const uid = useId().replace(/:/g, "");
  const clipId = `luci-mouth-${uid}`;
  const gid = `luci-${uid}`; // gradient ids, unique per Luci on the page
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
  const svgRef = useRef<SVGSVGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const talkingRef = useRef(talking);
  useEffect(() => {
    talkingRef.current = talking;
  }, [talking]);
  useEyeTracking(svgRef, lookRef, still, talkingRef);
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
        <svg ref={svgRef} viewBox="0 0 120 120" width="100%" height="100%" overflow="visible">
              <defs>
                {/* gentle gradients for depth: lighter on top, a little darker below */}
                <radialGradient id={`${gid}-halo`}>
                  <stop offset="0" style={{ stopColor: "var(--luci-glow, #ffd23a)", stopOpacity: 0.95 }} />
                  <stop offset="0.55" style={{ stopColor: "var(--luci-glow, #ffd23a)", stopOpacity: 0.35 }} />
                  <stop offset="1" style={{ stopColor: "var(--luci-glow, #ffd23a)", stopOpacity: 0 }} />
                </radialGradient>
                <radialGradient id={`${gid}-tail`} cx="0.42" cy="0.35" r="0.75">
                  <stop offset="0" stopColor="#fffbe6" />
                  <stop offset="0.45" stopColor="#ffe066" />
                  <stop offset="1" stopColor="#f2b400" />
                </radialGradient>
                <radialGradient id={`${gid}-head`} cx="0.4" cy="0.3" r="0.8">
                  <stop offset="0" stopColor="#5b7a9e" />
                  <stop offset="0.6" stopColor="#3c5370" />
                  <stop offset="1" stopColor="#2c3d52" />
                </radialGradient>
                <radialGradient id={`${gid}-body`} cx="0.45" cy="0.25" r="0.85">
                  <stop offset="0" stopColor="#4a6584" />
                  <stop offset="1" stopColor="#26354a" />
                </radialGradient>
                <linearGradient id={`${gid}-wing`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#e3f1fb" stopOpacity="0.85" />
                  <stop offset="1" stopColor="#6fa8d6" stopOpacity="0.55" />
                </linearGradient>
                <radialGradient id={`${gid}-tip`} cx="0.4" cy="0.35">
                  <stop offset="0" stopColor="#fff8d6" />
                  <stop offset="1" stopColor="#ffd23a" />
                </radialGradient>
              </defs>
              {/* glowing tail with a soft radial glow around it */}
              <circle className="luci-halo" cx="60" cy="95" r="27" fill={`url(#${gid}-halo)`} />
              {/* translucent wings with thin veins: fixed angle on the outer group, the soft flutter on the inner one */}
              <g transform="rotate(-30 38 66)">
                <g className="luci-wing luci-wing-l">
                  <ellipse cx="38" cy="66" rx="11" ry="18" fill={`url(#${gid}-wing)`} />
                  <path d="M38 80 L38 52 M38 70 Q33 63 31 56 M38 64 Q43 58 44 53" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth=".7" strokeLinecap="round" />
                </g>
              </g>
              <g transform="rotate(30 82 66)">
                <g className="luci-wing luci-wing-r">
                  <ellipse cx="82" cy="66" rx="11" ry="18" fill={`url(#${gid}-wing)`} />
                  <path d="M82 80 L82 52 M82 70 Q87 63 89 56 M82 64 Q77 58 76 53" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth=".7" strokeLinecap="round" />
                </g>
              </g>
              <ellipse className="luci-tail" cx="60" cy="95" rx="14" ry="11.5" fill={`url(#${gid}-tail)`} />
              {/* plump little body, then the round head on top */}
              <ellipse className="luci-body" cx="60" cy="79" rx="17" ry="14" fill={`url(#${gid}-body)`} />
              {/* short antennae with soft round tips */}
              <path d="M54 30 C52 24 49 20 46 18 M66 30 C68 24 71 20 74 18" fill="none" stroke="#3c5370" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="45.5" cy="17.5" r="3.4" fill={`url(#${gid}-tip)`} />
              <circle cx="74.5" cy="17.5" r="3.4" fill={`url(#${gid}-tip)`} />
              <circle cx="60" cy="50" r="23" fill={`url(#${gid}-head)`} />
              <ellipse cx="51" cy="37" rx="8" ry="4.2" fill="#ffffff" fillOpacity=".12" transform="rotate(-18 51 37)" />
              {/* small, simple eyes: dark ovals with a tiny shine (they glance together when listening) */}
              <g className="luci-eyes">
                {/* moved by useEyeTracking (SVG transform attribute), inside the blinking group */}
                <g ref={lookRef}>
                  <ellipse className="luci-pupil" cx="51" cy="51" rx="3" ry="3.9" fill="#121a24" />
                  <ellipse className="luci-pupil" cx="69" cy="51" rx="3" ry="3.9" fill="#121a24" />
                  <circle className="luci-pupil" cx="52" cy="49.4" r="1.05" fill="#ffffff" />
                  <circle className="luci-pupil" cx="70" cy="49.4" r="1.05" fill="#ffffff" />
                </g>
              </g>
              {/* happy eyes for reactions (soft arcs), shown instead of the ovals */}
              <g className="luci-eyes-happy" fill="none" stroke="#121a24" strokeWidth="2.2" strokeLinecap="round">
                <path d="M47.5 52 Q51 47.5 54.5 52" />
                <path d="M65.5 52 Q69 47.5 72.5 52" />
              </g>
              {/* rosy cheeks */}
              <ellipse cx="45" cy="57.5" rx="4.2" ry="2.6" fill="#f59aa6" fillOpacity=".55" />
              <ellipse cx="75" cy="57.5" rx="4.2" ry="2.6" fill="#f59aa6" fillOpacity=".55" />
              {/* mouth: a tiny smile at rest; still opens and shapes per sound while talking (drawn small, no teeth) */}
              <path ref={els.line} d="M57 60 Q60 62 63 60" fill="none" stroke="#121a24" strokeWidth="1.7" strokeLinecap="round" />
              <g ref={els.open} style={{ display: "none" }}>
                <clipPath id={clipId}>
                  <path ref={els.clip} d="M57 60 Q60 60 63 60 Z" />
                </clipPath>
                <path ref={els.fill} d="M57 60 Q60 60 63 60 Z" fill="#5a2430" />
                <g clipPath={`url(#${clipId})`}>
                  <rect ref={els.teeth} x="58" y="59" width="4" height="1" rx="0.4" fill="#fcfcf8" opacity="0" />
                  <ellipse ref={els.tongue} cx="60" cy="62" rx="2" ry="1" fill="#f59aa6" opacity="0" />
                </g>
                <path ref={els.outline} d="M57 60 Q60 60 63 60 Z" fill="none" stroke="#5a2430" strokeWidth=".8" strokeLinejoin="round" />
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
