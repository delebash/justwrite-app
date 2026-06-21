"""/v1/ai/run — server-side feature execution on the shared dispatch.

The renderer POSTs {action, variables}; the server renders the action's
server-side prompt template and routes the call through
`llm_runner.llm.dispatch.chat`, honoring the user's feature pins / default
provider (read from settings by `llm.config.llm_config`). Replaces the
renderer's client-side `services/analysis/*` LLM calls (non-streaming JSON), so
the prompts live server-side and headless JustWrite gets AI.

Streaming features (writerAI / chat / rag) keep the `/v1/llm/...` gateway until
they migrate last.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from llm_runner.llm.base import LLMMessage
from llm_runner.llm.dispatch import LLMNotConfiguredError, chat

from ..llm.config import llm_config
from ..llm.features import FEATURES, render

router = APIRouter(tags=["ai"], prefix="/v1/ai")


class RunRequest(BaseModel):
    action: str
    variables: dict = {}
    # Optional per-call routing override (the Writer Lab runs one action against
    # several providers/models). Empty → the feature's resolved route.
    providerId: str = ""
    model: str = ""


class RunResponse(BaseModel):
    content: str
    model: str


@router.post("/run", response_model=RunResponse)
async def run_feature(body: RunRequest) -> RunResponse:
    spec = FEATURES.get(body.action)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"unknown AI action {body.action!r}")
    messages = [LLMMessage(role="user", content=render(spec["user_template"], body.variables))]
    try:
        resp = chat(
            config=llm_config(),
            feature=spec["feature"],
            messages=messages,
            # System is templated too (Decision 16) — most actions have no system
            # placeholders so render() returns it unchanged; plotHoles injects the
            # project's world-rules section.
            system=render(spec["system"], body.variables),
            temperature=spec.get("temperature", 0.7),
            think=spec.get("think", False),
            provider_override=body.providerId or None,
            model_override=body.model or None,
        )
    except LLMNotConfiguredError as e:
        # 501 → the UI shows the actionable "wire an LLM provider" message.
        raise HTTPException(status_code=501, detail=str(e)) from e
    return RunResponse(content=resp.text, model=resp.model)
