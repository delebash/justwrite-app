"""`justwrite-server` CLI — `serve` runs the FastAPI app via uvicorn.

Named `justwrite-server` (NOT `justwrite`): the Tauri desktop binary is
`justwrite(.exe)`, and a same-named console script makes the shell spawn
itself on Windows (CreateProcessW name resolution). Mirrors JustVoice.
"""

from __future__ import annotations

from pathlib import Path

import typer
import uvicorn

from .app import create_app
from .version import PRODUCT, VERSION

app = typer.Typer(
    name="justwrite-server",
    no_args_is_help=True,
    help="JustWrite local server.",
)


@app.callback()
def _main() -> None:
    """JustWrite local server — FastAPI + SQLite backend.

    A callback keeps Typer in subcommand mode even with a single command,
    so `justwrite-server serve` works (a lone command would otherwise be
    invoked as `justwrite-server`, rejecting `serve` as an extra argument).
    """


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", envvar="JUSTWRITE_HOST"),
    port: int = typer.Option(17495, "--port", envvar="JUSTWRITE_PORT"),
    data_dir: Path | None = typer.Option(None, "--data-dir", envvar="JUSTWRITE_DATA_DIR"),
) -> None:
    """Run the JustWrite server (default 127.0.0.1:17495)."""
    typer.secho(f"{PRODUCT} {VERSION} — http://{host}:{port}/", fg=typer.colors.GREEN)
    application = create_app(data_dir)
    # Seed the demo project + default LLM providers now that the DB is up
    # (create_app ran init_db). Kept here — and in the workspace-reset handler —
    # rather than in create_app(), so the pytest suite's create_app(tmp_path)
    # clients still start from an empty database.
    from .seed import seed_workspace

    seed_workspace()
    uvicorn.run(application, host=host, port=port)


if __name__ == "__main__":
    app()
