// vue-i18n, installed as Quasar's CLI installs it (its i18n preset: a boot file that app.use()s
// the instance). The instance lives in i18n/index.js, not here, because non-component code
// (services, stores) translates too; boot/jw.js chooses the locale once the settings are loaded.
import { defineBoot } from "#q-app";
import { i18n } from "../i18n/index.js";

export default defineBoot(({ app }) => {
  app.use(i18n);
});
