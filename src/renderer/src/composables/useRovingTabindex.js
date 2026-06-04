/**
 * useRovingTabindex — keyboard focus management for linear lists.
 *
 * Usage:
 *   const { activeIndex, getTabindex, onKeydown, registerItem } =
 *     useRovingTabindex({ length, orientation, loop, onActivate })
 *
 * Parameters (all reactive-compatible):
 *   length      — ref / computed / plain number: current item count
 *   orientation — 'vertical' | 'horizontal' | 'both' (default 'vertical')
 *   loop        — boolean, default true; wrap focus at list ends
 *   onActivate  — function(index) called on Enter / Space
 *
 * Returns:
 *   activeIndex   — ref<number>  (-1 = nothing focused yet)
 *   getTabindex   — (index) => 0 | -1
 *   onKeydown     — (event, index) => void   bind to each item's @keydown
 *   registerItem  — (index, el) => void      optional; call in v-for :ref
 *                   so the composable can imperatively focus items
 */

import { ref, toValue } from "vue";

export function useRovingTabindex({ length, orientation = "vertical", loop = true, onActivate } = {}) {
  const activeIndex = ref(-1);

  // Sparse element registry — index → HTMLElement.
  // Not reactive; updated imperatively by registerItem.
  const _els = new Map();

  function _len() {
    return toValue(length) ?? 0;
  }

  function _focus(i) {
    activeIndex.value = i;
    const el = _els.get(i);
    if (el) {
      el.focus();
    }
  }

  function getTabindex(i) {
    // If nothing has been touched yet, the first item is the tab stop.
    const active = activeIndex.value;
    if (active === -1) return i === 0 ? 0 : -1;
    return i === active ? 0 : -1;
  }

  function onKeydown(e, idx) {
    const max = _len() - 1;
    if (max < 0) return;

    const isHoriz = orientation === "horizontal" || orientation === "both";
    const isVert  = orientation === "vertical"   || orientation === "both";

    let target = idx;
    let handled = true;

    if ((e.key === "ArrowDown" && isVert) || (e.key === "ArrowRight" && isHoriz)) {
      target = idx >= max ? (loop ? 0 : max) : idx + 1;
    } else if ((e.key === "ArrowUp" && isVert) || (e.key === "ArrowLeft" && isHoriz)) {
      target = idx <= 0 ? (loop ? max : 0) : idx - 1;
    } else if (e.key === "Home") {
      target = 0;
    } else if (e.key === "End") {
      target = max;
    } else if (e.key === "Enter" || e.key === " ") {
      if (onActivate) onActivate(idx);
      // Don't prevent — let buttons / links handle Space/Enter natively
      // unless we consumed it through onActivate.
      e.preventDefault();
      return;
    } else {
      handled = false;
    }

    if (handled) {
      e.preventDefault();
      _focus(target);
    }
  }

  function registerItem(index, el) {
    if (el) {
      _els.set(index, el);
    } else {
      _els.delete(index);
    }
  }

  // Public imperative focus — moves roving focus to index without a keydown event.
  function focusAt(i) {
    _focus(i);
  }

  return { activeIndex, getTabindex, onKeydown, registerItem, focusAt };
}
