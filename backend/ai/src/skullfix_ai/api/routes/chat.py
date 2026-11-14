"""Fake-model metadata reads only; no application or sandbox mutation binding."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, ValidationError
from starlette.concurrency import run_in_threadpool

from skullfix_ai.agent.context import GraphRequest, RepositoryManifestReader
from skullfix_ai.agent.workflow import FakeToolModel, WorkspaceGraph
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter
from skullfix_ai.tools import ToolRegistry
from skullfix_ai.tools.inspection import metadata_tool


class ChatRequest(GraphRequest):
    request_id: str = Field(min_length=1, max_length=256)
    conversation_id: str = Field(min_length=1, max_length=256)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    object_id: str = Field(min_length=1, max_length=256)
    expected_revision_id: str | None = Field(default=None, min_length=1, max_length=256)
    message: str = Field(min_length=1, max_length=4000)


def _read(repository, payload):
    graph = WorkspaceGraph(AppWorkspaceAdapter(RepositoryManifestReader(repository)),
                           FakeToolModel(), ToolRegistry([metadata_tool()]))
    return graph.invoke(payload).model_dump(mode='json')


def create_chat_router():
    router = APIRouter(prefix='/api/ai')

    @router.post('/chat')
    async def chat(request: Request):
        if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
            return JSONResponse({'error': 'JSON content type required', 'code': 'unsupported-media-type'}, status_code=415)
        try:
            payload = ChatRequest.model_validate(request.state.compat_body)
        except ValidationError:
            return JSONResponse({'error': 'Invalid chat request', 'code': 'invalid-chat-request'}, status_code=422)
        outcome = await run_in_threadpool(_read, request.app.state.repository, payload)
        return {'mode': 'fake-read-only', 'request_id': payload.request_id,
                'conversation_id': payload.conversation_id, 'outcome': outcome,
                'limitations': ['Fake model; reads selected-object metadata only.',
                                'No geometry execution, live AI writes, provider or persisted chat history.']}

    return router
