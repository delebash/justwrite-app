// Custom v-tooltip directive — replaces PrimeVue's. Floating UI handles
// positioning (with flip + shift fallbacks) so a tooltip near the viewport
// edge bounces to a side that fits. One delay-debounced show on hover OR
// focus, instant hide on click so the tooltip never blocks the user.
//
// API matches the callsites we have:
//   v-tooltip="'text'"           — defaults to bottom
//   v-tooltip.top="'text'"       — placed above
//   v-tooltip.bottom="'text'"    — placed below (most common)
//   v-tooltip.left="'text'"
//   v-tooltip.right="'text'"
//   v-tooltip.bottom="expr"      — reactive string is fine; updated() syncs

import { computePosition, autoUpdate, offset, flip, shift } from "@floating-ui/dom";

const SHOW_DELAY = 350;
const HIDE_DELAY = 80;
let idCounter = 0;

function placementFromModifiers(mods) {
  if (mods.top) return "top";
  if (mods.bottom) return "bottom";
  if (mods.left) return "left";
  if (mods.right) return "right";
  return "bottom";
}

function createTooltipEl(content) {
  const el = document.createElement("div");
  el.className = "jw-tooltip";
  el.setAttribute("role", "tooltip");
  el.id = `jw-tt-${++idCounter}`;
  el.textContent = content;
  document.body.appendChild(el);
  return el;
}

// One state record per element with the directive applied. Stored on the
// element under a non-enumerable property to survive Vue's reactivity layer.
function stateFor(el) {
  return el.__jwTooltip;
}

function setupState(el, content, placement) {
  let tooltipEl = null;
  let cleanupPos = null;
  let showTimer = null;
  let hideTimer = null;

  const show = () => {
    clearTimeout(hideTimer);
    if (tooltipEl || !s.content) return;
    showTimer = setTimeout(() => {
      tooltipEl = createTooltipEl(s.content);
      el.setAttribute("aria-describedby", tooltipEl.id);
      cleanupPos = autoUpdate(el, tooltipEl, () => {
        computePosition(el, tooltipEl, {
          strategy: "fixed",
          placement: s.placement,
          middleware: [offset(6), flip(), shift({ padding: 6 })],
        }).then(({ x, y }) => {
          if (!tooltipEl) return;
          tooltipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        });
      });
      requestAnimationFrame(() => tooltipEl && tooltipEl.classList.add("is-visible"));
    }, SHOW_DELAY);
  };

  const hide = () => {
    clearTimeout(showTimer);
    if (!tooltipEl) return;
    hideTimer = setTimeout(() => {
      if (!tooltipEl) return;
      tooltipEl.classList.remove("is-visible");
      if (cleanupPos) { cleanupPos(); cleanupPos = null; }
      const node = tooltipEl;
      tooltipEl = null;
      el.removeAttribute("aria-describedby");
      // Let the fade-out finish before removing from the DOM.
      setTimeout(() => node.remove(), 160);
    }, HIDE_DELAY);
  };

  const onClickHide = () => {
    clearTimeout(showTimer); showTimer = null;
    if (!tooltipEl) return;
    if (cleanupPos) { cleanupPos(); cleanupPos = null; }
    tooltipEl.remove();
    tooltipEl = null;
    el.removeAttribute("aria-describedby");
  };

  const s = {
    content,
    placement,
    show, hide, onClickHide,
    destroy() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      if (cleanupPos) cleanupPos();
      if (tooltipEl) tooltipEl.remove();
      el.removeEventListener("mouseenter", show);
      el.removeEventListener("mouseleave", hide);
      el.removeEventListener("focus", show);
      el.removeEventListener("blur", hide);
      el.removeEventListener("click", onClickHide);
      el.removeAttribute("aria-describedby");
    },
  };

  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", hide);
  el.addEventListener("focus", show);
  el.addEventListener("blur", hide);
  el.addEventListener("click", onClickHide);

  Object.defineProperty(el, "__jwTooltip", { value: s, configurable: true, writable: true });
}

export const tooltipDirective = {
  mounted(el, binding) {
    const content = binding.value == null ? "" : String(binding.value);
    if (!content) return;
    setupState(el, content, placementFromModifiers(binding.modifiers));
  },
  updated(el, binding) {
    const content = binding.value == null ? "" : String(binding.value);
    const placement = placementFromModifiers(binding.modifiers);
    const s = stateFor(el);
    if (!s) {
      if (content) setupState(el, content, placement);
      return;
    }
    if (!content) { s.destroy(); el.__jwTooltip = null; return; }
    s.content = content;
    s.placement = placement;
  },
  beforeUnmount(el) {
    const s = stateFor(el);
    if (s) { s.destroy(); el.__jwTooltip = null; }
  },
};
