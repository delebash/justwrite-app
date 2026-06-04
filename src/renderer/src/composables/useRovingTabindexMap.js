/**
 * useRovingTabindexMap — lazy registry of useRovingTabindex instances
 * keyed by an arbitrary id (sectionId, chapterId, etc.).
 *
 * Use when one component renders multiple independent lists that each
 * need their own roving-focus state (Sidebar sections, per-chapter
 * scene rows, etc.). Instances are created on first `get(key)` so
 * keys that never render incur no overhead.
 *
 * Usage:
 *   const roving = useRovingTabindexMap((sectionId) => ({
 *     length: computed(() => items(sectionId).length),
 *     orientation: "vertical",
 *     loop: false,
 *     onActivate: (i) => activate(sectionId, i),
 *   }));
 *
 *   // then in helpers:
 *   roving.get(sectionId).getTabindex(i)
 *   roving.get(sectionId).onKeydown(e, i)
 *   roving.get(sectionId).registerItem(i, el)
 */

import { useRovingTabindex } from "./useRovingTabindex.js";

export function useRovingTabindexMap(factory) {
  const _map = new Map();
  function get(key) {
    if (!_map.has(key)) {
      _map.set(key, useRovingTabindex(factory(key)));
    }
    return _map.get(key);
  }
  return { get };
}
