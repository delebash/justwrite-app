// Every unit test runs the way the app boots: JustWrite's vue-i18n instance is handed to the kit
// (src/boot/jw.js → installLlmUi), so kit code outside a component — a service's message, a label
// helper — answers from JustWrite's catalog, and the kit's "read before installLlmUi" warning stays
// for real mistakes. A mounting test still installs the instance on its own app (`app.use(i18n)`):
// the kit's createTestApp builds a fresh app each time.
import { setKitI18n } from "@delebash/ui/common/services/kitI18n.js";
import { i18n } from "./index.js";

setKitI18n(i18n);
