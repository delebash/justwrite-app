<script setup>
// Calendar + time picker that emits the same `YYYY-MM-DDTHH:mm` string the
// native datetime-local produced, so downstream sorting/formatting (which
// runs the value through `new Date()`) is unaffected. Built for fiction
// timelines: the year is a directly editable field with steppers, not a
// fiddly native spinner, so arbitrary years (past or far future) are easy.
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { computePosition, autoUpdate, offset, flip, shift, size } from "@floating-ui/dom";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Set date & time" },
  // Optional id applied to the trigger <button>, so a parent <label for>
  // can associate with the picker for screen readers and click-to-focus.
  inputId: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue"]);

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const open = ref(false);
const rootEl = ref(null);
const triggerEl = ref(null);
const popEl = ref(null);
let cleanupPos = null;

function tearDownPos() {
  if (cleanupPos) { cleanupPos(); cleanupPos = null; }
}
function setUpPos() {
  tearDownPos();
  if (!triggerEl.value || !popEl.value) return;
  cleanupPos = autoUpdate(triggerEl.value, popEl.value, () => {
    computePosition(triggerEl.value, popEl.value, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [
        offset(5),
        flip(),
        shift({ padding: 6 }),
        size({
          padding: 8,
          apply({ availableHeight, elements }) {
            elements.floating.style.maxHeight = `${Math.max(220, availableHeight)}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      if (!popEl.value) return;
      popEl.value.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    });
  });
}
watch(open, async (v) => {
  if (v) { await nextTick(); setUpPos(); }
  else tearDownPos();
});

// Selected parts. `day` is null until a calendar day is chosen — that is the
// signal for "no value". year/month/time still hold a sensible view default
// so the calendar has something to render and the time row is editable.
const year = ref(0);
const month = ref(0); // 0-11
const day = ref(null); // 1-31 | null
const hour = ref(0); // 0-23
const minute = ref(0);

// Days in a month, leap-year-correct for any year (avoids the 0-99 → 1900s
// quirk by using setFullYear).
function dim(y, m) {
  const d = new Date(2000, 0, 1);
  d.setFullYear(y, m + 1, 0);
  return d.getDate();
}
function firstDow(y, m) {
  const d = new Date(2000, 0, 1);
  d.setFullYear(y, m, 1);
  return d.getDay();
}
function pad(n, w = 2) { return String(Math.abs(n)).padStart(w, "0"); }

function parse(str) {
  if (!str) return null;
  const m = /^(\d{1,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str.trim());
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +m[4], mi: +m[5] };
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime()))
    return { y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes() };
  return null;
}

function syncFromValue(str) {
  const p = parse(str);
  const now = new Date();
  if (p) {
    year.value = p.y; month.value = p.mo; day.value = p.d;
    hour.value = p.h; minute.value = p.mi;
  } else {
    // Unparseable or empty: park the calendar on the current month/time but
    // leave day unset so we don't fabricate a value.
    year.value = now.getFullYear();
    month.value = now.getMonth();
    day.value = null;
    hour.value = now.getHours();
    minute.value = now.getMinutes();
  }
}
watch(() => props.modelValue, (v) => syncFromValue(v), { immediate: true });

const grid = computed(() => {
  const start = firstDow(year.value, month.value);
  const count = dim(year.value, month.value);
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
});

const hour12 = computed(() => (hour.value % 12) || 12);
const isPM = computed(() => hour.value >= 12);

const hasValue = computed(() => day.value != null);
const triggerLabel = computed(() => {
  if (hasValue.value) {
    const d = new Date(2000, 0, 1);
    d.setFullYear(year.value, month.value, day.value);
    d.setHours(hour.value, minute.value);
    const date = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return { text: `${date}  ·  ${time}`, raw: false };
  }
  if (props.modelValue?.trim()) return { text: props.modelValue.trim(), raw: true };
  return { text: props.placeholder, raw: true, empty: true };
});

function emitValue() {
  if (day.value == null) { emit("update:modelValue", ""); return; }
  emit("update:modelValue",
    `${pad(year.value, 4)}-${pad(month.value + 1)}-${pad(day.value)}T${pad(hour.value)}:${pad(minute.value)}`);
}
function clampDay() {
  const max = dim(year.value, month.value);
  if (day.value != null && day.value > max) day.value = max;
}

function pickDay(d) { if (d == null) return; day.value = d; emitValue(); }
function stepMonth(delta) {
  let m = month.value + delta;
  if (m < 0) { m = 11; year.value -= 1; }
  else if (m > 11) { m = 0; year.value += 1; }
  month.value = m;
  clampDay(); emitValue();
}
function setMonth(e) { month.value = +e.target.value; clampDay(); emitValue(); }
function stepYear(delta) { year.value += delta; clampDay(); emitValue(); }
function setYear(e) {
  const n = parseInt(e.target.value, 10);
  if (Number.isFinite(n)) { year.value = n; clampDay(); emitValue(); }
}

function setHour12(e) {
  let h = parseInt(e.target.value, 10);
  if (!Number.isFinite(h)) return;
  h = Math.min(12, Math.max(1, h)) % 12; // 12 → 0
  hour.value = isPM.value ? h + 12 : h;
  emitValue();
}
function setMinute(e) {
  let mi = parseInt(e.target.value, 10);
  if (!Number.isFinite(mi)) return;
  minute.value = Math.min(59, Math.max(0, mi));
  emitValue();
}
function setMeridiem(pm) {
  const base = hour.value % 12;
  hour.value = pm ? base + 12 : base;
  emitValue();
}

function setNow() {
  const n = new Date();
  year.value = n.getFullYear(); month.value = n.getMonth(); day.value = n.getDate();
  hour.value = n.getHours(); minute.value = n.getMinutes();
  emitValue();
}
function clearAll() {
  day.value = null;
  emit("update:modelValue", "");
}

function toggle() { open.value = !open.value; }
function close() { open.value = false; }
function onDocClick(e) {
  if (!open.value) return;
  const inRoot = rootEl.value && rootEl.value.contains(e.target);
  const inPop  = popEl.value && popEl.value.contains(e.target);
  if (!inRoot && !inPop) close();
}
function onKeydown(e) { if (e.key === "Escape" && open.value) { close(); e.stopPropagation(); } }
document.addEventListener("mousedown", onDocClick);
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocClick);
  tearDownPos();
});
</script>

<template>
  <div class="dtp" ref="rootEl" @keydown="onKeydown">
    <button ref="triggerEl" :id="inputId" type="button" class="dtp-trigger" :class="{ open, empty: triggerLabel.empty }" :aria-expanded="open" @click="toggle">
      <Icon name="Calendar" :size="14" class="dtp-trigger-ico" />
      <span class="dtp-trigger-label" :class="{ raw: triggerLabel.raw }">{{ triggerLabel.text }}</span>
      <Icon name="ChevDown" :size="13" class="dtp-trigger-chev" />
    </button>

    <Teleport to="body">
    <div v-if="open" ref="popEl" class="dtp-pop" @keydown="onKeydown">
      <div class="dtp-nav">
        <button type="button" class="dtp-ico-btn" v-tooltip.bottom="'Previous month'" @click="stepMonth(-1)">
          <Icon name="ChevLeft" :size="15" />
        </button>
        <select class="dtp-month" :value="month" @change="setMonth">
          <option v-for="(m, i) in MONTHS" :key="i" :value="i">{{ m }}</option>
        </select>
        <div class="dtp-year">
          <button type="button" class="dtp-ico-btn sm" v-tooltip.bottom="'Previous year'" @click="stepYear(-1)">
            <Icon name="ChevLeft" :size="13" />
          </button>
          <input class="dtp-year-input" type="number" :value="year" @input="setYear" @change="setYear" />
          <button type="button" class="dtp-ico-btn sm" v-tooltip.bottom="'Next year'" @click="stepYear(1)">
            <Icon name="ChevRight" :size="13" />
          </button>
        </div>
        <button type="button" class="dtp-ico-btn" v-tooltip.bottom="'Next month'" @click="stepMonth(1)">
          <Icon name="ChevRight" :size="15" />
        </button>
      </div>

      <div class="dtp-dow">
        <span v-for="d in DOW" :key="d">{{ d }}</span>
      </div>
      <div class="dtp-grid">
        <template v-for="(d, i) in grid" :key="i">
          <button v-if="d != null" type="button" class="dtp-day"
            :class="{ sel: d === day }" @click="pickDay(d)">{{ d }}</button>
          <span v-else class="dtp-day empty" />
        </template>
      </div>

      <div class="dtp-time">
        <span class="dtp-time-label">Time</span>
        <input class="dtp-time-input" type="number" min="1" max="12" :value="hour12" @input="setHour12" @change="setHour12" />
        <span class="dtp-colon">:</span>
        <input class="dtp-time-input" type="number" min="0" max="59" :value="pad(minute)" @input="setMinute" @change="setMinute" />
        <div class="dtp-merid" role="group" aria-label="AM/PM">
          <button type="button" :class="{ on: !isPM }" :aria-pressed="!isPM" @click="setMeridiem(false)">AM</button>
          <button type="button" :class="{ on: isPM }" :aria-pressed="isPM" @click="setMeridiem(true)">PM</button>
        </div>
      </div>

      <div class="dtp-foot">
        <button type="button" class="dtp-foot-btn ghost" @click="clearAll">Clear</button>
        <span class="dtp-foot-spacer" />
        <button type="button" class="dtp-foot-btn" @click="setNow">Now</button>
        <button type="button" class="dtp-foot-btn primary" @click="close">Done</button>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dtp { position: relative; }

.dtp-trigger {
  appearance: none; cursor: pointer; width: 100%;
  display: flex; align-items: center; gap: 9px;
  height: 34px; padding: 0 10px;
  border: 1px solid var(--border-strong); border-radius: 7px;
  background: var(--surface); font: inherit; font-size: 12.5px;
  color: var(--ink); text-align: left;
}
.dtp-trigger:hover { background: var(--surface-2); }
.dtp-trigger.open { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.dtp-trigger-ico { color: var(--muted); flex: none; }
.dtp-trigger-label { flex: 1; font-weight: 500; }
.dtp-trigger-label.raw { font-weight: 400; }
.dtp-trigger.empty .dtp-trigger-label { color: var(--muted); }
.dtp-trigger-chev { color: var(--muted); transition: transform .15s ease; }
.dtp-trigger.open .dtp-trigger-chev { transform: rotate(180deg); }

.dtp-pop {
  position: fixed; top: 0; left: 0; z-index: 250;
  width: 340px; padding: 12px;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 11px; box-shadow: 0 12px 36px rgba(0, 0, 0, .2);
  overflow: auto;
  overscroll-behavior: contain;
}

.dtp-nav { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.dtp-ico-btn {
  appearance: none; cursor: pointer; flex: none;
  width: 26px; height: 26px; display: grid; place-items: center;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink-2);
}
.dtp-ico-btn.sm { width: 20px; height: 22px; border-radius: 5px; }
.dtp-ico-btn:hover { background: var(--surface-2); color: var(--ink); border-color: var(--border-strong); }

.dtp-month {
  appearance: none; cursor: pointer; flex: 1; min-width: 0;
  height: 26px; padding: 0 6px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 600;
}
.dtp-month:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.dtp-year { display: flex; align-items: center; gap: 2px; flex: none; }
.dtp-year-input {
  width: 52px; height: 26px; padding: 0 4px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink);
  font: inherit; font-size: 12.5px; font-weight: 600; text-align: center;
  -moz-appearance: textfield;
}
.dtp-year-input::-webkit-outer-spin-button,
.dtp-year-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.dtp-year-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.dtp-dow {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
  margin-bottom: 2px;
}
.dtp-dow span {
  text-align: center; font-size: 10px; font-weight: 600;
  letter-spacing: .04em; color: var(--muted); padding: 4px 0;
}
.dtp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dtp-day {
  appearance: none; cursor: pointer;
  aspect-ratio: 1 / 1; border: 0; border-radius: 6px;
  background: none; color: var(--ink-2); font: inherit; font-size: 12px;
  display: grid; place-items: center;
}
.dtp-day:hover:not(.empty) { background: var(--surface-3); color: var(--ink); }
.dtp-day.sel { background: var(--accent); color: var(--on-accent); font-weight: 600; }
.dtp-day.empty { cursor: default; }

.dtp-time {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-soft);
}
.dtp-time-label {
  font-size: 10px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--muted); margin-right: auto;
}
.dtp-time-input {
  width: 40px; height: 28px; padding: 0;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink);
  font: inherit; font-size: 13px; font-weight: 600; text-align: center;
  -moz-appearance: textfield;
}
.dtp-time-input::-webkit-outer-spin-button,
.dtp-time-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.dtp-time-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.dtp-colon { font-weight: 700; color: var(--ink-2); margin: 0 -2px; }

.dtp-merid {
  display: flex; margin-left: 4px;
  border: 1px solid var(--border); border-radius: 6px; overflow: hidden;
}
.dtp-merid button {
  appearance: none; cursor: pointer;
  padding: 0 9px; height: 28px; border: 0; background: var(--surface);
  font: inherit; font-size: 11.5px; font-weight: 600; color: var(--muted);
}
.dtp-merid button + button { border-left: 1px solid var(--border); }
.dtp-merid button:hover { background: var(--surface-2); color: var(--ink); }
.dtp-merid button.on { background: var(--accent-soft); color: var(--accent-ink); }

.dtp-foot {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-soft);
}
.dtp-foot-spacer { flex: 1; }
.dtp-foot-btn {
  appearance: none; cursor: pointer;
  padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink-2);
  font: inherit; font-size: 12px; font-weight: 500;
}
.dtp-foot-btn:hover { background: var(--surface-2); color: var(--ink); border-color: var(--border-strong); }
.dtp-foot-btn.ghost { border-color: transparent; }
.dtp-foot-btn.ghost:hover { color: var(--accent-ink); }
.dtp-foot-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.dtp-foot-btn.primary:hover { filter: brightness(1.05); }
</style>
