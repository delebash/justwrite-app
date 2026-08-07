"""`justwrite-server` entry (serve.py) — the family shape (target-tree P3).

Replaces test_cli.py: the Typer cli died when the server entry moved to
serve.py (`justwrite-server serve`, argparse, bare form tolerated).
"""

from __future__ import annotations

import pytest

from justwrite_server import serve


def _main(monkeypatch, argv):
    monkeypatch.setattr("sys.argv", ["justwrite-server", *argv])
    serve.main()


def test_serve_help_names_the_options(monkeypatch, capsys):
    with pytest.raises(SystemExit) as e:
        _main(monkeypatch, ["--help"])
    assert e.value.code == 0
    out = capsys.readouterr().out
    assert "--host" in out
    assert "--port" in out
    assert "--data-dir" in out


def test_serve_is_the_accepted_command(monkeypatch, capsys):
    # `serve` is the canonical (and only) command; an unknown one is rejected
    # before anything boots.
    with pytest.raises(SystemExit) as e:
        _main(monkeypatch, ["frobnicate"])
    assert e.value.code == 2
    assert "serve" in capsys.readouterr().err
