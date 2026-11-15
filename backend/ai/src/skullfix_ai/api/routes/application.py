"""The 13 UI compatibility routes. Repository owns application behavior."""
from functools import partial
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException

from ..errors import public_error, parser_response, strict_json


def _body(request: Request) -> dict:
    body = getattr(request.state, 'compat_body', None)
    if body is None:
        raise ValueError('Request body is unavailable')
    # JavaScript property access on arrays/strings does not find the expected key.
    return body if isinstance(body, dict) else {}


async def _call(request: Request, method: str, *args: Any):
    return await run_in_threadpool(partial(getattr(request.app.state.repository, method), *args))


def create_application_router() -> APIRouter:
    router = APIRouter(prefix='/api')

    @router.get('/projects')
    async def list_projects(request: Request):
        try:
            return await _call(request, 'list_projects')
        except Exception as error:
            return public_error(error)

    @router.post('/projects', status_code=201)
    async def create_project(request: Request):
        try:
            name = _body(request).get('name')
            project = await _call(request, 'create_project', '' if name is None else name)
            return {'projectId': project['id']}
        except Exception as error:
            return public_error(error)

    @router.get('/projects/{id}')
    async def get_project(id: str, request: Request):
        try:
            return await _call(request, 'get_project_manifest', id)
        except Exception as error:
            return public_error(error)

    @router.get('/projects/{id}/samples')
    async def search_project_samples(id: str, request: Request, q: str = ''):
        try:
            samples = await _call(request, 'search_project_samples', id, q)
            return {'samples': samples}
        except Exception as error:
            return public_error(error)

    @router.delete('/projects/{id}', status_code=204)
    async def delete_project(id: str, request: Request):
        try:
            await _call(request, 'delete_project', id)
            return Response(status_code=204)
        except Exception as error:
            return public_error(error)

    @router.post('/projects/{id}/cases', status_code=201)
    async def add_case(id: str, request: Request):
        try:
            name = _body(request).get('name')
            case = await _call(request, 'add_case', id, '' if name is None else name)
            return {'caseId': case['id']}
        except Exception as error:
            return public_error(error)

    @router.delete('/projects/{id}/cases/{case_id}', status_code=204)
    async def remove_case(id: str, case_id: str, request: Request):
        try:
            await _call(request, 'remove_case', id, case_id)
            return Response(status_code=204)
        except Exception as error:
            return public_error(error)

    @router.post('/projects/{id}/cases/{case_id}/samples', status_code=201)
    async def add_sample(id: str, case_id: str, request: Request):
        try:
            async with request.form() as form:
                # Express upload.single rejects unexpected/repeated file fields before its handler.
                files = [(key, value) for key, value in form.multi_items() if isinstance(value, UploadFile)]
                if len(files) > 1 or any(key != 'file' for key, _ in files):
                    return parser_response(500)
                upload = form.get('file')
                if not isinstance(upload, UploadFile):
                    return JSONResponse({'error': 'file is required'}, status_code=400)
                def first_text(key):
                    value = form.getlist(key)
                    return next((item for item in value if isinstance(item, str)), '')
                meta = strict_json(first_text('meta') or '{}')
                data = await upload.read()
                sample = await _call(request, 'add_sample', id, case_id,
                                     first_text('displayName') or (upload.filename or '').replace('\\', '/').rsplit('/', 1)[-1],
                                     first_text('spatiallyVerified') == 'true', meta, data)
            return {'sampleId': sample['id'], 'spatiallyVerified': sample['spatiallyVerified']}
        except HTTPException:
            # Form parser errors occur in Multer before the Express route handler.
            return parser_response(500)
        except Exception as error:
            return public_error(error)

    @router.get('/samples/{id}/volume')
    async def get_volume(id: str, request: Request):
        try:
            found = await _call(request, 'find_sample_volume', id)
            if not found:
                raise ValueError(f'Sample {id} not found')
            data = await _call(request, 'read_volume', found['projectId'], found['volumeId'])
            return Response(data, media_type='application/octet-stream')
        except Exception as error:
            return public_error(error)

    @router.delete('/samples/{id}', status_code=204)
    async def remove_sample(id: str, request: Request):
        try:
            context = await _call(request, 'find_sample_context', id)
            if not context:
                raise ValueError(f'Sample {id} not found')
            await _call(request, 'remove_sample', context['projectId'], context['caseId'], id)
            return Response(status_code=204)
        except Exception as error:
            return public_error(error)

    @router.post('/samples/{id}/candidates', status_code=201)
    async def create_candidate(id: str, request: Request):
        try:
            return await _call(request, 'create_candidate', id)
        except Exception as error:
            return public_error(error)

    @router.post('/candidates/{id}/transform', status_code=201)
    async def transform(id: str, request: Request):
        try:
            pose = _body(request).get('pose')
            if not isinstance(pose, list) or len(pose) != 16:
                return JSONResponse({'error': 'pose must have 16 numbers'}, status_code=400)
            revision = await _call(request, 'commit_transform', id, pose)
            return {'revisionId': revision}
        except Exception as error:
            return public_error(error)

    @router.post('/candidates/{id}/restore')
    async def restore(id: str, request: Request):
        try:
            revision = _body(request).get('revisionId')
            if not revision:
                return JSONResponse({'error': 'revisionId is required'}, status_code=400)
            await _call(request, 'restore_revision', id, revision)
            return {'ok': True}
        except Exception as error:
            return public_error(error)

    @router.delete('/candidates/{id}', status_code=204)
    async def delete_candidate(id: str, request: Request):
        try:
            project = await _call(request, 'find_candidate_project', id)
            if not project:
                raise ValueError(f'Candidate {id} not found')
            await _call(request, 'delete_candidate', id)
            return Response(status_code=204)
        except Exception as error:
            return public_error(error)

    return router
