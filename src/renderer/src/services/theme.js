// Theme application.
//
// `applyTheme(theme, accentHue)` is the only entry point. Called once
// pre-mount from main.js with "system" as a placeholder, then again
// after the storage cache is hydrated with the persisted preference,
// and reactively from App.vue while the user changes it in Settings.

const mql = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

let lastResolvedMode = "light";
let systemListener = null;

function resolveMode(theme) {
  if (theme === "dark" || theme === "light") return theme;
  return mql?.matches ? "dark" : "light";
}

export function applyTheme(theme, accentHue) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const mode = resolveMode(theme);
  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;
  lastResolvedMode = mode;

  if (Number.isFinite(accentHue)) {
    root.style.setProperty("--accent-hue", String(accentHue));
  }

  // Track the system preference only while the user opts in to "system".
  // Otherwise we'd flip mode out from under an explicit choice.
  if (mql) {
    if (theme === "system" && !systemListener) {
      systemListener = () => applyTheme("system", accentHue);
      mql.addEventListener?.("change", systemListener);
    } else if (theme !== "system" && systemListener) {
      mql.removeEventListener?.("change", systemListener);
      systemListener = null;
    }
  }
}

export function currentMode() { return lastResolvedMode; }
