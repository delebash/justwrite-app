"""/v1/projects — per-project ZIP export / import (JW-local).

A book travels as a single `<title>.zip` whose contents unzip to a `<title>/`
folder holding `book.json` (the `exportSnapshot()` / `book_io` shape) and an
`images/` folder of the book's image files. The SERVER owns the data: export
assembles the book and externalizes its image bytes into the zip; import parses
the zip, re-uploads the images as fresh ImageBlobs, and decomposes into a NEW
project. Deciding *where* to write/read the zip is the desktop shell's native
dialog; this module only produces/consumes bytes — so it is pytest-testable and
performs no arbitrary-path filesystem access.

Import shares ONE core with the sample seeder: `book_io.import_book_snapshot`.
"""

from __future__ import annotations

import base64
import binascii
import io
import json
import re
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import book_io
from ..database import get_db

router = APIRouter(tags=["projects"], prefix="/v1/projects")


def _safe_title(title: str) -> str:
    """The book title made filesystem-safe — drops only chars illegal in Windows /
    POSIX filenames, otherwise preserved — so the zip is `<Title>.zip` unzipping to
    a `<Title>/` folder (user: "zip file should be name of book"). Never empty."""
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title or "").strip().rstrip(".")
    return s or "book"


@router.get("/{project_id}/export", summary="Export a project as a .zip (book.json + images/)")
async def export_project(project_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    snap = book_io.assemble(db, project_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="project not found")
    snap, files = book_io.externalize_images(db, snap)

    folder = _safe_title((snap.get("project") or {}).get("title") or "book")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder}/book.json", json.dumps(snap, ensure_ascii=False, indent=2))
        for fname, raw in files.items():
            zf.writestr(f"{folder}/images/{fname}", raw)
    buf.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{folder}.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


class BookZipUpload(BaseModel):
    # base64 of the .zip bytes — same upload style as /v1/images (no
    # python-multipart dependency; keeps the dependency surface identical).
    zipBase64: str


def _find_book_json(zf: zipfile.ZipFile) -> str | None:
    """The `<folder>/book.json` (or a bare `book.json`) inside the zip — the shape
    export writes. Prefer the shallowest match so a nested stray can't hijack it."""
    names = [
        n for n in zf.namelist()
        if n == "book.json" or (n.endswith("/book.json") and n.count("/") == 1)
    ]
    return min(names, key=len) if names else None


@router.post("/import", summary="Import a .zip as a NEW project")
async def import_project(body: BookZipUpload, db: Session = Depends(get_db)) -> dict:
    try:
        raw = base64.b64decode(body.zipBase64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="invalid base64") from exc
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="not a valid zip") from exc

    with zf:
        book_name = _find_book_json(zf)
        if book_name is None:
            raise HTTPException(status_code=400, detail="zip has no book.json")
        try:
            snap = json.loads(zf.read(book_name))
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(status_code=400, detail="book.json is not valid JSON") from exc
        img_dir = book_name[: -len("book.json")] + "images/"  # "<folder>/images/" or "images/"
        files: dict[str, bytes] = {
            info.filename[len(img_dir):]: zf.read(info)
            for info in zf.infolist()
            if not info.is_dir() and info.filename.startswith(img_dir)
        }

    if not isinstance(snap, dict):
        raise HTTPException(status_code=400, detail="book.json must be an object")
    project_id = f"prj_{uuid.uuid4().hex}"
    book_io.import_book_snapshot(db, snap, files, project_id)
    db.commit()
    title = (snap.get("project") or {}).get("title") or "Untitled"
    return {"id": project_id, "title": title, "created": True}
