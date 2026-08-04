

> ✅ **CLOSED (docs campaign 2026-08-04)** — results consumed by the 07-06 tuning verdict; instrument spent. History/evidence only; live work: `docs/dev/TASKS.md`.
# On-box tests — profile A/B + switch cost + optimize check (2026-07-06)

**For the local Claude running on the 2070 SUPER box (8 GB VRAM · 32 GB RAM · Ryzen 5700X).**
These tests feed the model-per-hardware design discussion (remote session). Run them, fill the
RESULTS block at the bottom, and give it back to the user to paste into the remote session.

**Prereqs:** the hand-maintained router — llama-server **b9870** with
`src-tauri/target/debug/data/ai-cache/llamacpp/b9870/models.ini` (the two Gemma sections:
`writing-assistant-gemma-moe-mtp` = ctx 8192 / n-cpu-moe 20 / reasoning-budget 0, and
`book-chat-gemma-moe-mtp` = ctx 32768 / n-cpu-moe 21 / reasoning-budget 1024). Python 3.
⚠ Do NOT run the JustWrite app's local-llamacpp path at the same time (the :8080 collision rule).
⚠ NEVER request section B while section A is still awake — the documented co-load crash bricks the
second id until a router restart. Let idle-sleep (30 s) free VRAM between sections, or POST
`/models/unload` first.

## PRE-FLIGHT — confirm which config you're measuring (asked by the user: seeded vs original ini)

Run tests 0–2 against the **hand ini** (the manual router) — it is the instrument on this box, and
the app's seeded DB values were written FROM it (the seeding session live-verified "resolved switches
== the tuned ini + auto-MTP"; the only DB-side extras, `context-shift`/`cache-reuse`, are live-proven
auto-disabled no-ops for Gemma). Test 1's verdict is a DELTA between two sections differing only in
ctx/ncmoe/rb, so it transfers to the app path. Test 3 exercises the seeded/app path separately.

BUT the ini may have been hand-edited since the 2026-07-06 tuning session — so first CONFIRM the two
sections still carry the expected values, and record any drift in RESULTS:

| section | ctx-size | n-cpu-moe | batch/ubatch | threads | reasoning-budget |
|---|---|---|---|---|---|
| writing-assistant-gemma-moe-mtp | 8192 | 20 | 512/512 | 8 | 0 |
| book-chat-gemma-moe-mtp | 32768 | 21 | 512/512 | 8 | 1024 |

If the values differ, still run the tests (the A/B delta logic holds), but write the actual values
into RESULTS so the remote session interprets the numbers against the right config.

## STEP 0 — the gate: does per-request thinking-off work on Gemma 4?

The one-profile idea only works if thinking can be disabled PER-REQUEST against the 32k section
(launched with reasoning-budget 1024). llama-server accepts `chat_template_kwargs` per request; the
JW app already sends `{"enable_thinking": false}` to Qwen-family templates — whether Gemma 4's chat
template honors it is UNVERIFIED.

With ONLY `book-chat-gemma-moe-mtp` loaded, send the same short prompt twice and compare:

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "book-chat-gemma-moe-mtp",
  "messages": [{"role":"user","content":"Continue this story in one paragraph: The door creaked open and"}],
  "max_tokens": 150
}' | python -c "import json,sys; d=json.load(sys.stdin); m=d['choices'][0]['message']; print('reasoning_content present:', bool(m.get('reasoning_content'))); print('content head:', (m.get('content') or '')[:120])"
```

then the same with per-request thinking off:

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "book-chat-gemma-moe-mtp",
  "chat_template_kwargs": {"enable_thinking": false},
  "messages": [{"role":"user","content":"Continue this story in one paragraph: The door creaked open and"}],
  "max_tokens": 150
}' | python -c "import json,sys; d=json.load(sys.stdin); m=d['choices'][0]['message']; print('reasoning_content present:', bool(m.get('reasoning_content'))); print('content head:', (m.get('content') or '')[:120])"
```

**Gate:** if the second call STILL produces reasoning (a `reasoning_content` field, or a `<think>`
block in `content`, or a long silent pre-prose delay), per-request thinking control does NOT work for
Gemma → record that in RESULTS and skip Test 1's B-leg — the conclusion is already "two profiles
stand". If reasoning disappears, proceed.

## TEST 1 — the decisive A/B: writer TTFT on the 32k section

Save as `profile_ab.py` next to wherever you run it; it uses only the stdlib.

```python
import json, statistics, time, urllib.request

URL = "http://127.0.0.1:8080/v1/chat/completions"
# Writer-shaped prompt (~600 tokens of synthesized prose to continue — synthesized per the
# test-data decision, no real manuscript text).
PROMPT = ("Continue the following scene for about 150 words, matching tone. Scene: " +
          "The lighthouse keeper counted the storm's breaths between each sweep of the lamp. " * 40)

def run(model, extra=None, n=4):
    ttfts, rates = [], []
    for i in range(n):
        body = {"model": model, "messages": [{"role": "user", "content": PROMPT}],
                "max_tokens": 200, "temperature": 0.7, "stream": True}
        if extra:
            body.update(extra)
        req = urllib.request.Request(URL, json.dumps(body).encode(),
                                     {"Content-Type": "application/json"})
        t0 = time.perf_counter(); first = None; chunks = 0
        with urllib.request.urlopen(req) as r:
            for line in r:
                line = line.strip()
                if not line.startswith(b"data: "):
                    continue
                payload = line[6:]
                if payload == b"[DONE]":
                    break
                delta = json.loads(payload)["choices"][0].get("delta", {})
                if delta.get("content"):
                    if first is None:
                        first = time.perf_counter() - t0
                    chunks += 1
        total = time.perf_counter() - t0
        if first is not None:
            ttfts.append(first)
            if total > first and chunks > 1:
                rates.append((chunks - 1) / (total - first))
        print(f"  run {i}: ttft={first:.2f}s chunks={chunks} rate~{rates[-1] if rates else 0:.1f} tok/s")
    # Discard run 0 (warm-up / first load) from the medians.
    return statistics.median(ttfts[1:]), statistics.median(rates[1:])

print("A: writing-assistant section (8k, ncmoe 20, rb 0)")
a = run("writing-assistant-gemma-moe-mtp")
print("→ let the section idle-sleep (wait ~40s) before B, or POST /models/unload …")
time.sleep(45)
print("B: book-chat section (32k, ncmoe 21, rb 1024) + per-request thinking OFF")
b = run("book-chat-gemma-moe-mtp", {"chat_template_kwargs": {"enable_thinking": False}})
print(f"\nA median: ttft={a[0]:.2f}s rate={a[1]:.1f} tok/s")
print(f"B median: ttft={b[0]:.2f}s rate={b[1]:.1f} tok/s")
```

Notes: stream chunk-rate ≈ token rate on llama-server (one token per SSE chunk). Run 0 of each leg is
discarded (it pays the section load). Expected A ballpark from the 2026-07-06 tuning: TTFT ~1.7 s.

**Decision rule:** if B's median TTFT is within ~1 s of A (or ≤ 2.5 s absolute) AND the decode rate
is within ~20%, ONE profile is viable (run everything at 32k + rb 1024, disable thinking per-request
for writer tasks) → the profile concept + profile-keyed tunes are unnecessary. Otherwise TWO profiles
stand and the design owns the switch cost.

## TEST 2 — the switch price (safe path only)

With section A asleep (idle ≥ 30 s — confirm via the router's model list or just wait), time a first
request to B: the wall time to first token IS the profile-switch price on this box (expected 7–12 s
from the tuning session). One number, three repeats if patient. NEVER while A is awake (the co-load
crash).

## TEST 3 (optional) — the shipped Optimize button, on real hardware

In the app (manual router STOPPED): Settings → AI → Providers & models → Run Quick Setup → Apply
(let it load the picked model) → on the done step click **"Optimize for this PC (~4 min)"** → let it
finish → then:

```bash
curl -s "http://127.0.0.1:17495/v1/ai/model-tunes?modelId=<the-picked-model-id>" | python -m json.tool
```

Confirm rows exist (the sweep saved this machine's tune) and record the reported best tok/s. This is
the first real-hardware run of the auto-tune sweep.

## RESULTS — filled 2026-07-06 (desktop session; run on the HAND ini per the user's directive)

```
PRE-FLIGHT: ini matches the tuning-session values = Y (verified line-by-line: writer 8192/20/512/512/8/rb0;
  book-chat 32768/21/512/512/8/rb1024 — no drift; the 65536 ctx line remains commented out).

STEP 0 gate: enable_thinking per-request on Gemma = WORKS
  (evidence: default → reasoning_content 598ch, content still empty at max_tokens 150, wall 15.9s;
   {"chat_template_kwargs":{"enable_thinking":false}} → reasoning_content 0ch, no <think>, prose starts
   immediately, wall 3.9s. Reproduced earlier the same day on the seeded config: 513ch → 0ch.)

TEST 1 (CACHE-BUSTED — unique prompt head per run; the honest autocomplete-shaped number; medians of runs 1-3):
  A (writer 8k/ncmoe20/rb0):                   ttft=1.68s  rate=31.6 tok/s
  B (book-chat 32k/ncmoe21/rb1024, think-off): ttft=1.52s  rate=28.3 tok/s
TEST 1 (AS-WRITTEN, for completeness — prompt-cached, see caveat 3):
  A ttft=1.51s rate=32.1 · B ttft=1.38s rate=31.3
→ verdict: ONE profile viable. B's TTFT is EQUAL-OR-BETTER than A (delta −0.17s); decode ratio 0.89
  (within the 20% tolerance); the gate works. The 32k+rb1024 section with per-request thinking-off
  serves writer traffic at writer speed on this box.

TEST 2: switch price = 7.7 s (median of 3 explicit /models/unload switches: 7.7 / 7.5 / 8.1).
  (The 30s-idle-sleep path wasn't separately re-timed this pass; the tuning session measured it 7–12s.)

TEST 3: NOT run as written — deliberate: QuickSetup→Apply on this box triggers the D4 preset clobber
  (would rewrite the seeded two-model preset split, likely to Qwen via quality_rank 8 < 9). Equivalent
  evidence already on record: the auto-tune sweep ran twice through the app path earlier today (runner
  1984d92, review mode): 4 trials, winner n-cpu-moe 22 @ 23.4 tok/s via the 5% tie band, ncmoe 19
  failed bounded at 240s, 18 pruned monotonically; the save path is unit-tested.

BONUS — seeded (DB-generated ini, app router) vs hand ini, same suite (the day's first run hit the
  app router before the user's restart): seeded A ttft=1.68s rate=30.5 · seeded B ttft=1.53s rate=25.0
  → indistinguishable from the hand ini (the B-rate gap sits inside the ±10% MTP-acceptance noise
  band). Empirical answer to the seeded-vs-original question: same performance, as designed.

INCIDENTS for the design discussion:
  1. A SLEEPING router child is NOT VRAM-free — the app router's sleeping qwen3.6 child held enough
     CUDA footprint to OOM the book-chat load twice (native autoload does no eviction; models-max 2
     was satisfied so nothing was evicted). In-app the arbiter's _admit would have evicted it first —
     but DIRECT-to-router clients (this test; any external tool pointed at :8080) bypass the arbiter.
     On an 8 GB card, a sleeping third model can push a maxed profile over the OOM edge.
  2. Stopping the JW server ORPHANS its router child on Windows — the :8080 llama-server survives and
     keeps serving the generated ini; the user's "restarted with the correct ini" confusion this
     session was the orphan still holding the port. Candidate fix: Job-Object/process-group teardown.
  3. Method caveat for re-runs: the as-written Test 1 repeats one prompt verbatim → runs 1-3 hit the
     llama prompt cache and TTFT collapses to decode-only; the cache-busted variant is the number that
     matches real autocomplete traffic (each keystroke burst = a new prefix).
```
