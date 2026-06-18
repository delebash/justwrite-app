"""The justwrite-server CLI exposes `serve` as a named subcommand.

Regression: a single-command Typer app collapses the command name, so
`justwrite-server serve` failed with "unexpected extra argument serve".
The callback in cli.py forces subcommand mode.
"""

from typer.testing import CliRunner

from justwrite_server.cli import app

runner = CliRunner()


def test_serve_is_a_named_subcommand():
    result = runner.invoke(app, ["serve", "--help"])
    assert result.exit_code == 0, result.output
    assert "--host" in result.output
    assert "--port" in result.output
    assert "--data-dir" in result.output


def test_no_args_lists_serve():
    result = runner.invoke(app, [])
    assert "serve" in result.output
