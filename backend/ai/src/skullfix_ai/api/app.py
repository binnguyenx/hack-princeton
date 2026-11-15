"""Single FastAPI application for UI contracts and read-only fake-model chat."""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException

from skullfix_ai.config import ApplicationSettings
from .errors import parser_response, strict_json
from .body import BodyReadError, read_json_bytes
from .routes.application import create_application_router
from .routes.chat import create_chat_router
from .routes.placement import create_placement_router
from .routes.measurements import create_measurement_router
from .routes.voxel_operations import create_voxel_router
from skullfix_ai.application.voxel_operations import BinaryVoxelAdapter
from .routes.landmarks import create_landmark_router
from .routes.annotations import create_annotation_router
from .routes.packages import create_package_router

ALL_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']


def create_app(storage_root: Path | str, *, frontend_dir: Path | str | None = None, repository=None) -> FastAPI:
    settings = ApplicationSettings(Path(storage_root), Path(frontend_dir) if frontend_dir is not None else None)
    if repository is None:
        from skullfix_ai.application import ApplicationRepository
        repository = ApplicationRepository(settings.storage_root)
    app = FastAPI(title='Application API', docs_url=None, redoc_url=None)
    app.state.repository = repository
    app.state.settings = settings

    @app.middleware('http')
    async def current_json_parser(request: Request, call_next):
        request.state.compat_body = None
        content_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
        if content_type == 'application/json':
            try:
                raw = await read_json_bytes(request)
            except BodyReadError as error:
                return parser_response(error.status_code)
            if not raw:
                request.state.compat_body = {}
            else:
                try:
                    parsed = strict_json(raw)
                    if not isinstance(parsed, (dict, list)):
                        return parser_response(400)
                    request.state.compat_body = parsed
                except (ValueError, UnicodeDecodeError):
                    return parser_response(400)
        return await call_next(request)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return JSONResponse({'error': str(error.detail)}, status_code=error.status_code, headers=error.headers)

    app.include_router(create_application_router())
    app.include_router(create_chat_router())
    app.include_router(create_placement_router())
    app.include_router(create_package_router())
    app.include_router(create_landmark_router())
    app.include_router(create_annotation_router())
    app.include_router(create_measurement_router())
    app.state.voxel_adapter = BinaryVoxelAdapter()
    app.include_router(create_voxel_router())

    @app.get('/healthz', include_in_schema=False)
    def health():
        # Readiness is composition readiness; no write or initialization is required.
        return {'status': 'ready'}

    @app.api_route('/api', methods=ALL_METHODS, include_in_schema=False)
    @app.api_route('/api/{path:path}', methods=ALL_METHODS, include_in_schema=False)
    def missing_api(path: str = ''):
        return JSONResponse({'error': 'API route not found'}, status_code=404)

    if settings.frontend_dir is not None:
        @app.get('/{path:path}', include_in_schema=False)
        def frontend(path: str):
            directory = settings.frontend_dir
            candidate = (directory / path).resolve()
            if not candidate.is_relative_to(directory):
                return JSONResponse({'error': 'File not found'}, status_code=404)
            if candidate.is_file():
                return FileResponse(candidate)
            if Path(path).suffix or path.startswith(('assets/', 'fixtures/', 'samples/')):
                return JSONResponse({'error': 'File not found'}, status_code=404)
            return FileResponse(directory / 'index.html', media_type='text/html')
    return app
