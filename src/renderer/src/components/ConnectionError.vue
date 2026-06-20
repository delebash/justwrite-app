<script setup>
// Shown (in place of the whole app) when the JustWrite server can't be reached
// at boot. The renderer holds no data of its own, so there's nothing useful to
// render without the backend — we surface a clear error + retry instead of a
// fake demo with silently-failing saves.
import { SERVER_BASE } from "../services/serverApi.js";
const isDev = import.meta.env.DEV;
function retry() { location.reload(); }
</script>

<template>
  <div class="conn-err">
    <div class="conn-err__card">
      <div class="conn-err__icon">⚠️</div>
      <h1>Can't reach the JustWrite server</h1>
      <p>
        JustWrite needs its local server to load and save your work. It isn't
        responding at <code>{{ SERVER_BASE }}</code>.
      </p>
      <p v-if="isDev" class="conn-err__hint">
        Dev: start it with <code>npm run server</code> in the project root, then retry.
      </p>
      <button class="conn-err__btn" type="button" @click="retry">Retry</button>
    </div>
  </div>
</template>

<style scoped>
.conn-err { position: fixed; inset: 0; display: grid; place-items: center; background: var(--app-bg, #f6f4ef); padding: 24px; }
.conn-err__card { max-width: 460px; text-align: center; background: var(--surface, #fff); border: 1px solid var(--border, #e6e1d8); border-radius: 14px; padding: 32px 28px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
.conn-err__icon { font-size: 34px; line-height: 1; }
.conn-err__card h1 { font-size: 18px; margin: 14px 0 8px; color: var(--ink, #2b2620); }
.conn-err__card p { color: var(--ink-muted, #6b6357); font-size: 13.5px; line-height: 1.55; margin: 0 0 10px; }
.conn-err__hint { font-size: 12.5px; }
.conn-err code { background: var(--surface-2, #f0ece4); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
.conn-err__btn { margin-top: 16px; padding: 9px 22px; border: 0; border-radius: 8px; background: var(--accent, #2f6e4f); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
.conn-err__btn:hover { filter: brightness(1.06); }
</style>
