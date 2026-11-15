"""Configured fake/Gemini metadata reads only; no application or sandbox mutation binding."""
import os
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from skullfix_ai.agent.read_only_reply import read_only_reply
from skullfix_ai.agent.gemini import GeminiModel, ProviderError
from starlette.concurrency import run_in_threadpool

from skullfix_ai.agent.context import GraphRequest, RepositoryManifestReader
from skullfix_ai.agent.workflow import FakeToolModel, WorkspaceGraph
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter
from skullfix_ai.tools import ToolRegistry
from skullfix_ai.tools.inspection import metadata_tool


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    role: Literal['human', 'assistant']
    content: str = Field(min_length=1, max_length=4000)

    @field_validator('content')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Use nonblank text')
        return value


class ChatRequest(GraphRequest):
    request_id: str = Field(min_length=1, max_length=256)
    conversation_id: str = Field(min_length=1, max_length=256)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    object_id: str = Field(min_length=1, max_length=256)
    expected_revision_id: str | None = Field(default=None, min_length=1, max_length=256)
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=24)

    @field_validator('message', 'request_id', 'conversation_id', 'project_id', 'case_id', 'object_id', 'expected_revision_id')
    @classmethod
    def nonblank(cls, value):
        if value is not None and not value.strip():
            raise ValueError('Use nonblank text')
        return value


def _read(repository, payload):
    provider = os.environ.get('SKULLFIX_AI_CHAT_MODEL', 'fake')
    if provider not in ('fake', 'gemini'):
        raise ProviderError('model-config-invalid', 'SKULLFIX_AI_CHAT_MODEL must be fake or gemini.')
    model = GeminiModel(payload.history) if provider == 'gemini' else FakeToolModel()
    graph = WorkspaceGraph(AppWorkspaceAdapter(RepositoryManifestReader(repository)),
                           model, ToolRegistry([metadata_tool()]))
    result = graph.invoke(payload)
    if provider == 'fake' and result.status == 'completed' and result.context is not None:
        result.explanation = read_only_reply(payload.message, payload.history, result.context)
    return result.model_dump(mode='json'), provider, getattr(model, 'model_id', 'deterministic')


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
        try:
            outcome, provider, model_id = await run_in_threadpool(_read, request.app.state.repository, payload)
        except ProviderError as error:
            return JSONResponse({'error': error.message, 'code': error.code}, status_code=503)
        return {'mode': 'llm-read-only' if provider == 'gemini' else 'fake-read-only',
                'model': {'provider': provider, 'id': model_id}, 'capability_policy': 'metadata-read-only',
                'request_id': payload.request_id, 'conversation_id': payload.conversation_id, 'outcome': outcome,
                'limitations': ['Selected-object metadata only; no geometry execution or live AI writes.',
                                'Chat history is transient; model prose is not a clinical result.']}

    return router
