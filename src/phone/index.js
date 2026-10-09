// SPDX-License-Identifier: MIT
// The phone: what JustWrite does differently in its Capacitor app (the kit's
// docs/plans/2026-10-08-the-phone.md). quasar.config.js maps `#phone` here for a Capacitor build —
// and for a browser try-out with JUSTWRITE_IN_APP_SERVER=1 — and to none.js on a computer, where
// `phone` is null. The boot file starts the in-app server through it; everything else reaches it
// through services/native.js, the one door to native features.
import { startInAppServer } from "./boot.js";
import { saveFile, scanCode } from "./plugins.js";

export const phone = { startInAppServer, saveFile, scanCode };
