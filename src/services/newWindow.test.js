// @vitest-environment jsdom
// This page in a new window (2026-10-29): the kit's call (app-structure §19) — window.open on the
// app's own address for the route; never on the phone, which has no windows.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter, createWebHashHistory } from "vue-router";

let phone = false;
vi.mock("./native.js", () => ({ isPhone: () => phone }));
const { canOpenNewWindow, openInNewWindow } = await import("./newWindow.js");

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: "/:any(.*)*", component: { render: () => null } }],
});

describe("a new window", () => {
  afterEach(() => {
    phone = false;
    vi.restoreAllMocks();
  });

  it("opens the current page's address, apart from this window", async () => {
    await router.push("/characters/c1");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(openInNewWindow(router)).toBe(true);
    expect(open).toHaveBeenCalledWith(router.resolve("/characters/c1").href, "_blank", "noopener");
    expect(open.mock.calls[0][0]).toMatch(/#\/characters\/c1$/);
  });

  it("is not offered on the phone", () => {
    phone = true;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(canOpenNewWindow()).toBe(false);
    expect(openInNewWindow(router)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
