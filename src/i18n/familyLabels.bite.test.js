// @vitest-environment jsdom
// THE IN-PLACE INVARIANT, verified to bite (2026-08-04): configureFamilyLabels must
// deep-assign INTO the existing group objects, never replace them. Components capture
// group refs at setup (`const L = familyLabels.downloadBar`) — a door that swapped in
// a new group object would leave every mounted component pointing at the orphaned old
// one, frozen at English, silently. Two probes: the raw captured-ref case, and a real
// mounted kit component whose rendered text must follow a re-feed (live locale switch).
// Kit modules imported by relative path like familyContract.test.js — the kit index
// would drag styles.css + the full view graph into the test environment.
import { afterEach, describe, expect, it } from "vitest";
import { createApp, nextTick } from "vue";

import ConnectionError from "../../../just-llm-runner/ui/src/common/components/ConnectionError.vue";
import { FAMILY_LABELS } from "../../../just-llm-runner/ui/src/common/familyContract.js";
import { configureFamilyLabels, familyLabels } from "../../../just-llm-runner/ui/src/common/services/familyLabels.js";

afterEach(() => {
  // Re-feed the English canon so no later test inherits the probe words.
  configureFamilyLabels(JSON.parse(JSON.stringify(FAMILY_LABELS)));
});

describe("familyLabels — the one reactive store behind kit chrome", () => {
  it("deep-assigns in place: a group ref captured BEFORE configure sees the new words", () => {
    const captured = familyLabels.downloadBar;
    configureFamilyLabels({ downloadBar: { cancel: "Cancelar" } });
    expect(captured.cancel).toBe("Cancelar");
    expect(captured.retry).toBe(FAMILY_LABELS.downloadBar.retry); // a partial feed leaves other words alone
    expect(familyLabels.downloadBar).toBe(captured); // the group object itself was never swapped
  });

  it("a mounted kit component's text follows a re-feed", async () => {
    const host = document.createElement("div");
    const app = createApp(ConnectionError, { appName: "JustWrite", serverUrl: "http://localhost:9" });
    app.mount(host);
    expect(host.textContent).toContain("Can't reach the JustWrite server");
    configureFamilyLabels({
      connectionError: { title: "No se puede conectar con el servidor de {appName}", retry: "Reintentar" },
    });
    await nextTick();
    expect(host.textContent).toContain("No se puede conectar con el servidor de JustWrite");
    expect(host.textContent).toContain("Reintentar");
    app.unmount();
  });

  it("configureDialog stays a working alias over the one door", async () => {
    const { configureDialog, dialogLabels } = await import(
      "../../../just-llm-runner/ui/src/common/services/dialog.js"
    );
    configureDialog({ labels: { okLabel: "Vale" } });
    expect(dialogLabels.okLabel).toBe("Vale");
    expect(familyLabels.dialog.ok).toBe("Vale"); // same store, no second copy
    expect(dialogLabels.cancelLabel).toBe(FAMILY_LABELS.dialog.cancel); // partial feed left the rest
  });
});
