// The kit's help-markdown renderer, exercised over THIS app's real docs.
//
// WHY: every Help surface renders its own title in a header bar — HelpView's
// PaneHeader, the kit's HelpDrawer, WhatsNewModal, KeyboardCheatsheet — so
// renderHelpMarkdown() strips the doc's leading H1 to avoid showing it twice.
// That strip was `/^#\s+.+\n+/`, and JS treats \r as a line terminator, so `.`
// never crossed it: on a CRLF checkout (git core.autocrlf, the default on
// Windows) the H1 survived and every doc rendered its title twice. Nothing
// caught it — the page still renders, the smoke still sees zero JS errors, and
// on a CI Linux checkout (LF) the strip worked, so it only ever showed up on
// the machine the app is developed on.
//
// The kit has no test harness of its own; this is the guard, and it lives here
// because the @delebash/llm-ui alias + `marked` dedupe are configured here.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHelpMarkdown } from "@delebash/llm-ui";
import { describe, expect, it } from "vitest";

const DOCS = fileURLToPath(new URL("../../docs", import.meta.url));
const DOC_FILES = readdirSync(DOCS).filter((f) => f.endsWith(".md"));

describe("renderHelpMarkdown", () => {
  it.each(["\n", "\r\n"])("strips the leading H1 with %j line endings", (eol) => {
    const md = ["# Story bible", "", "Your story bible is everything.", ""].join(eol);
    const html = renderHelpMarkdown(md);
    expect(html).not.toContain("<h1");
    expect(html).toContain("Your story bible is everything.");
  });

  it("keeps H1s that are not the leading title", () => {
    const md = "# Title\n\nIntro.\n\n# Later section\n";
    expect(renderHelpMarkdown(md)).toContain("<h1");
  });

  // The real corpus, in whatever line endings this checkout happens to have.
  it.each(DOC_FILES)("%s renders without a duplicated title", (file) => {
    const html = renderHelpMarkdown(readFileSync(join(DOCS, file), "utf8"));
    expect(html).not.toContain("<h1");
  });
});
