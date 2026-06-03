// Bridge between callers (the ui store, anywhere) and vue-sonner's
// imperative toast() API. Unlike PrimeVue's ToastService, sonner needs no
// service-binding from a setup() context — `toast(...)` works anywhere.
// We keep this thin shim so callsites (pushToast / clearToasts) don't
// change between toast backends.
//
// Toasts carry an optional `action` ({ label, fn }) for the inline button
// that soft-delete uses to surface "Undo" — mapped to sonner's `action`
// shape ({ label, onClick }) here.

import { toast } from "vue-sonner";

// Show one toast.
export function pushToast({ message, action } = {}, ms = 6000) {
  if (!message) return;
  toast(message, {
    duration: ms,
    action: action ? { label: action.label, onClick: action.fn } : undefined,
  });
}

// Dismiss any visible toast (the old dismissToast cleared the single slot).
export function clearToasts() {
  toast.dismiss();
}
