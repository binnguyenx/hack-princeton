"""Explicit manual UI mutation; never registered as a chat tool."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from skullfix_ai.application.placement import PlacementCommand, PlacementError, PlacementService


def create_placement_router():
    router = APIRouter(prefix='/api/candidates')

    @router.post('/{id}/placement', status_code=201)
    async def placement(id: str, request: Request):
        try:
            command = PlacementCommand.model_validate(request.state.compat_body)
        except ValidationError:
            return JSONResponse({'error': 'Invalid manual placement', 'code': 'invalid-placement'}, status_code=422)
        try:
            service = PlacementService(request.app.state.repository)
            return await run_in_threadpool(service.execute, id, command)
        except PlacementError as error:
            return JSONResponse({'error': str(error), 'code': error.code}, status_code=error.status)
        except Exception:
            return JSONResponse({'error': 'Placement could not complete', 'code': 'placement-failed'}, status_code=500)

    return router
