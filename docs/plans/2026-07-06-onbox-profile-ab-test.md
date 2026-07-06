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

## RESULTS — fill and return

```
STEP 0 gate: enable_thinking per-request on Gemma = WORKS / NO EFFECT (evidence: …)
TEST 1: A ttft=__s rate=__ tok/s · B ttft=__s rate=__ tok/s → verdict: ONE profile / TWO profiles
TEST 2: switch price = __ s (median of __ runs)
TEST 3 (optional): sweep completed=Y/N · saved rows=Y/N · best tok/s=__ · anything odd: …
```
