"use client";
import { useSyncExternalStore } from "react";

// Light/dark toggle in the nav. The theme lives on <html data-theme>, which the inline script in
// app/layout.tsx sets before the first paint (no flash). Dark (the night) is the default.
type Theme = "dark" | "light";
export const THEME_KEY = "luci-theme";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const getTheme = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // private mode / blocked storage: the switch still works for this visit
        }
      }}
      aria-label={next === "light" ? "Switch to light mode" : "Switch to dark mode"}
      title={next === "light" ? "Switch to light mode" : "Switch to dark mode"}
      className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink transition-colors duration-150 hover:bg-line"
    >
      {theme === "dark" ? (
        // sun: what you get by clicking
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : (
        // moon
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
