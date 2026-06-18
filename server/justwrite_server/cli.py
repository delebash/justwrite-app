"""`justwrite-server` CLI — `serve` runs the FastAPI app via uvicorn.

Named `justwrite-server` (NOT `justwrite`): the Tauri desktop binary is
`justwrite(.exe)`, and a same-named console script makes the shell spawn
itself on Windows (CreateProcessW name resolution). Mirrors JustVoice.
"""

from __future__ import annotations

import typer
import uvicorn

from .app import create_app

app = typer.Typer(add_completion=False, help="JustWrite local server.")


@app.command()
def serve(host: str = "127.0.0.1", port: int = 17495) -> None:
    """Run the JustWrite server (default 127.0.0.1:17495)."""
    uvicorn.run(create_app(), host=host, port=port)
