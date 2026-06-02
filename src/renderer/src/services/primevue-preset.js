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
          // No glow ring — the focusBorderColor change is enough. Matches
          // the OLD .input:focus behavior the user actually wanted: just
          // the border switches to accent on focus, no surrounding halo.
          focusRing: {
            width:  "0",
            style:  "none",
            color:  "transparent",
            offset: "0",
            shadow: "none",
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
          // No glow ring — the focusBorderColor change is enough. Matches
          // the OLD .input:focus behavior the user actually wanted: just
          // the border switches to accent on focus, no surrounding halo.
          focusRing: {
            width:  "0",
            style:  "none",
            color:  "transparent",
            offset: "0",
            shadow: "none",
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
      // Severity colours MUST live under colorScheme.{light,dark}.root|outlined|text
      // — verified against @primeuix/themes/aura/button. Overriding button.<severity>
      // directly (as this preset did before) is silently IGNORED, so those buttons fell
      // back to Aura's fixed green/red/sky/orange and never tracked the theme hues.
      // primary/secondary/contrast already follow the theme via the semantic `primary`
      // + `surface` overrides, so here we only retint success / danger / info / warn.
      colorScheme: { light: buttonColorScheme(), dark: buttonColorScheme() },
    },
    // Same path rule as buttons: tag severities live at tag.colorScheme.{light,dark}.<severity>
    // (verified against @primeuix/themes/aura/tag). Soft tint + readable ink, mode-aware.
    tag: { colorScheme: { light: tagColorScheme(), dark: tagColorScheme() } },
    dialog: {
      // Match the bespoke .modal shell: surface bg, 14px radius, the
      // editorial window shadow, serif title. Header/footer chrome
      // (border-bottom / border-top) + content scroll live in tokens.css
      // as unlayered rules keyed on .app-modal / .app-dialog so the two
      // overlay flavors keep their distinct looks.
      background:   "var(--surface)",
      borderColor:  "var(--border)",
      color:        "var(--ink)",
      borderRadius: "14px",
      shadow:       "var(--shadow-window)",
      header: { padding: "16px 22px", gap: "14px" },
      title:  { fontSize: "18px", fontWeight: "600" },
      content: { padding: "18px 22px" },
      footer: { padding: "12px 22px", gap: "10px" },
    },
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

// Button severity colours. All references are MODE-AWARE app vars (tokens.css
// flips their L/C per light/dark), so one definition serves both colorSchemes.
//   fill   = filled background (the exact colour the Functional-colours swatch shows)
//   onFill = label on the filled button (chosen to contrast the fill in both modes)
//   label  = outlined/text label (the mode-aware -ink shade: readable, same hue)
function buttonColorScheme() {
  const SEV = {
    success: { fill: "var(--status-done)", onFill: "var(--surface)", label: "var(--success-ink)" },
    info:    { fill: "var(--info)",        onFill: "var(--surface)", label: "var(--info-ink)" },
    danger:  { fill: "var(--danger)",      onFill: "var(--surface)", label: "var(--danger-ink)" },
    warn:    { fill: "var(--gold)",        onFill: "color-mix(in oklab, var(--gold) 22%, black)",
               label: "color-mix(in oklab, var(--gold) 55%, black)" },
  };
  const root = {}, outlined = {}, text = {};
  for (const [name, c] of Object.entries(SEV)) {
    const hover  = "color-mix(in oklab, " + c.fill + " 82%, black)";
    const soft10 = "color-mix(in oklab, " + c.fill + " 10%, transparent)";
    const soft16 = "color-mix(in oklab, " + c.fill + " 16%, transparent)";
    root[name] = {
      background: c.fill, hoverBackground: hover, activeBackground: hover,
      borderColor: c.fill, hoverBorderColor: hover, activeBorderColor: hover,
      color: c.onFill, hoverColor: c.onFill, activeColor: c.onFill,
      focusRing: { color: c.fill, shadow: "none" },
    };
    outlined[name] = { color: c.label, borderColor: c.fill, hoverBackground: soft10, activeBackground: soft16 };
    text[name]     = { color: c.label, hoverBackground: soft10, activeBackground: soft16 };
  }
  return { root, outlined, text };
}

// Tag severity colours — soft tint background + readable ink. The -bg / -ink
// families are mode-aware, so one definition serves both light and dark.
function tagColorScheme() {
  const SEV = {
    primary: { bg: "var(--accent-soft)", fg: "var(--accent-ink)" },
    success: { bg: "var(--success-bg)",  fg: "var(--success-ink)" },
    info:    { bg: "var(--info-bg)",     fg: "var(--info-ink)" },
    warn:    { bg: "var(--warn-bg)",     fg: "var(--warn-ink)" },
    danger:  { bg: "var(--danger-bg)",   fg: "var(--danger-ink)" },
  };
  const out = {};
  for (const [name, c] of Object.entries(SEV)) out[name] = { background: c.bg, color: c.fg };
  return out;
}
