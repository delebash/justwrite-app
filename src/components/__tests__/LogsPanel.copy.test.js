// @vitest-environment jsdom
//
// COPY EXPORTS RAW ISO, THE SCREEN SHOWS LOCAL (2026-07-19, the user's ruling:
// "local in ui and iso in file"; Copy ruled file-shaped).
//
// The trap this guards: LogsPanel's Copy maps the PARSED rows, and those rows are
// now locale-formatted for display. Copying `r.line` would hand a bug report
// `07/19/2026, 12:06:22 AM` with the milliseconds stripped, while the Download
// button beside it hands ISO — two formats for the same log. Copy therefore maps
// `r.raw`. Copying the unparsed blob instead would ALSO be wrong: it silently
// discards the level filter, so "Errors only" would paste the whole log.
//
// Why a MOUNT test: the contract is behavioral (what lands on the clipboard), and
// neither biome nor build:vite executes the SFC — only running it proves the
// mapping fires. The kit has no harness of its own; JW's is where kit components
// get tested (the ProviderForm.keyReveal.test.js precedent). Mounted with plain
// createApp; fetch and the clipboard are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";

import LogsPanel from "@delebash/llm-ui/components/LogsPanel.vue";

// Two INFO lines and an ERROR with a continuation, exactly as the server writes
// them since logs_api.py `_FMT` went strict-ISO.
const SERVER_BLOB = [
  "2026-07-19T00:06:22.169 [INFO] seed: info line one",
  "2026-07-19T00:06:23.001 [ERROR] seed: boom happened",
  "  Traceback (most recent call last): continuation line",
].join("\n");

let app;
let host;
let copied;

function jsonOk(obj) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

beforeEach(() => {
  copied = null;
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/v1/logs/days")) return jsonOk({ days: [] });
    if (u.includes("/v1/logs/tail")) return jsonOk({ text: SERVER_BLOB, lines: 3 });
    return jsonOk({});
  }));
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (t) => { copied = t; } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});

async function mountPanel() {
  app = createApp(LogsPanel);
  app.mount(host);
  // let onMounted's loadDays + refresh resolve
  for (let i = 0; i < 6; i++) await nextTick();
  return host;
}

function clickCopy() {
  const btn = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Copy");
  if (!btn) throw new Error("Copy button not found");
  btn.click();
}

describe("LogsPanel Copy", () => {
  it("copies the RAW server lines — ISO stamps, milliseconds intact", async () => {
    await mountPanel();
    clickCopy();
    await nextTick();
    expect(copied).toBe(SERVER_BLOB);
    expect(copied).toContain("2026-07-19T00:06:22.169");
    // the localised display form must NOT reach the clipboard
    expect(copied).not.toContain("07/19/2026");
  });

  it("still shows the LOCALISED stamp on screen", async () => {
    // The same mount proves the two forms coexist — a fix that made Copy correct by
    // un-localising the display would pass the test above and fail this one.
    await mountPanel();
    expect(host.textContent).toContain("07/19/2026");
    expect(host.textContent).not.toContain("2026-07-19T00:06:22.169");
  });
});
