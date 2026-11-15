"""Gemini LangGraph chat over authoritative workspace context (no fake-model assistant path)."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from starlette.concurrency import run_in_threadpool

from skullfix_ai.agent.context import GraphRequest, RepositoryManifestReader
from skullfix_ai.agent.gemini_graph import ChatModelUnavailable
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter, WorkspaceError
from skullfix_ai.schemas.workspace import AppProjectManifest


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


class _OnceReader:
    """Serve one manifest snapshot so context and tools see the same read."""

    def __init__(self, reader):
        self._reader, self.manifest = reader, None

    def get_project(self, project_id):
        if self.manifest is None:
            self.manifest = self._reader.get_project(project_id)
        return self.manifest


def _agent_read(repository, agent, payload):
    reader = _OnceReader(RepositoryManifestReader(repository))
    steps = ['load_context']
    try:
        context = AppWorkspaceAdapter(reader).load_context(
            payload.project_id, payload.object_id, case_id=payload.case_id,
            expected_revision_id=payload.expected_revision_id)
        manifest = AppProjectManifest.model_validate(reader.manifest)
    except WorkspaceError as error:
        status = 'stale' if error.code == 'stale-revision' else 'unavailable'
        return {'status': status, 'code': error.code, 'context': None, 'observation': None,
                'explanation': f'Request {status}: {error.code}. {error}', 'steps': steps}
    except Exception:
        return {'status': 'failed', 'code': 'workspace-read-failed', 'context': None, 'observation': None,
                'explanation': 'Request failed: workspace-read-failed. Application context could not be loaded.', 'steps': steps}
    context_json = context.model_dump(mode='json')
    observation = {'scope': 'application-read', 'metadata': context_json, 'operation_result': None}
    try:
        text, tools_called = agent.reply(conversation_id=payload.conversation_id, message=payload.message,
                                         history=payload.history, context=context, manifest=manifest)
    except ChatModelUnavailable:
        return {'status': 'unavailable', 'code': 'model-unavailable', 'context': context_json, 'observation': observation,
                'explanation': 'The Gemini model is unavailable. Check GOOGLE_API_KEY and network access on the FastAPI server.',
                'steps': [*steps, 'agent']}
    return {'status': 'completed', 'code': None, 'context': context_json, 'observation': observation,
            'explanation': text, 'steps': [*steps, 'agent', *(f'tool:{name}' for name in tools_called)]}


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
        agent = getattr(request.app.state, 'chat_agent', None)
        if agent is None:
            return JSONResponse(
                {'error': 'Gemini chat agent is not configured', 'code': 'chat-provider-required',
                 'hint': 'Start FastAPI with GOOGLE_API_KEY or GEMINI_API_KEY set (see backend/ai/.env).'},
                status_code=503,
            )
        outcome = await run_in_threadpool(_agent_read, request.app.state.repository, agent, payload)
        return {'mode': agent.mode, 'request_id': payload.request_id,
                'conversation_id': payload.conversation_id, 'outcome': outcome,
                'limitations': ['Gemini + read-only workspace tools; no geometry execution or AI writes.',
                                'Conversation memory is in-process and lost on server restart.']}

    return router
