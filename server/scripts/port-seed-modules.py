# SPDX-License-Identifier: MIT
"""Write JustWrite's seed DATA modules as JavaScript, straight from the Python source.

The two seed modules (`seed_presets.py`, `seed_feature_prompts.py`) are 2,201 lines of
literal data and the reasoning behind it. They are NOT re-typed for the Node server: this
script translates each module token by token, so every value, every named constant and
every comment comes across, and the JavaScript is then checked value for value against the
Python (`tests/seed_data.test.js` reads `tests/fixtures/python-seed-data.json`, written by
`dump-seed-data.py`).

    <JustWrite venv python> server/scripts/port-seed-modules.py

What the translation does:
  - a module-level `NAME = literal` / `NAME: type = literal` becomes `export const NAME = …;`
    (a private `_NAME` becomes an unexported `const NAME`), with the comment block above it;
  - strings are re-written as JavaScript strings (a triple-quoted multi-line string as a
    template literal), f-strings as template literals, adjacent string literals joined
    with `+`, True/False/None as true/false/null, `#` comments as `//`;
  - `json.dumps(...)` becomes `pyJson(...)` (the kit's byte-exact json.dumps);
  - the few statements that are code, not data (a helper function, two merge loops) are
    written by hand in HAND below, and land at their place in the module.

Until the Python server is deleted a change to a seed lands in both languages — re-run
this, then the check. After that, the .js files are the source.

The Python server it reads was deleted on 2026-10-08, after the port was checked; to run this
again, check out the commit before the deletion.
"""

from __future__ import annotations

import ast
import io
import json
import sys
import tokenize
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
PY = SERVER / "justwrite_server"
OUT = SERVER / "src"

STRINGY = {tokenize.STRING, tokenize.FSTRING_START}

# Statements that are code: their JavaScript, keyed by (module, the statement's first line).
HAND = {
    ("seed_feature_prompts.py", "def _writer(instruction: str) -> dict:"): (
        "function writer(instruction) {\n"
        "  return {\n"
        '    feature: "writerAI",\n'
        "    system: WRITER_SYSTEM,\n"
        '    user_template: `${instruction}\\n\\n--- BEGIN PASSAGE ---\\n{{passage}}\\n--- END PASSAGE ---`,\n'
        "  };\n"
        "}\n"
    ),
    ("seed_feature_prompts.py", "for _k, _lbl in _ACTION_LABELS.items():"): (
        "for (const [k, lbl] of Object.entries(ACTION_LABELS)) {\n"
        "  // setdefault: an action with no meta yet gets an entry appended (insertion order kept)\n"
        "  if (!Object.hasOwn(ACTION_META, k)) ACTION_META[k] = {};\n"
        "  ACTION_META[k].label = lbl;\n"
        "}\n"
    ),
    ("seed_feature_prompts.py", "for _key, _meta in _ACTION_META.items():"): (
        "for (const [key, meta] of Object.entries(ACTION_META)) {\n"
        "  // dict.update: existing keys keep their place, new ones are appended\n"
        "  if (Object.hasOwn(DEFAULT_FEATURE_PROMPTS, key)) Object.assign(DEFAULT_FEATURE_PROMPTS[key], meta);\n"
        "}\n"
    ),
}

IMPORTS = {
    "seed_feature_prompts.py": ['import { pyJson } from "@delebash/llm-runner/platform/pyjson";'],
}


def js_name(name: str) -> str:
    return name[1:] if name.startswith("_") else name


def template_literal(s: str, newlines: bool = True) -> str:
    """A JavaScript template literal for `s`; `newlines=False` writes line breaks as \\n."""
    out = s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${").replace("\r", "\\r")
    if not newlines:
        out = out.replace("\n", "\\n")
    return f"`{out}`"


def js_string(tok_text: str) -> str:
    value = ast.literal_eval(tok_text)
    if not isinstance(value, str):
        raise SystemExit(f"not a str literal: {tok_text[:40]}")
    stripped = tok_text.lstrip("rRbBuU")
    if stripped.startswith(('"""', "'''")) and "\n" in value:
        return template_literal(value)
    return json.dumps(value, ensure_ascii=False)


def js_fstring(text: str, names: dict[str, str]) -> str:
    node = ast.parse(text.strip(), mode="eval").body
    if not isinstance(node, ast.JoinedStr):
        raise SystemExit(f"not an f-string: {text[:40]}")
    parts = []
    for v in node.values:
        if isinstance(v, ast.Constant):
            parts.append(template_literal(v.value, newlines=False)[1:-1])
        elif isinstance(v, ast.FormattedValue) and isinstance(v.value, ast.Name) and v.conversion == -1 and v.format_spec is None:
            parts.append("${" + names.get(v.value.id, v.value.id) + "}")
        else:
            raise SystemExit(f"unsupported f-string part in {text[:60]}")
    return "`" + "".join(parts) + "`"


class Source:
    def __init__(self, text: str):
        self.text = text
        self.starts = [0]
        for line in text.splitlines(keepends=True):
            self.starts.append(self.starts[-1] + len(line))

    def off(self, rowcol) -> int:
        row, col = rowcol
        return self.starts[row - 1] + col

    def between(self, a, b) -> str:
        return self.text[self.off(a) : self.off(b)]


def translate_expr(src: Source, toks: list, names: dict[str, str]) -> str:
    """JavaScript for the token run `toks` (one expression), whitespace kept as written."""
    out = []
    i = 0
    prev_end = toks[0].start
    sig = [t for t in toks if t.type not in (tokenize.NL, tokenize.NEWLINE, tokenize.COMMENT)]

    def next_sig_type(k):
        for t in toks[k:]:
            if t.type in (tokenize.NL, tokenize.NEWLINE, tokenize.COMMENT):
                continue
            return t
        return None

    del sig
    while i < len(toks):
        t = toks[i]
        if t.type in (tokenize.NL, tokenize.NEWLINE):
            i += 1
            continue
        out.append(src.between(prev_end, t.start))
        if t.type == tokenize.COMMENT:
            out.append("//" + t.string[1:])
            prev_end = t.end
            i += 1
            continue
        if t.type == tokenize.STRING:
            out.append(js_string(t.string))
            prev_end = t.end
            i += 1
        elif t.type == tokenize.FSTRING_START:
            j = i
            depth = 0
            while True:
                if toks[j].type == tokenize.FSTRING_START:
                    depth += 1
                elif toks[j].type == tokenize.FSTRING_END:
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            out.append(js_fstring(src.between(t.start, toks[j].end), names))
            prev_end = toks[j].end
            i = j + 1
        elif t.type == tokenize.NAME:
            if t.string == "json" and i + 2 < len(toks) and toks[i + 1].string == "." and toks[i + 2].string == "dumps":
                out.append("pyJson")
                prev_end = toks[i + 2].end
                i += 3
                continue
            out.append({"True": "true", "False": "false", "None": "null"}.get(t.string, names.get(t.string, t.string)))
            prev_end = t.end
            i += 1
            continue
        else:
            if t.type == tokenize.OP and t.string in ("*", "**"):
                p = out_prev_sig(out)
                if p in ("[", ",", "{", "("):
                    out.append("...")
                    prev_end = t.end
                    i += 1
                    continue
            out.append(t.string)
            prev_end = t.end
            i += 1
            continue
        # a string just went out: implicit concatenation with the next string literal
        nxt = next_sig_type(i)
        if nxt is not None and nxt.type in STRINGY:
            out.append(" +")
    return "".join(out)


def out_prev_sig(out: list[str]) -> str:
    for s in reversed(out):
        t = s.strip()
        if t:
            return t[-1]
    return ""


def comment_block(src_lines: list[str], first: int, last: int) -> str:
    """Lines first..last (1-based, inclusive) that are comments or blank, as // lines."""
    out = []
    for n in range(first, last + 1):
        line = src_lines[n - 1].rstrip("\n").rstrip("\r")
        s = line.strip()
        if not s:
            if out and out[-1] != "":
                out.append("")
            continue
        if s.startswith("#"):
            out.append("//" + s[1:])
        else:
            raise SystemExit(f"unexpected text between statements at line {n}: {line!r}")
    while out and out[0] == "":
        out.pop(0)
    while out and out[-1] == "":
        out.pop()
    return "\n".join(out) + ("\n" if out else "")


def port(module: str, py_rel: str) -> str:
    path = PY / module
    text = path.read_text(encoding="utf-8")
    src = Source(text)
    lines = text.splitlines(keepends=True)
    tree = ast.parse(text)
    toks = list(tokenize.generate_tokens(io.StringIO(text).readline))

    # Names of every module-level constant → their JS name.
    names: dict[str, str] = {}
    for n in tree.body:
        if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name):
            names[n.targets[0].id] = js_name(n.targets[0].id)
        elif isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name):
            names[n.target.id] = js_name(n.target.id)
        elif isinstance(n, ast.FunctionDef):
            names[n.name] = js_name(n.name)

    out: list[str] = []
    out.append("// SPDX-License-Identifier: MIT\n")
    doc = ast.get_docstring(tree, clean=False) or ""
    out.append(f"// {module.replace('.py', '.js')} — the port of justwrite_server/{py_rel}.\n")
    out.append(
        "// GENERATED from the Python by server/scripts/port-seed-modules.py (2026-10-08): every value,\n"
        "// constant and comment comes across token for token, and tests/seed_data.test.js checks the\n"
        "// values against the Python's. Until the Python server is deleted a seed change lands in\n"
        "// both (re-run the script); after that this file is the source.\n//\n"
    )
    for line in doc.strip("\n").splitlines():
        out.append(("// " + line).rstrip() + "\n")
    out.append("\n")
    for imp in IMPORTS.get(module, []):
        out.append(imp + "\n")
    if IMPORTS.get(module):
        out.append("\n")

    prev_end_line = tree.body[0].end_lineno if isinstance(tree.body[0], ast.Expr) else 0
    for n in tree.body:
        if isinstance(n, ast.Expr) and n is tree.body[0]:
            continue
        if isinstance(n, (ast.ImportFrom, ast.Import)):
            prev_end_line = n.end_lineno
            continue
        block = comment_block(lines, prev_end_line + 1, n.lineno - 1)
        prev_end_line = n.end_lineno
        if block:
            out.append(block)
        first_line = lines[n.lineno - 1].strip()
        key = (module, first_line)
        if key in HAND:
            out.append(HAND[key])
            out.append("\n")
            continue
        if not isinstance(n, (ast.Assign, ast.AnnAssign)):
            raise SystemExit(f"{module}:{n.lineno}: no translation for {type(n).__name__}: {first_line}")
        target = n.targets[0].id if isinstance(n, ast.Assign) else n.target.id
        # The statement's tokens; the value starts after the first `=` at bracket depth 0.
        stmt = [t for t in toks if n.lineno <= t.start[0] <= n.end_lineno and t.type not in (tokenize.INDENT, tokenize.DEDENT, tokenize.ENDMARKER)]
        depth = 0
        eq = None
        for k, t in enumerate(stmt):
            if t.type == tokenize.OP:
                if t.string in "([{":
                    depth += 1
                elif t.string in ")]}":
                    depth -= 1
                elif t.string == "=" and depth == 0:
                    eq = k
                    break
        value = stmt[eq + 1 :]
        while value and value[-1].type in (tokenize.NEWLINE, tokenize.NL):
            value.pop()
        # A trailing comment on the statement's last line stays a comment after the `;`.
        trailing = ""
        if value and value[-1].type == tokenize.COMMENT and value[-1].start[0] == n.end_lineno and len(value) > 1:
            trailing = " //" + value[-1].string[1:]
            value.pop()
        expr = translate_expr(src, value, names).strip()
        kw = "const" if target.startswith("_") else "export const"
        out.append(f"{kw} {js_name(target)} = {expr};{trailing}\n\n")
    text_out = "".join(out).rstrip("\n") + "\n"
    return text_out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for module in ("seed_presets.py", "seed_feature_prompts.py"):
        js = port(module, module)
        dest = OUT / module.replace(".py", ".js")
        dest.write_text(js, encoding="utf-8", newline="\n")
        print(f"{module} -> {dest.relative_to(SERVER)} ({len(js.splitlines())} lines)")


if __name__ == "__main__":
    main()
