"""ALIAS, not a copy — the whole error implementation lives in the kit
(`llm_runner.platform.errors`; JustWrite's file was the donor). This module
exists so the app's route files keep importing `from .errors import not_found`
etc. against the ONE family implementation; there is no logic here to drift,
and the guard holds this file to exactly this shape. A later sweep may dissolve
it into direct kit imports — the affected files are listed in the kit's
docs/target-tree.md "Alias registry". Handlers are registered by app.py via
`install_error_handlers(app, type_base=...)` — the type base is the only
per-app datum."""

from llm_runner.platform.errors import (  # noqa: F401 — re-export, the alias's whole job
    ApiError,
    bad_request,
    conflict,
    forbidden,
    internal,
    not_found,
    not_implemented,
    service_unavailable,
    unauthorized,
)
