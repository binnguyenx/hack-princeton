"""Gemini LangGraph chat over authoritative workspace context (no fake-model assistant path)."""
from fastapi import APIRouter, Request
import json

from fastapi.responses import JSONResponse, StreamingResponse
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from starlette.concurrency import run_in_threadpool

from skullfix_ai.agent.context import GraphRequest, RepositoryManifestReader
from skullfix_ai.agent.gemini_graph import ChatModelUnavailable
from skullfix_ai.agent.preflight import run_preflight
from skullfix_ai.agent.report_subagent import ReportSink
from skullfix_ai.agent.staging import ProposalSink, StagingError
from skullfix_ai.tools.geometry_tools import GeometryWorkspace
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


def _agent_events(repository, agent, payload, store=None, report_store=None):
    """Yield thinking events, then ``{'type': 'outcome', 'outcome': ...}`` (same outcome as the JSON route)."""
    reader = _OnceReader(RepositoryManifestReader(repository))
    steps = ['load_context']
    try:
        context = AppWorkspaceAdapter(reader).load_context(
            payload.project_id, payload.object_id, case_id=payload.case_id,
            expected_revision_id=payload.expected_revision_id)
        manifest = AppProjectManifest.model_validate(reader.manifest)
    except WorkspaceError as error:
        status = 'stale' if error.code == 'stale-revision' else 'unavailable'
        yield _outcome({'status': status, 'code': error.code, 'context': None, 'observation': None,
                        'explanation': f'Request {status}: {error.code}. {error}', 'steps': steps})
        return
    except Exception:
        yield _outcome({'status': 'failed', 'code': 'workspace-read-failed', 'context': None, 'observation': None,
                        'explanation': 'Request failed: workspace-read-failed. Application context could not be loaded.',
                        'steps': steps})
        return
    context_json = context.model_dump(mode='json')
    observation = {'scope': 'application-read', 'metadata': context_json, 'operation_result': None}
    capabilities = run_preflight(repository, context, manifest)
    steps.append('preflight')
    yield {'type': 'thinking', 'id': 'step-preflight', 'kind': 'step', 'text': _preflight_label(capabilities)}
    sink = ProposalSink(store, context, payload.conversation_id) if store is not None else None
    geometry = GeometryWorkspace(repository, context, manifest, capabilities)
    reports = (ReportSink(report_store, repository, context, manifest, payload.conversation_id, payload.history,
                          payload.message) if report_store is not None else None)
    final = None
    try:
        for event in _turn_events(agent, payload, context, manifest, capabilities, sink, geometry, reports):
            if event['type'] == 'final':
                final = event
            else:
                yield event
    except ChatModelUnavailable:
        final = None
    if final is None:
        yield _outcome({'status': 'unavailable', 'code': 'model-unavailable', 'context': context_json,
                        'observation': observation,
                        'explanation': 'The chat model is unavailable. Check the provider credentials, model id and network access on the FastAPI server.',
                        'steps': [*steps, 'agent'], 'capabilities': capabilities.model_dump(mode='json')})
        return
    yield _outcome({'status': 'completed', 'code': None, 'context': context_json, 'observation': observation,
                    'explanation': final['text'],
                    'steps': [*steps, 'agent', *(f'tool:{name}' for name in final['tools'])],
                    'capabilities': capabilities.model_dump(mode='json'),
                    'staged_proposal': final.get('staged_proposal'),
                    'viewport_overlay': final.get('viewport_overlay'),
                    'report_job': final.get('report_job')})


CHECK_PHRASES = {'voxel_volume': 'volume calculation', 'rim_thickness': 'rim thickness measurement',
                 'fixation_safety': 'fixation screening', 'implant_fit': 'implant fit measurement',
                 'landmark_review': 'landmark review'}


def _preflight_label(capabilities):
    available = [CHECK_PHRASES[name] for name in capabilities.executable_checks if name in CHECK_PHRASES]
    blocked = [CHECK_PHRASES[item.check] for item in capabilities.blocked_checks if item.check in CHECK_PHRASES]
    text = 'Checked what this selection supports'
    if available:
        text += ': available ' + ', '.join(available)
    if blocked:
        text += ('; ' if available else ': ') + 'needs more workspace data for ' + ', '.join(blocked)
    return text


def _turn_events(agent, payload, context, manifest, capabilities=None, sink=None, geometry=None, reports=None):
    """Agent events; agents without ``stream_turn`` (e.g. test stubs) yield only their final reply."""
    arguments = dict(conversation_id=payload.conversation_id, message=payload.message,
                     history=payload.history, context=context, manifest=manifest)
    if hasattr(agent, 'stream_turn'):
        extra = {'reports': reports} if reports is not None else {}
        yield from agent.stream_turn(**arguments, capabilities=capabilities, sink=sink, geometry=geometry, **extra)
        return
    text, tools = agent.reply(**arguments)
    yield {'type': 'final', 'text': text, 'tools': tools}


def _outcome(outcome):
    return {'type': 'outcome', 'outcome': outcome}


def _agent_read(repository, agent, payload, store=None, report_store=None):
    return next(event['outcome'] for event in _agent_events(repository, agent, payload, store, report_store)
                if event['type'] == 'outcome')


LIMITATIONS = ['LLM + read-only workspace tools; no geometry execution or AI writes.',
               'Conversation memory is in-process and lost on server restart.']


def _envelope(agent, payload, outcome):
    outcome = dict(outcome)
    proposal = outcome.pop('staged_proposal', None)
    overlay = outcome.pop('viewport_overlay', None)
    report_job = outcome.pop('report_job', None)
    return {'mode': agent.mode, 'request_id': payload.request_id, 'conversation_id': payload.conversation_id,
            'outcome': outcome, 'limitations': LIMITATIONS, 'staged_proposal': proposal, 'viewport_overlay': overlay,
            'report_job': report_job}


def _ndjson_stream(repository, agent, payload, store=None, report_store=None):
    """metadata line, thinking lines, then one result line carrying the JSON route's envelope."""
    line = lambda value: (json.dumps(value, ensure_ascii=False) + '\n').encode('utf-8')
    yield line({'type': 'metadata', 'mode': agent.mode, 'request_id': payload.request_id,
                'conversation_id': payload.conversation_id})
    for event in _agent_events(repository, agent, payload, store, report_store):
        if event['type'] == 'outcome':
            yield line({'type': 'result', **_envelope(agent, payload, event['outcome'])})
        else:
            yield line(event)


def create_chat_router():
    router = APIRouter(prefix='/api/ai')

    async def parse(request: Request):
        """Return (payload, agent) or an error JSONResponse shared by both chat routes."""
        if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
            return JSONResponse({'error': 'JSON content type required', 'code': 'unsupported-media-type'}, status_code=415)
        try:
            payload = ChatRequest.model_validate(request.state.compat_body)
        except ValidationError:
            return JSONResponse({'error': 'Invalid chat request', 'code': 'invalid-chat-request'}, status_code=422)
        agent = getattr(request.app.state, 'chat_agent', None)
        if agent is None:
            return JSONResponse(
                {'error': 'Chat agent is not configured', 'code': 'chat-provider-required',
                 'hint': 'Start FastAPI with SKULLFIX_CHAT_PROVIDER=bedrock (AWS credentials + region) or gemini (GOOGLE_API_KEY); see backend/ai/.env.'},
                status_code=503,
            )
        # Local readiness (credentials/region/key present); no provider call, so it costs nothing.
        ready, reason = await run_in_threadpool(agent.ready) if hasattr(agent, 'ready') else (True, None)
        if not ready:
            return JSONResponse({'error': 'Chat provider is not ready', 'code': 'chat-provider-not-ready',
                                 'reason': reason}, status_code=503)
        return payload, agent

    @router.post('/chat')
    async def chat(request: Request):
        parsed = await parse(request)
        if isinstance(parsed, JSONResponse):
            return parsed
        payload, agent = parsed
        outcome = await run_in_threadpool(_agent_read, request.app.state.repository, agent, payload, _store(request),
                                          _report_store(request))
        return _envelope(agent, payload, outcome)

    @router.post('/chat/stream')
    async def chat_stream(request: Request):
        parsed = await parse(request)
        if isinstance(parsed, JSONResponse):
            return parsed
        payload, agent = parsed
        # Sync generator: Starlette iterates it in a worker thread, flushing each line.
        return StreamingResponse(_ndjson_stream(request.app.state.repository, agent, payload, _store(request),
                                                _report_store(request)),
                                 media_type='application/x-ndjson',
                                 headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

    @router.get('/proposals/{proposal_id}')
    async def proposal_status(proposal_id: str, request: Request):
        store = _store(request)
        try:
            proposal = store.get(proposal_id)
        except StagingError as error:
            return JSONResponse({'error': str(error), 'code': error.code}, status_code=error.status)
        if proposal.status == 'pending':
            live = await run_in_threadpool(_proposal_is_current, request.app.state.repository, proposal)
            if not live:
                proposal.status = 'stale'
        return {'proposal': proposal.public()}

    @router.post('/proposals/{proposal_id}/discard')
    async def proposal_discard(proposal_id: str, request: Request):
        try:
            return {'proposal': _store(request).discard(proposal_id).public()}
        except StagingError as error:
            return JSONResponse({'error': str(error), 'code': error.code}, status_code=error.status)

    @router.post('/proposals/{proposal_id}/accept')
    async def proposal_accept(proposal_id: str, request: Request):
        """Human-confirmed commit. Never reachable from the graph; requires the echoed proposal identity."""
        if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
            return JSONResponse({'error': 'JSON content type required', 'code': 'unsupported-media-type'}, status_code=415)
        try:
            confirmation = ProposalConfirmation.model_validate(request.state.compat_body)
        except ValidationError:
            return JSONResponse({'error': 'Invalid proposal confirmation', 'code': 'invalid-confirmation'}, status_code=422)
        try:
            proposal = await run_in_threadpool(_store(request).accept, proposal_id, request.app.state.repository,
                                               **confirmation.model_dump())
        except StagingError as error:
            return JSONResponse({'error': str(error), 'code': error.code}, status_code=error.status)
        return {'proposal': proposal.public()}

    return router


class ProposalConfirmation(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    candidate_id: str = Field(min_length=1, max_length=256)
    base_revision_id: str = Field(min_length=1, max_length=256)


def _store(request):
    return getattr(request.app.state, 'proposal_store', None)


def _report_store(request):
    return getattr(request.app.state, 'report_store', None)


def _proposal_is_current(repository, proposal):
    try:
        AppWorkspaceAdapter(RepositoryManifestReader(repository)).load_context(
            proposal.project_id, proposal.candidate_id, case_id=proposal.case_id,
            expected_revision_id=proposal.base_revision_id)
        return True
    except Exception:
        return False
