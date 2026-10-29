// @vitest-environment jsdom
//
// 2026-10-15 — Started and Deadline are dates (the user's "your rec on all go" on "store them as
// dates with a date picker, the way notes now work; old values stay as typed"). The kit's UiDate
// holds an ISO date, shows it in the interface language, and shows words typed before as typed.
// Mounted as the kit-component tests next door are (providerScope.test.js): Quasar installed as
// in the real app, JustWrite's real vue-i18n instance.
import { afterEach, describe, expect, it } from "vitest";
import { DOMWrapper } from "@vue/test-utils";
import { h, nextTick, ref } from "vue";

import UiDate from "@delebash/ui/common/components/UiDate.vue";
import { dateLabel, isIsoDate } from "@delebash/ui/common/services/isoDate.js";
import { createTestApp } from "@delebash/ui/quasar/install.js";
import { i18n, setLocale } from "../i18n/index.js";

let app;
let host;

function mount(initial) {
  const value = ref(initial);
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createTestApp({ render: () => h(UiDate, { modelValue: value.value, "onUpdate:modelValue": (v) => { value.value = v; } }) });
  app.use(i18n);
  app.mount(host);
  return value;
}
const shown = () => host.querySelector("input").value;
const settle = async () => {
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
  setLocale("en");
});

describe("dateLabel", () => {
  it("shows an ISO date in the interface language, read as a local date", () => {
    setLocale("en");
    expect(dateLabel("2027-03-01")).toBe("March 1, 2027");
    setLocale("es");
    expect(dateLabel("2027-03-01")).toBe("1 de marzo de 2027");
  });

  it("gives words typed before back as typed, and nothing for nothing", () => {
    expect(dateLabel("Spring 2027")).toBe("Spring 2027");
    expect(dateLabel("")).toBe("");
    expect(isIsoDate("2027-03-01")).toBe(true);
    expect(isIsoDate("March 1, 2027")).toBe(false);
  });
});

describe("UiDate", () => {
  it("shows the stored date, or the stored words", async () => {
    mount("2027-03-01");
    await settle();
    expect(shown()).toBe("March 1, 2027");
    app.unmount();
    mount("Spring 2027");
    await settle();
    expect(shown()).toBe("Spring 2027");
  });

  it("picks a day as an ISO date, and Clear empties it", async () => {
    const value = mount("2027-03-01");
    await settle();
    await new DOMWrapper(host.querySelector(".ui-date")).trigger("click");
    await settle();
    const day15 = [...document.querySelectorAll(".q-date__calendar-item button")].find((b) => b.textContent.trim() === "15");
    expect(day15).toBeTruthy();
    await new DOMWrapper(day15).trigger("click");
    await settle();
    expect(value.value).toBe("2027-03-15");

    await new DOMWrapper(host.querySelector(".ui-date")).trigger("click");
    await settle();
    const clear = [...document.querySelectorAll(".ui-date__actions button")][0];
    expect(clear?.textContent.trim()).toBe("Clear");
    await new DOMWrapper(clear).trigger("click");
    await settle();
    expect(value.value).toBe("");
  });
});
