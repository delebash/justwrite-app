// Theme application.
//
// Reads `justwrite:ui` from localStorage at module-load time and applies
// the resolved theme to <html> BEFORE Vue mounts, so we don't flash a
// light theme on dark-preferring users.
//
// Once the ui store is alive, `applyTheme(theme, accentHue)` is the
// reactive entry point — call it from a watchEffect.

const STORAGE_KEY = "justwrite:ui";

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

// Apply the persisted preference immediately on module load.
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  applyTheme(parsed?.theme || "system", parsed?.accentHue);
} catch {
  applyTheme("system");
}
