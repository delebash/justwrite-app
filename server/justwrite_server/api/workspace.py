"""/v1/workspace — workspace-level operations.

`DELETE /v1/workspace` is the "Reset workspace" wipe: it clears EVERY data table
(settings, projects + all cascaded book rows, sessions, usage, providers,
versions, chat, …) in one call, then the renderer reloads and re-seeds. Replaces
the renderer's old `clearPrefix("justwrite:")` kv wipe, which since P2 only
cleared kv and left the SQL tables (projects, sessions, …) behind.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Base

router = APIRouter(tags=["workspace"], prefix="/v1/workspace")


@router.delete("", status_code=204, summary="Reset the workspace — wipe ALL data")
async def reset_workspace(db: Session = Depends(get_db)) -> Response:
    # Delete every table, children before parents (reversed dependency order) so
    # the ON DELETE foreign keys never trip.
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    return Response(status_code=204)
