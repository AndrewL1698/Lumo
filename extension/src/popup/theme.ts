// Visual only: the popup's light/dark theme (styles: html[data-theme="light"] in popup.html). Dark is the default.
// The choice lives in chrome.storage.local under its own key ("lumoTheme"; the hover card reads it too), mirrored in
// this page's localStorage so it can be applied synchronously before the first paint (chrome.storage is async).
// No settings, messages or service-worker logic involved. Imported first by index.ts.

export const THEME_KEY = "lumoTheme";
type Theme = "dark" | "light";

const root = document.documentElement;
const btn = document.getElementById("theme-toggle") as HTMLButtonElement | null;

function apply(t: Theme): void {
  root.dataset.theme = t;
  const label = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
  btn?.setAttribute("aria-label", label);
  btn?.setAttribute("title", label);
}

let theme: Theme = "dark";
try {
  if (localStorage.getItem(THEME_KEY) === "light") theme = "light";
} catch {
  // storage blocked: dark
}
apply(theme);

// The stored value wins if the mirror is stale (e.g. first open after an update).
chrome.storage.local
  .get(THEME_KEY)
  .then((got) => {
    const stored: Theme = got[THEME_KEY] === "light" ? "light" : "dark";
    if (stored !== theme) {
      theme = stored;
      apply(theme);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // ignore
      }
    }
  })
  .catch(() => undefined);

btn?.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  apply(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
  void chrome.storage.local.set({ [THEME_KEY]: theme }).catch(() => undefined);
});
