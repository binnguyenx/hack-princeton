"""Explicit manual annotation endpoints; never registered with the graph."""
from fastapi import APIRouter,Request
from fastapi.responses import JSONResponse,Response
from starlette.concurrency import run_in_threadpool
from skullfix_ai.application.landmarks import LandmarkService,LandmarkError

def error_response(error):
    if isinstance(error,LandmarkError):return JSONResponse({'error':str(error)},status_code=error.status)
    return JSONResponse({'error':'Source landmark operation failed'},status_code=500)

def create_landmark_router():
    router=APIRouter(prefix='/api/samples')
    @router.get('/{id}/landmarks')
    async def list_points(id:str,request:Request):
        try:return {'landmarks':await run_in_threadpool(LandmarkService(request.app.state.repository).list,id)}
        except Exception as error:return error_response(error)
    @router.post('/{id}/landmarks',status_code=201)
    async def create(id:str,request:Request):
        try:return {'landmark':await run_in_threadpool(LandmarkService(request.app.state.repository).create,id,request.state.compat_body)}
        except Exception as error:return error_response(error)
    @router.delete('/{id}/landmarks/{landmark_id}',status_code=204)
    async def delete(id:str,landmark_id:str,request:Request):
        try:
            await run_in_threadpool(LandmarkService(request.app.state.repository).delete,id,landmark_id,request.state.compat_body)
            return Response(status_code=204)
        except Exception as error:return error_response(error)
    return router
