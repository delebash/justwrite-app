// Bridge between callers (the ui store, anywhere) and PrimeVue's
// ToastService. PrimeVue exposes the service only via useToast() inside a
// component's setup, so Toast.vue binds the live instance here on mount and
// ui.showToast() / ui.dismissToast() call through these helpers.
//
// Toasts carry an optional `action` ({ label, fn }) for the inline button
// that soft-delete uses to surface "Undo". It rides along as a custom field
// on the PrimeVue message object and is rendered by Toast.vue's #message slot.

const GROUP = "app";

let _service = null;

export function bindToastService(service) {
  _service = service;
}

// Show one toast. Mirrors the old store signature: { message, action } + ms.
export function pushToast({ message, action } = {}, ms = 6000) {
  if (!_service) return;
  _service.add({
    severity: "contrast",
    group: GROUP,
    summary: message,
    action: action || null,
    life: ms,
  });
}

// Dismiss any visible toast (the old dismissToast cleared the single slot).
export function clearToasts() {
  _service?.removeGroup?.(GROUP);
}
