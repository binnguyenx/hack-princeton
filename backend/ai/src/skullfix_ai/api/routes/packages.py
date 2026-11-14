"""Portable packages are explicit manual user actions, separate from chat tools."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from skullfix_ai.application.packages import MAX_ARCHIVE, PackageError, PackageService


def error_response(error):
    if isinstance(error, PackageError):
        return JSONResponse({'error': str(error), 'code': error.code}, status_code=error.status)
    return JSONResponse({'error': 'Project package operation failed.', 'code': 'package-failed'}, status_code=500)


def create_package_router():
    router = APIRouter(prefix='/api')

    @router.post('/projects/{id}/package')
    async def export(id: str, request: Request):
        try:
            presentation = request.state.compat_body
            if not isinstance(presentation, dict):
                raise PackageError('invalid-package', 'JSON presentation object is required.')
            data = await run_in_threadpool(PackageService(request.app.state.repository).export, id, presentation)
            # The filename never includes a supplied project name or filesystem path.
            return Response(data, media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="project.zip"'})
        except Exception as error:
            return error_response(error)

    @router.post('/packages/import', status_code=201)
    async def import_package(request: Request):
        try:
            if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() not in ('application/zip', 'application/octet-stream'):
                raise PackageError('package-content-type', 'Upload a ZIP project package.', 415)
            total, chunks = 0, []
            async for chunk in request.stream():
                total += len(chunk)
                if total > MAX_ARCHIVE:
                    raise PackageError('package-too-large', 'Compressed package is too large.', 413)
                chunks.append(chunk)
            return await run_in_threadpool(PackageService(request.app.state.repository).import_copy, b''.join(chunks))
        except Exception as error:
            return error_response(error)

    @router.get('/candidates/{id}/revisions/{revision_id}/volume')
    async def revision_volume(id: str, revision_id: str, request: Request):
        try:
            data = await run_in_threadpool(request.app.state.repository.read_revision_volume, id, revision_id)
            return Response(data, media_type='application/octet-stream')
        except Exception as error:
            return error_response(error)

    return router
