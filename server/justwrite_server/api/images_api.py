"""/v1/images — server-side image blob store (P4).

Moves images off the renderer's Tauri-FS bridge / data-URL-in-snapshot:
the renderer uploads bytes (base64 JSON — no python-multipart dependency),
references the returned id from a project's `images` records (as `serverId`),
and renders them with `<img src="…/v1/images/{id}">`. base64 (vs multipart)
keeps the dependency surface identical to the rest of the server.
"""

from __future__ import annotations

import base64
import binascii
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..database.models import ImageBlob

router = APIRouter(tags=["images"], prefix="/v1/images")


class ImageUpload(BaseModel):
    name: str = ""
    mime: str = "application/octet-stream"
    dataBase64: str


@router.post("", summary="Upload an image; returns its id")
async def upload(body: ImageUpload, db: Session = Depends(get_db)) -> dict:
    try:
        raw = base64.b64decode(body.dataBase64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="invalid base64") from exc
    image_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    db.add(ImageBlob(
        id=image_id, name=body.name,
        mime=body.mime or "application/octet-stream", data=raw, created_at=now,
    ))
    db.commit()
    return {"id": image_id, "name": body.name, "mime": body.mime, "addedAt": now}


@router.get("/{image_id}", summary="Fetch image bytes")
async def fetch(image_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(ImageBlob, image_id)
    if row is None:
        raise HTTPException(status_code=404, detail="image not found")
    return Response(content=row.data, media_type=row.mime or "application/octet-stream")


@router.delete("/{image_id}", status_code=204, summary="Delete an image")
async def remove(image_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(ImageBlob, image_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=204)
