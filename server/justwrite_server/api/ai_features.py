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

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from llm_runner.llm.base import LLMMessage
from llm_runner.llm.dispatch import LLMNotConfiguredError, chat, stream_chat

from ..llm.config import llm_config
from ..llm.features import render
from ..llm.prompt_store import get_prompt_store

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
    spec = get_prompt_store().get(body.action)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"unknown AI action {body.action!r}")
    messages = [LLMMessage(role="user", content=render(spec.user_template, body.variables))]
    try:
        resp = chat(
            config=llm_config(),
            feature=spec.feature,
            messages=messages,
            # System is templated too — most actions have no system placeholders so
            # render() returns it unchanged; plotHoles injects the project's
            # world-rules section.
            system=render(spec.system, body.variables),
            temperature=spec.temperature,
            think=spec.think,
            provider_override=body.providerId or None,
            model_override=body.model or None,
        )
    except LLMNotConfiguredError as e:
        # 501 → the UI shows the actionable "wire an LLM provider" message.
        raise HTTPException(status_code=501, detail=str(e)) from e
    return RunResponse(content=resp.text, model=resp.model)


@router.post("/stream")
async def stream_feature(body: RunRequest):
    """Streaming counterpart to /run for the interactive features (writerAI /
    chat / rag). Emits OpenAI-style SSE: `data: {"delta": "..."}` per chunk, a
    final `data: {"done": true, "promptTokens", "completionTokens"}`, then
    `data: [DONE]`. Errors arrive as `data: {"error": "..."}` (the stream has
    started, so we can't send an HTTP status)."""
    spec = get_prompt_store().get(body.action)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"unknown AI action {body.action!r}")
    messages = [LLMMessage(role="user", content=render(spec.user_template, body.variables))]
    system = render(spec.system, body.variables)

    def gen():
        try:
            for delta in stream_chat(
                config=llm_config(),
                feature=spec.feature,
                messages=messages,
                system=system,
                temperature=spec.temperature,
                think=spec.think,
                provider_override=body.providerId or None,
                model_override=body.model or None,
            ):
                if delta.done:
                    frame = {"done": True, "promptTokens": delta.prompt_tokens, "completionTokens": delta.completion_tokens}
                else:
                    frame = {"delta": delta.text}
                yield f"data: {json.dumps(frame)}\n\n"
        except LLMNotConfiguredError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:  # noqa: BLE001 — surface as an error frame, not a 500
            yield f"data: {json.dumps({'error': str(e)[:200]})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
