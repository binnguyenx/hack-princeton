"""Manual voxel boundary, separate from fake-model graph and sandbox mock."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from skullfix_ai.application.binary_nrrd import VoxelError
from skullfix_ai.application.voxel_operations import VoxelCommand, VoxelService


def create_voxel_router():
    router = APIRouter(prefix='/api/candidates')
    @router.post('/{id}/voxel-operation', status_code=201)
    async def execute(id: str, request: Request):
        try:
            command = VoxelCommand.model_validate(request.state.compat_body)
            service = VoxelService(request.app.state.repository, request.app.state.voxel_adapter)
            return await run_in_threadpool(service.execute, id, command)
        except ValidationError:
            return JSONResponse({'error': 'Invalid voxel operation parameters'}, status_code=422)
        except VoxelError as error:
            return JSONResponse({'error': str(error)}, status_code=error.status)
        except Exception:
            return JSONResponse({'error': 'Voxel operation failed; reload project before retrying'}, status_code=500)
    return router
