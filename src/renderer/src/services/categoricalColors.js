// Shared categorical color generator used by the JwColorPicker presets
// and the auto-default for narrative strand and character group colors.
//
// Lightness varies with hue: yellows and light greens need a higher L
// to actually look yellow rather than olive; reds, blues, and purples
// stay near the base L where they read as themselves. The chroma stays
// fixed — color-space-aware adjustments per hue would be marginal and
// the math complicates the picker math without buying much.

const BASE_L = 0.65;
const YELLOW_PEAK = 90;       // hue at the L peak (yellow)
const YELLOW_RADIUS = 60;     // hues within ±60° of yellow get a boost
const YELLOW_BOOST = 0.20;    // additive L at the peak

// Distance between two hues on the color wheel (0-180°, shortest arc).
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export function naturalLightness(hue) {
  const dist = hueDistance(hue, YELLOW_PEAK);
  if (dist >= YELLOW_RADIUS) return BASE_L;
  return BASE_L + YELLOW_BOOST * (1 - dist / YELLOW_RADIUS);
}

export function colorForHue(hue, { chroma = 0.13 } = {}) {
  const L = naturalLightness(hue).toFixed(2);
  return `oklch(${L} ${chroma} ${Math.round(hue)})`;
}

// 12 evenly-spaced hues for the JwColorPicker preset grid (4×3 layout).
// Combined with naturalLightness, this gives recognizable red / orange /
// yellow / lime / green / teal / sky / blue / purple / magenta / pink.
export const PRESET_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export const PRESET_COLORS = PRESET_HUES.map((h) => colorForHue(h));

// Sequence for auto-assigned defaults (strand/group/WB on creation).
// First N indices return the curated preset hues so freshly-added items
// match what the picker shows as "active"; beyond N, golden-angle
// (137.508°) rotation keeps colors visually distinct without wrapping.
const GOLDEN_ANGLE = 137.508;
const OVERFLOW_SEED = 13;

export function nextHue(index) {
  if (index < PRESET_HUES.length) return PRESET_HUES[index];
  const overflow = index - PRESET_HUES.length;
  return Math.round((OVERFLOW_SEED + overflow * GOLDEN_ANGLE) % 360);
}

export function nextColor(index) {
  return colorForHue(nextHue(index));
}
