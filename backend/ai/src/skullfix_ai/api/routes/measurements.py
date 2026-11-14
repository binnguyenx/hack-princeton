"""Mechanical foreground-volume measurement; not registered as a chat/LangGraph tool."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from skullfix_ai.application.foreground_volume import (
    ForegroundVolumeService,
    MeasurementCommand,
    MeasurementError,
)


def create_measurement_router():
    router = APIRouter(prefix="/api/candidates")

    @router.post("/{id}/measurements")
    async def create_measurement(id: str, request: Request):
        try:
            payload = dict(request.state.compat_body or {})
            payload["candidate_id"] = id
            command = MeasurementCommand.model_validate(payload)
        except ValidationError:
            return JSONResponse(
                {"error": {"code": "invalid-measurement", "message": "Invalid measurement request.", "details": {}}},
                status_code=422,
            )
        try:
            service = ForegroundVolumeService(request.app.state.repository)
            status_code, body = await run_in_threadpool(service.execute, id, command)
            return JSONResponse(body, status_code=status_code)
        except MeasurementError as error:
            return JSONResponse(
                {"error": {"code": error.code, "message": str(error), "details": error.details}},
                status_code=error.status,
            )
        except Exception:
            return JSONResponse(
                {
                    "error": {
                        "code": "measurement-failed",
                        "message": "Measurement could not complete.",
                        "details": {},
                    }
                },
                status_code=500,
            )

    @router.get("/{id}/revisions/{revision_id}/measurements")
    async def list_measurements(id: str, revision_id: str, request: Request):
        try:
            service = ForegroundVolumeService(request.app.state.repository)
            rows = await run_in_threadpool(service.list_for_revision, id, revision_id)
            return rows
        except Exception:
            return JSONResponse(
                {
                    "error": {
                        "code": "measurement-failed",
                        "message": "Measurement history could not be read.",
                        "details": {},
                    }
                },
                status_code=500,
            )

    return router
