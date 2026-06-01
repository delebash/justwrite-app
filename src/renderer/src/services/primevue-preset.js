// Custom PrimeVue preset that pulls Aura into JustWrite's editorial
// palette. Maps PrimeVue's color tokens onto our existing CSS custom
// properties (--surface, --accent, --ink, etc.) so the components
// inherit the live theme — light/dark/custom hue overrides just work.
//
// PrimeVue's design tokens are flat keys (colorScheme.light.surface,
// colorScheme.light.primary.color, etc.). definePreset() extends a base
// preset (Aura here) with overrides. Tokens reference CSS vars via the
// `{var-name}` syntax PrimeVue v4 supports out of the box.

import Aura from "@primeuix/themes/aura";
import { definePreset } from "@primeuix/themes";

export const JustWriteEditorial = definePreset(Aura, {
  semantic: {
    // Primary color — Aura's `primary` ramp drives buttons, links,
    // focus rings, etc. We point it at our --accent token; the ramp
    // steps are derived by Aura from this.
    primary: {
      50:  "{accent.50}",
      100: "{accent.100}",
      200: "{accent.200}",
      300: "{accent.300}",
      400: "{accent.400}",
      500: "var(--accent)",
      600: "var(--accent-ink)",
      700: "var(--accent-ink)",
      800: "{accent.800}",
      900: "{accent.900}",
      950: "{accent.950}",
    },
    colorScheme: {
      light: {
        surface: {
          0:   "var(--surface)",
          50:  "var(--surface-2)",
          100: "var(--surface-3)",
          200: "var(--border-soft)",
          300: "var(--border)",
          400: "var(--border-strong)",
          500: "var(--muted)",
          600: "var(--ink-2)",
          700: "var(--ink)",
          800: "var(--ink)",
          900: "var(--ink)",
          950: "var(--ink)",
        },
        primary: {
          color:           "var(--accent)",
          contrastColor:   "white",
          hoverColor:      "var(--accent-ink)",
          activeColor:     "var(--accent-ink)",
        },
        formField: {
          background:        "var(--surface)",
          disabledBackground: "var(--surface-2)",
          filledBackground:  "var(--surface-2)",
          borderColor:       "var(--border-strong)",
          hoverBorderColor:  "var(--accent-line)",
          focusBorderColor:  "var(--accent)",
          invalidBorderColor:"var(--danger-ink, oklch(0.55 0.18 25))",
          color:             "var(--ink)",
          placeholderColor:  "var(--muted)",
          borderRadius:      "7px",
          paddingX:          "10px",
          paddingY:          "6px",
          // Focus ring — match the OLD .input look. Aura's default ring
          // is the primary color at 24% alpha which read as a blue glow;
          // we want the warm accent-soft glow the custom CSS used.
          focusRing: {
            width:  "3px",
            style:  "solid",
            color:  "var(--accent-soft)",
            offset: "0",
            shadow: "0 0 0 3px var(--accent-soft)",
          },
        },
        content: {
          background:        "var(--surface)",
          hoverBackground:   "var(--surface-2)",
          borderColor:       "var(--border)",
          color:             "var(--ink)",
          hoverColor:        "var(--ink)",
        },
        text: {
          color:      "var(--ink)",
          hoverColor: "var(--ink)",
          mutedColor: "var(--muted)",
          hoverMutedColor: "var(--ink-2)",
        },
        highlight: {
          background:        "var(--accent-soft)",
          focusBackground:   "var(--accent-soft)",
          color:             "var(--accent-ink)",
          focusColor:        "var(--accent-ink)",
        },
        mask: {
          background: "color-mix(in oklab, black 40%, transparent)",
          color:      "white",
        },
      },
      dark: {
        // Dark mode follows the same var mapping — tokens.css already
        // flips var values under .theme-dark, so PrimeVue picks the
        // right colors automatically.
        surface: {
          0:   "var(--surface)",
          50:  "var(--surface-2)",
          100: "var(--surface-3)",
          200: "var(--border-soft)",
          300: "var(--border)",
          400: "var(--border-strong)",
          500: "var(--muted)",
          600: "var(--ink-2)",
          700: "var(--ink)",
          800: "var(--ink)",
          900: "var(--ink)",
          950: "var(--ink)",
        },
        primary: {
          color:         "var(--accent)",
          contrastColor: "white",
          hoverColor:    "var(--accent-ink)",
          activeColor:   "var(--accent-ink)",
        },
        formField: {
          background:        "var(--surface)",
          disabledBackground: "var(--surface-2)",
          filledBackground:  "var(--surface-2)",
          borderColor:       "var(--border-strong)",
          hoverBorderColor:  "var(--accent-line)",
          focusBorderColor:  "var(--accent)",
          invalidBorderColor:"var(--danger-ink, oklch(0.55 0.18 25))",
          color:             "var(--ink)",
          placeholderColor:  "var(--muted)",
          borderRadius:      "7px",
          paddingX:          "10px",
          paddingY:          "6px",
          focusRing: {
            width:  "3px",
            style:  "solid",
            color:  "var(--accent-soft)",
            offset: "0",
            shadow: "0 0 0 3px var(--accent-soft)",
          },
        },
        content: {
          background:      "var(--surface)",
          hoverBackground: "var(--surface-2)",
          borderColor:     "var(--border)",
          color:           "var(--ink)",
          hoverColor:      "var(--ink)",
        },
        text: {
          color:      "var(--ink)",
          hoverColor: "var(--ink)",
          mutedColor: "var(--muted)",
          hoverMutedColor: "var(--ink-2)",
        },
        highlight: {
          background:      "var(--accent-soft)",
          focusBackground: "var(--accent-soft)",
          color:           "var(--accent-ink)",
          focusColor:      "var(--accent-ink)",
        },
        mask: {
          background: "color-mix(in oklab, black 55%, transparent)",
          color:      "white",
        },
      },
    },
  },
  // Component-level overrides.
  //
  // PrimeVue's "severity" colors (danger / info / warn / success / secondary)
  // default to Aura's stock blue / red / orange / green ramps. None of those
  // fit the editorial palette. Map them onto our own CSS vars so a
  // <Button severity="danger"> or <Tag severity="info"> reads as part of
  // the manuscript app rather than a stock SaaS dashboard.
  //
  // Colors used:
  //   primary   → --accent (warm rust)
  //   success   → --status-done (muted green)
  //   warn      → --gold (warm amber)
  //   danger    → --danger-ink (muted rust-red)
  //   info      → muted desaturated blue derived in-place (OKLCH)
  //   secondary → --surface-3 + --ink (neutral chip)
  //   contrast  → --ink (inverse fill)
  components: {
    button: {
      // Base button sizing — match the old .btn dimensions exactly so
      // PrimeVue Buttons feel the same as the custom .btn class did.
      //   old .btn:    padding 6px 12px, radius 7px, font 12.5px
      //   old .btn.sm: padding 4px 8px,  radius 7px, font 11.5px
      // PrimeVue's default is bigger + less rounded; these overrides
      // bring it in line with the editorial palette.
      borderRadius:      "7px",
      roundedBorderRadius: "999px",
      paddingX:          "12px",
      paddingY:          "6px",
      sm: { paddingX: "8px",  paddingY: "4px", fontSize: "11.5px" },
      lg: { paddingX: "16px", paddingY: "8px", fontSize: "13.5px" },
      label: { fontWeight: "500" },
      gap:               "6px",
      iconOnlyWidth:     "28px",
      raisedShadow:      "var(--shadow-1, 0 1px 2px rgba(0,0,0,.05))",
      // Severities live here too — spread the helper output below.
      ...severityRamp({
        primary:   { bg: "var(--accent)",           hover: "var(--accent-ink)",   contrast: "white" },
      success:   { bg: "var(--status-done)",      hover: "color-mix(in oklab, var(--status-done) 80%, black)", contrast: "white" },
      warn:      { bg: "var(--gold)",             hover: "color-mix(in oklab, var(--gold) 80%, black)",        contrast: "var(--ink)" },
      danger:    { bg: "var(--danger-ink, oklch(0.55 0.18 25))", hover: "color-mix(in oklab, var(--danger-ink, oklch(0.55 0.18 25)) 80%, black)", contrast: "white" },
      info:      { bg: "oklch(0.55 0.10 235)",    hover: "oklch(0.46 0.11 235)", contrast: "white" },
      secondary: { bg: "var(--surface-3)",        hover: "var(--border-soft)",   contrast: "var(--ink-2)" },
      contrast:  { bg: "var(--ink)",              hover: "var(--ink-2)",         contrast: "var(--surface)" },
      }),
    },
    tag: tagRamp({
      primary:   { bg: "var(--accent-soft)",                                              fg: "var(--accent-ink)" },
      success:   { bg: "color-mix(in oklab, var(--status-done) 18%, transparent)",        fg: "var(--status-done)" },
      warn:      { bg: "color-mix(in oklab, var(--gold) 22%, transparent)",                fg: "color-mix(in oklab, var(--gold) 60%, black)" },
      danger:    { bg: "color-mix(in oklab, var(--danger-ink, #b91c1c) 14%, transparent)", fg: "var(--danger-ink, #b91c1c)" },
      info:      { bg: "color-mix(in oklab, oklch(0.55 0.10 235) 16%, transparent)",       fg: "oklch(0.46 0.11 235)" },
      secondary: { bg: "var(--surface-3)",                                                  fg: "var(--ink-2)" },
      contrast:  { bg: "var(--ink)",                                                        fg: "var(--surface)" },
    }),
    datatable: {
      header: {
        background: "var(--surface-2)",
        borderColor: "var(--border)",
      },
      headerCell: {
        background: "var(--surface-2)",
        hoverBackground: "var(--surface-3)",
        color: "var(--ink-2)",
        borderColor: "var(--border-soft)",
        padding: "8px 12px",
      },
      bodyCell: {
        borderColor: "var(--border-soft)",
        padding: "8px 12px",
      },
      row: {
        background: "var(--surface)",
        hoverBackground: "var(--surface-2)",
        selectedBackground: "var(--accent-soft)",
        color: "var(--ink)",
      },
      footer: {
        background: "var(--surface-2)",
        borderColor: "var(--border)",
        color: "var(--muted)",
      },
    },
  },
});

// Build a Button component token block for every severity in one pass.
// Each severity gets background + hover + active + contrast color blocks
// for both the solid fill and the outlined/text variants. Keeps the
// component spec above readable by factoring out the repetitive shape.
function severityRamp(severities) {
  const out = {};
  for (const [name, { bg, hover, contrast }] of Object.entries(severities)) {
    out[name] = {
      background:        bg,
      hoverBackground:   hover,
      activeBackground:  hover,
      borderColor:       bg,
      hoverBorderColor:  hover,
      activeBorderColor: hover,
      color:             contrast,
      hoverColor:        contrast,
      activeColor:       contrast,
      focusRing: { color: bg, shadow: "none" },
      outlined: {
        color:           bg,
        hoverBackground: "color-mix(in oklab, " + bg + " 10%, transparent)",
        activeBackground:"color-mix(in oklab, " + bg + " 16%, transparent)",
        borderColor:     bg,
      },
      text: {
        color:           bg,
        hoverBackground: "color-mix(in oklab, " + bg + " 10%, transparent)",
        activeBackground:"color-mix(in oklab, " + bg + " 16%, transparent)",
      },
    };
  }
  return out;
}

function tagRamp(severities) {
  const out = {};
  for (const [name, { bg, fg }] of Object.entries(severities)) {
    out[name] = { background: bg, color: fg };
  }
  return out;
}
