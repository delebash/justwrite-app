// The KIT log-line grammar — the stamp localisation added 2026-07-19 (the user's
// ruling: "local in ui and iso in file"). The server writes strict ISO-8601 local
// stamps (logs_api.py `_FMT`); parseLogRows re-renders them in the reader's
// regional format for BOTH log surfaces (LogsPanel + ConsolePanel). Imported REAL
// via the alias subpath (the downloadRate.test.js precedent); pure string logic,
// no transport. The formatter is pinned to en-US here so the assertions don't
// drift with the CI box's locale — the product path passes `undefined` (= the
// reader's OS locale), which is the behaviour under test everywhere else.
import { describe, expect, it } from "vitest";

import {
  formatLogDay,
  formatLogStamp,
  parseEngineRows,
  parseLogRows,
} from "@delebash/llm-ui/services/logLines.js";

const EN_US = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const LINE = "2026-07-19T00:06:22.169 [WARNING] llm_runner.runner.lifecycle: old engine build b10064 still present";

describe("formatLogStamp", () => {
  it("renders the stamp in the reader's locale and drops the milliseconds", () => {
    const out = formatLogStamp(LINE, EN_US);
    // month-day-year + 12-hour AM/PM in en-US; the `,169` is gone. `\s` rather
    // than a literal space before AM: ICU picks that separator and it VARIES by
    // build (ASCII space on this Node, NARROW NO-BREAK SPACE U+202F on newer ICU),
    // so pinning one byte makes the suite fail on a Node bump for no real reason.
    expect(out).toContain("07/19/2026");
    expect(out).toMatch(/12:06:22\sAM/);
    expect(out).not.toContain(".169");
  });

  it("leaves everything after the stamp byte-identical", () => {
    const out = formatLogStamp(LINE, EN_US);
    expect(out.endsWith(" [WARNING] llm_runner.runner.lifecycle: old engine build b10064 still present")).toBe(true);
  });

  it("parses the bare date-time as LOCAL, not UTC", () => {
    // The server writes its own wall clock with no offset; reading it as UTC would
    // shift every line by the box's timezone. Compare against a Date built from the
    // same local components rather than hardcoding an hour.
    const local = new Date(2026, 6, 19, 0, 6, 22);
    expect(formatLogStamp(LINE, EN_US)).toContain(EN_US.format(local));
  });

  it("returns an unstamped line untouched", () => {
    // Tracebacks / wrapped messages / engine output carry no ISO stamp — they must
    // pass through unharmed rather than being mangled or blanked.
    const cont = '  File "runner.py", line 88, in load';
    expect(formatLogStamp(cont, EN_US)).toBe(cont);
    expect(formatLogStamp("", EN_US)).toBe("");
  });

  it("returns the line untouched when the stamp is not a real date", () => {
    const bogus = "2026-13-45T99:99:99.000 [INFO] x: y";
    expect(formatLogStamp(bogus, EN_US)).toBe(bogus);
  });
});

const EN_US_DAY = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

describe("formatLogDay", () => {
  it("renders a stored-log day id in the reader's locale", () => {
    expect(formatLogDay("2026-07-19", EN_US_DAY)).toBe("07/19/2026");
  });

  it("builds the date from PARTS so a date-only id never slips a day", () => {
    // The trap this pins: `new Date("2026-07-19")` is a date-ONLY ISO string and is
    // parsed as UTC, which renders as the 18th anywhere west of UTC. Asserting
    // against a locally-constructed Date makes this fail if the implementation ever
    // goes back to string parsing — on a machine in a negative-offset timezone.
    expect(formatLogDay("2026-07-19", EN_US_DAY)).toBe(EN_US_DAY.format(new Date(2026, 6, 19)));
  });

  it("passes a non-day value through untouched", () => {
    // "Live tail" and any malformed id must not become "Invalid Date" in the picker.
    expect(formatLogDay("live", EN_US_DAY)).toBe("live");
    expect(formatLogDay("", EN_US_DAY)).toBe("");
    expect(formatLogDay(undefined, EN_US_DAY)).toBe(undefined);
  });
});

describe("parseLogRows", () => {
  it("localises each stamp while preserving group-aware levels", () => {
    const rows = parseLogRows([LINE, "  continuation frame", "2026-07-19T00:06:23.001 [INFO] x: done"].join("\n"));
    expect(rows).toHaveLength(3);
    // stamps rewritten (no ISO `T` form left on the stamped rows)
    expect(rows[0].line).not.toMatch(/^2026-07-19T/);
    expect(rows[2].line).not.toMatch(/^2026-07-19T/);
    // the continuation line is untouched AND still inherits the WARNING group, so
    // a min-level filter keeps the whole block together
    expect(rows[1].line).toBe("  continuation frame");
    expect(rows[0].level).toBe("WARNING");
    expect(rows[1].level).toBe("WARNING");
    expect(rows[2].level).toBe("INFO");
  });

  it("carries the RAW server line alongside the display line", () => {
    // LogsPanel's Copy exports `raw` so a pasted log matches a downloaded one
    // (ISO + milliseconds), while the screen shows `line`. Both must describe the
    // same row — pinned together so a future change can't quietly localise `raw`.
    const [row] = parseLogRows(LINE);
    expect(row.raw).toBe(LINE);
    expect(row.raw).toContain("2026-07-19T00:06:22.169");
    expect(row.line).not.toBe(row.raw);
    expect(row.line).not.toContain(".169");
  });

  it("keeps raw and line equal on a line that carries no stamp", () => {
    const [row] = parseLogRows("  continuation frame");
    expect(row.raw).toBe("  continuation frame");
    expect(row.line).toBe(row.raw);
  });
});

describe("parseEngineRows", () => {
  it("leaves llama.cpp's own timestamp grammar alone", () => {
    // Engine stdout is the child's format, not ours — localising it would corrupt
    // lines we don't own.
    const engine = "[17495] 1.234.567.890 W load: something";
    expect(parseEngineRows(engine)[0].line).toBe(engine);
  });

  it("emits the same row shape as parseLogRows", () => {
    // ConsolePanel picks one parser at runtime and feeds both into the same
    // filter + render path, so the row contract must not diverge.
    const row = parseEngineRows("[17495] 1.234.567.890 W load: something")[0];
    expect(Object.keys(row).sort()).toEqual(["level", "line", "raw"]);
    expect(row.raw).toBe(row.line); // engine output is never re-stamped
  });
});
