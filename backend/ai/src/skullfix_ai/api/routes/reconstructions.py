"""Model fix generation routes; one service backs the button and accepted agent proposals."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from skullfix_ai.application.model_reconstruction import (
    AdjustCommand, ModelReconstructionService, ReconstructionError, StartCommand)


def _error(error: ReconstructionError):
    return JSONResponse({'code': error.code, 'error': error.message}, status_code=error.status)


def create_reconstruction_router():
    router = APIRouter(prefix='/api')

    def service(request: Request) -> ModelReconstructionService:
        return ModelReconstructionService(request.app.state.repository, request.app.state.model_endpoint,
                                          request.app.state.reconstruction_runs)

    @router.post('/samples/{id}/reconstructions', status_code=202)
    async def start(id: str, request: Request):
        try:
            command = StartCommand.model_validate(request.state.compat_body)
            run_id = await run_in_threadpool(service(request).start, id, command)
            return {'runId': run_id}
        except ValidationError:
            return JSONResponse({'code': 'invalid-request', 'error': 'Invalid reconstruction request'}, status_code=422)
        except ReconstructionError as error:
            return _error(error)

    @router.get('/reconstructions/{run_id}')
    async def status(run_id: str, request: Request):
        try:
            return service(request).status(run_id)
        except ReconstructionError as error:
            return _error(error)

    @router.post('/candidates/{id}/fix-adjustment', status_code=201)
    async def adjust(id: str, request: Request):
        try:
            command = AdjustCommand.model_validate(request.state.compat_body)
            return await run_in_threadpool(service(request).adjust, id, command)
        except ValidationError:
            return JSONResponse({'code': 'invalid-request', 'error': 'Invalid fix adjustment'}, status_code=422)
        except ReconstructionError as error:
            return _error(error)

    @router.get('/candidates/{id}/fix-report')
    async def report(id: str, project_id: str, case_id: str, request: Request):
        try:
            return await run_in_threadpool(service(request).report, id, project_id, case_id)
        except ReconstructionError as error:
            return _error(error)

    return router
