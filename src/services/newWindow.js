// This page in a new window (2026-10-29, the DO list's multi-window): the command palette's "Open
// this page in a new window" and Ctrl/⌘+Shift+N. The call is the one the kit names in
// app-structure §19 — window.open on the app's own address for the route, "noopener" so the two
// windows share nothing but the server. The desktop app's shell opens it as a second window of the
// app; a browser, as a new tab. Not on the phone, which has no windows. Another window's saves reach
// this one through the kit's watchOtherWindows (src/boot/jw.js).
import { isPhone } from "./native.js";

export const canOpenNewWindow = () => !isPhone();

/** Opens `to` (the current page by default) in a new window; false where there are no windows. */
export function openInNewWindow(router, to = router.currentRoute.value.fullPath) {
  if (!canOpenNewWindow()) return false;
  window.open(router.resolve(to).href, "_blank", "noopener");
  return true;
}
