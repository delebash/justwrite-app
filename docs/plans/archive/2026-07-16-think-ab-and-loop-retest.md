# On-box tests — think OFF vs ON A/B + the b9993 loop re-test (2026-07-16)

> ⚠️ **RESULTS NEVER FILLED (found by the docs campaign 2026-08-04).** The two user-ordered on-box tests (think OFF/ON A/B - b9993 loop re-test) appear never to have run: the RESULTS block below is an empty template. Run-or-kill is the user's ruling, tracked in `docs/dev/TASKS.md`.

**For the user's 2070S box.** Two tests, both user-ordered. Fill the RESULTS block and
paste it back. Pattern + method inherited from the proven 2026-07-06 instrument
(`2026-07-06-onbox-profile-ab-test.md`): run 0 of every arm is warm-up and discarded,
medians of the rest, and every prompt carries a unique nonce prefix (the llama prompt
cache otherwise collapses TTFT — that doc's caveat 3).

**Prereqs:** the app running normally (server on :17495, model loaded — Gemma
26B-A4B). For TEST 2 you also need the engine's own port: AI page → Server console —
the llama-server child prints its listen port at spawn. Do NOT run the manual router
at the same time.

**Context for reading the numbers:** on this box every think-ON level emits the SAME
layered budget (your class row, 1024) — that is the design, not a bug — so the arms
that matter here are OFF vs ON. `--levels` exists for future boxes/cloud (all five are
accepted).

## PRE-FLIGHT — print what a chat run will actually emit

```bash
curl -s "http://127.0.0.1:17495/v1/ai/resolved-route?feature=chat" | python -m json.tool
```

Record `think`, `value`, `valueSource` in RESULTS. Expected on this box:
`think: true · value: 1024 · valueSource: "class"` (or `"tune"` if you've applied a
tune carrying the row). Anything else — stop and report before running the arms.

## TEST 1 — think OFF vs ON: wall time + output quality (the original question)

Save as `think_ab.py`, run `python think_ab.py` (defaults: server :17495, arms
off+medium, n=4). Outputs land in `think_ab_out/` — read the answers blind (files are
named by arm) and judge quality yourself; the script judges nothing.

```python
import argparse, json, pathlib, statistics, time, urllib.request

CORPUS = ("[1] Story Bible — Mara Voss: lighthouse keeper, widowed, counts storm breaths. "
          "[2] Chapter 3: The lamp turned twice before Mara admitted the boat was real. " * 120)
QUESTION = "Who is Mara Voss, what does she believe about the boat, and which excerpts say so?"

def run_one(server, think, level, nonce):
    body = {"action": "chat", "think": think,
            "vars": {"excerpts": f"run-{nonce} " + CORPUS, "question": QUESTION}}
    if think and level:
        body["reasoningEffort"] = level
    req = urllib.request.Request(f"{server}/v1/ai/run", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.load(r)
    wall = time.perf_counter() - t0
    return wall, d.get("completionTokens", 0), d.get("content", "")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://127.0.0.1:17495")
    ap.add_argument("--levels", default="off,medium")  # any of: off,low,medium,high,xhigh,max
    ap.add_argument("--n", type=int, default=4)
    a = ap.parse_args()
    out = pathlib.Path("think_ab_out"); out.mkdir(exist_ok=True)
    print(f"arms={a.levels} n={a.n} (run 0 discarded per arm)")
    for arm in a.levels.split(","):
        arm = arm.strip(); think = arm != "off"
        walls, toks = [], []
        for i in range(a.n):
            wall, ct, content = run_one(a.server, think, "" if not think else arm, f"{arm}{i}")
            (out / f"{arm}_{i}.txt").write_text(content, encoding="utf-8")
            print(f"  {arm} run {i}: wall={wall:.1f}s completionTokens={ct}")
            if i > 0:
                walls.append(wall); toks.append(ct)
        print(f"{arm}: median wall={statistics.median(walls):.1f}s "
              f"median completionTokens={statistics.median(toks):.0f}")

if __name__ == "__main__":
    main()
```

## TEST 2 — the loop re-test at b9993 (engine-direct, unlimited budget, bounded by the harness)

The original loop determination was at b9870; the b9993 pin includes b9986 (a
chat-template reasoning-leak fix), so current behavior needs its own measurement. The
harness's own `max_tokens: 8192` is the safety net — worst case is one bounded ~4-5 min
run, no server kill needed.

**Verdict rule, declared before running:** LOOP CONFIRMED at b9993 = thinking hits the
ceiling without self-terminating AND the repetition score is high (shingle-duplicate
fraction ≥ 0.5 — adjustable, it is a reporting aid not a gate) on any long-prompt run.
NO LOOP at b9993 = thinking self-terminates well below the ceiling with progressing
content on all runs. Anything between = ambiguous — paste the data, the user judges.
A refutation at b9993 does NOT retroactively falsify the b9870 observation.

Save as `loop_retest.py`; run
`python loop_retest.py --engine http://127.0.0.1:<PORT> --model <loaded-model-id>`.

```python
import argparse, json, statistics, time, urllib.request

LONG = ("Analyze the following manuscript excerpts and answer: which claims about the "
        "lighthouse keeper are contradicted across chapters, and where? "
        + "[1] The lamp turned twice before Mara admitted the boat was real. " * 400)
SHORT = "Continue this story in one paragraph: The door creaked open and"

def shingle_rep(text, k=6):
    words = text.split()
    if len(words) < k * 2: return 0.0
    sh = [" ".join(words[i:i+k]) for i in range(len(words) - k + 1)]
    return 1.0 - len(set(sh)) / len(sh)

def run(engine, model, prompt, tag):
    body = {"model": model, "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 8192, "stream": False,
            "chat_template_kwargs": {"enable_thinking": True},
            "reasoning_budget_tokens": -1}
    req = urllib.request.Request(f"{engine}/v1/chat/completions", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=900) as r:
        d = json.load(r)
    wall = time.perf_counter() - t0
    m = d["choices"][0]["message"]
    think_txt = m.get("reasoning_content") or ""
    content = m.get("content") or ""
    total = d.get("usage", {}).get("completion_tokens", 0)
    ceiling = total >= 8100  # within noise of the max_tokens net
    self_term = bool(content.strip()) and not ceiling
    print(f"{tag}: wall={wall:.0f}s completion_tokens={total} thinking_chars={len(think_txt)} "
          f"answer_chars={len(content)} self_terminated={self_term} "
          f"repetition={shingle_rep(think_txt):.2f}")
    return self_term

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True)
    ap.add_argument("--model", required=True)
    a = ap.parse_args()
    results = [run(a.engine, a.model, LONG, f"long-{i}") for i in range(3)]
    results.append(run(a.engine, a.model, SHORT, "short-0"))
    print("all self-terminated → NO LOOP at b9993; any ceiling-hit + high repetition → LOOP CONFIRMED")

if __name__ == "__main__":
    main()
```

## RESULTS — (fill and paste back)

```
PRE-FLIGHT: think=____ value=____ valueSource=____
TEST 1 (off vs on, medians of runs 1..n-1):
  off:    wall=____s  completionTokens=____
  medium: wall=____s  completionTokens=____
  quality (blind read, your words): ____
TEST 2 (b9993, unlimited budget, 8192 net):
  long-0/1/2 + short-0: (paste the four printed lines)
  verdict: ____
```
