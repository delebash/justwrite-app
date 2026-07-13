"""/v1/projects/*/autosave — the server-owned rotating disk autosave.

Ported verbatim from the Tauri Rust side (src-tauri/src/lib.rs `project_autosave*`,
removed in this same change): a 3-generation rotating snapshot file per project
(current -> prev -> prev2) written crash-safely via tmp-file + atomic rename, plus
list / read / delete. The renderer already PUTs the same snapshot to the DB
(PUT /v1/projects/{id}/book); this endpoint owns the extra on-disk JSON mirror so
the work survives a DB wipe and OS-level backups (OneDrive / Time Machine) pick the
file up. Moving the write off Rust also means autosave now runs in browser-dev.

Base dir = the `autosaveDir` setting (a real /v1/settings key), default
<AppState.data_dir>/projects. NOTE: this router MUST be mounted BEFORE
projects.router in app.py so the literal `/autosaves` + `/autosave-dir` path
segments win over projects' catch-all `/{project_id}` (FastAPI matches in
registration order, not by specificity).
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..app_state import get_state
from ..database import get_db
from ..models import Setting

router = APIRouter(tags=["autosave"], prefix="/v1/projects")

# generation -> filename suffix (the live file has no gen marker).
_GEN_SUFFIX = {
    "current": ".autosave.json",
    "prev": ".autosave.prev.json",
    "prev2": ".autosave.prev2.json",
}
# Suffix order matters when stripping a filename: `.autosave.prev2.json` also
# ends with `.autosave.json`, so match the LONGEST suffix first.
_SUFFIX_GEN = [
    (".autosave.prev2.json", "prev2"),
    (".autosave.prev.json", "prev"),
    (".autosave.json", "current"),
]


def _safe_id(s: str) -> str:
    """Sanitize a project id into a filesystem-safe stem (verbatim port of the
    Rust `safe_id`): keep ASCII alphanumerics + '-' + '_', map everything else to
    '_', and never yield an empty stem. Also blocks path traversal in a key."""
    cleaned = "".join(
        c if ((c.isascii() and c.isalnum()) or c in "-_") else "_" for c in s
    )
    return cleaned or "project"


def _resolve_dir(db: Session) -> Path:
    """The autosave folder: the `autosaveDir` setting when set, else
    <AppState.data_dir>/projects. Created on demand."""
    row = db.get(Setting, "autosaveDir")
    if row is not None:
        try:
            val = json.loads(row.value)
        except (ValueError, TypeError):
            val = None
        if isinstance(val, str) and val.strip():
            p = Path(val)
            p.mkdir(parents=True, exist_ok=True)
            return p
    p = get_state().data_dir / "projects"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _path_for_key(d: Path, key: str) -> Path | None:
    """Map a `<projectId>__<generation>` key to its on-disk path, or None if the
    key is malformed. `_safe_id` on the id half also blocks path traversal."""
    project_id, sep, generation = key.rpartition("__")
    if not sep or generation not in _GEN_SUFFIX:
        return None
    return d / f"{_safe_id(project_id)}{_GEN_SUFFIX[generation]}"


@router.post("/{project_id}/autosave", summary="Rotate + write the on-disk autosave for a project")
async def write_autosave(project_id: str, snapshot: dict, db: Session = Depends(get_db)) -> dict:
    d = _resolve_dir(db)
    pid = _safe_id(project_id)
    current = d / f"{pid}.autosave.json"
    prev = d / f"{pid}.autosave.prev.json"
    prev2 = d / f"{pid}.autosave.prev2.json"
    tmp = d / f"{pid}.autosave.tmp.json"

    # Write to tmp first, then rotate + atomic-rename so a crash mid-write can't
    # corrupt the live autosave (os.replace overwrites atomically cross-platform).
    tmp.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    if prev.exists():
        os.replace(prev, prev2)
    if current.exists():
        os.replace(current, prev)
    os.replace(tmp, current)

    return {"ok": True, "projectId": pid, "key": f"{pid}__current"}


@router.get("/autosaves", summary="List every on-disk autosave, newest first")
async def list_autosaves(db: Session = Depends(get_db)) -> list[dict]:
    d = _resolve_dir(db)
    out: list[dict] = []
    if not d.is_dir():
        return out
    for entry in d.iterdir():
        if not entry.is_file():
            continue
        name = entry.name
        project_id: str | None = None
        generation: str | None = None
        for suffix, gen in _SUFFIX_GEN:
            if name.endswith(suffix):
                project_id = name[: -len(suffix)]
                generation = gen
                break
        if generation is None or project_id is None:
            continue
        try:
            parsed = json.loads(entry.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        title = "Untitled"
        saved_at = ""
        if isinstance(parsed, dict):
            proj = parsed.get("project")
            if isinstance(proj, dict) and isinstance(proj.get("title"), str):
                title = proj["title"]
            if isinstance(parsed.get("savedAt"), str):
                saved_at = parsed["savedAt"]
        out.append(
            {
                "projectId": project_id,
                "title": title,
                "savedAt": saved_at,
                "generation": generation,
                "key": f"{project_id}__{generation}",
            }
        )
    # Most recent first; empty savedAt sorts last.
    out.sort(key=lambda e: e["savedAt"], reverse=True)
    return out


@router.get("/autosaves/{key}", summary="The parsed snapshot for one autosave key")
async def read_autosave(key: str, db: Session = Depends(get_db)) -> dict:
    d = _resolve_dir(db)
    path = _path_for_key(d, key)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="autosave not found")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise HTTPException(status_code=500, detail=f"autosave read failed: {e}") from e


@router.delete("/autosaves", status_code=204, summary="Delete ALL autosave files")
async def delete_all_autosaves(db: Session = Depends(get_db)) -> Response:
    d = _resolve_dir(db)
    if d.is_dir():
        for entry in d.iterdir():
            if entry.is_file() and any(entry.name.endswith(s) for s, _ in _SUFFIX_GEN):
                entry.unlink()
    return Response(status_code=204)


@router.delete("/autosaves/{key}", status_code=204, summary="Delete one autosave file")
async def delete_autosave(key: str, db: Session = Depends(get_db)) -> Response:
    d = _resolve_dir(db)
    path = _path_for_key(d, key)
    if path is not None and path.is_file():
        path.unlink()
    return Response(status_code=204)


@router.get("/autosave-dir", summary="The current autosave folder")
async def get_autosave_dir(db: Session = Depends(get_db)) -> dict:
    return {"dir": str(_resolve_dir(db))}


def _migrate_autosaves(old_dir: Path, new_dir: Path) -> None:
    """D3a (2026-07-13): when the autosave folder changes, MOVE the existing rotating
    files into the new folder so a folder change never loses the user's autosaves.
    Best-effort — a failed move must not fail the PUT; never clobbers a file already
    in the new folder. `shutil.move` (not os.replace) so a move across drives works.
    Only the 3 rotation generations move; the transient `.autosave.tmp.json` doesn't."""
    try:
        if old_dir == new_dir or not old_dir.is_dir():
            return
    except OSError:
        return
    suffixes = tuple(_GEN_SUFFIX.values())
    for entry in old_dir.iterdir():
        try:
            if not entry.is_file() or not entry.name.endswith(suffixes):
                continue
            target = new_dir / entry.name
            if target.exists():
                continue  # don't clobber an autosave already in the new folder
            shutil.move(str(entry), str(target))
        except OSError:
            continue  # best-effort, per file


@router.put("/autosave-dir", summary="Set the autosave folder (creates it; migrates existing files)")
async def put_autosave_dir(body: dict, db: Session = Depends(get_db)) -> dict:
    new_dir = (body or {}).get("dir")
    if not isinstance(new_dir, str) or not new_dir.strip():
        raise HTTPException(status_code=400, detail="dir is required")
    old_dir = _resolve_dir(db)  # the folder in use BEFORE the change (from the setting)
    p = Path(new_dir)
    p.mkdir(parents=True, exist_ok=True)
    _migrate_autosaves(old_dir, p)  # D3a: carry the user's autosaves to the new folder
    encoded = json.dumps(new_dir)
    row = db.get(Setting, "autosaveDir")
    if row is None:
        db.add(Setting(key="autosaveDir", value=encoded))
    else:
        row.value = encoded
    db.commit()
    return {"dir": str(p)}
