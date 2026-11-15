"""Revision-scoped mechanical annotation CRUD for the live application API."""
from functools import partial
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from ..errors import public_error


def _body(request: Request) -> dict:
    body = getattr(request.state, "compat_body", None)
    if body is None:
        raise ValueError("Request body is unavailable")
    return body if isinstance(body, dict) else {}


async def _call(request: Request, method: str, *args: Any):
    return await run_in_threadpool(
        partial(getattr(request.app.state.repository, method), *args)
    )


def create_annotation_router() -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/revisions/{revision_id}/annotations")
    async def list_annotations(revision_id: str, request: Request):
        try:
            return await _call(request, "list_annotations", revision_id)
        except Exception as error:
            return public_error(error)

    @router.post("/revisions/{revision_id}/annotations", status_code=201)
    async def create_annotation(revision_id: str, request: Request):
        try:
            return await _call(request, "create_annotation", revision_id, _body(request))
        except Exception as error:
            return public_error(error)

    @router.patch("/annotations/{annotation_id}")
    async def update_annotation(annotation_id: str, request: Request):
        try:
            return await _call(request, "update_annotation", annotation_id, _body(request))
        except Exception as error:
            return public_error(error)

    @router.delete("/annotations/{annotation_id}", status_code=204)
    async def delete_annotation(annotation_id: str, request: Request):
        try:
            await _call(request, "delete_annotation", annotation_id)
            return Response(status_code=204)
        except Exception as error:
            return public_error(error)

    return router
