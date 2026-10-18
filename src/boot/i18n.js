// vue-i18n, installed as Quasar's CLI installs it (its i18n preset: a boot file that app.use()s
// the instance). The instance lives in i18n/index.js, not here, because non-component code
// (services, stores) translates too; boot/jw.js chooses the locale once the settings are loaded.
// Quasar's own words (the table pager, the editor toolbar, the date picker) follow the same
// language through Quasar's language packs (quasar.dev/options/quasar-language-packs).
import { defineBoot } from "#q-app";
import { followQuasarLang } from "@delebash/ui";
import { i18n } from "../i18n/index.js";

export default defineBoot(({ app }) => {
  app.use(i18n);
  followQuasarLang(i18n, import.meta.glob("../../node_modules/quasar/lang/*.js"));
});
