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
          borderColor:       "var(--border)",
          hoverBorderColor:  "var(--accent-line)",
          focusBorderColor:  "var(--accent)",
          color:             "var(--ink)",
          placeholderColor:  "var(--muted)",
          borderRadius:      "6px",
          paddingX:          "10px",
          paddingY:          "6px",
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
          borderColor:       "var(--border)",
          hoverBorderColor:  "var(--accent-line)",
          focusBorderColor:  "var(--accent)",
          color:             "var(--ink)",
          placeholderColor:  "var(--muted)",
          borderRadius:      "6px",
          paddingX:          "10px",
          paddingY:          "6px",
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
  // Component-level overrides — DataTable in particular needs its
  // serif headings and condensed row padding to feel editorial.
  components: {
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
