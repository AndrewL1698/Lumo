// A Spanish word on the home page that shows its meaning on hover or keyboard focus (D-016). Static text, no API.
// The glow classes go on the word itself, so the meaning bubble never flickers along with a "learning" word.
import { useId } from "react";

export function GlossWord({ word, gloss, className = "" }: { word: string; gloss: string; className?: string }) {
  const id = useId();
  return (
    <span tabIndex={0} aria-describedby={id} className="group relative inline-block cursor-help rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-glow">
      <span className={className}>{word}</span>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-sun-line bg-[#14213a] px-3 py-1.5 font-sans text-base font-normal not-italic text-ink opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {gloss}
      </span>
    </span>
  );
}
