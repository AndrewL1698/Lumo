"use client";
import { useEffect } from "react";

// Home page only: a very faint glow trail from the firefly cursor's tail. Decorative; off for reduced
// motion and for touch screens. At most one dot every 45ms, each fades out and is removed.
export function CursorTrail() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let last = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const dot = document.createElement("div");
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText =
        "position:fixed;z-index:70;pointer-events:none;width:6px;height:6px;border-radius:9999px;background:#ffd23a;" +
        `left:${e.clientX + 14}px;top:${e.clientY + 14}px;opacity:0.45`; // tail sits ~16px down-right of the hotspot
      document.body.appendChild(dot);
      dot.animate([{ opacity: 0.45 }, { opacity: 0 }], { duration: 550, easing: "ease-out" }).onfinish = () => dot.remove();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
