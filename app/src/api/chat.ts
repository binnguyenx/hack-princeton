/**
 * Application FastAPI chat. `chatClient.send` posts one JSON turn to `POST /api/ai/chat`;
 * `langGraphClient.streamResponse` reads the NDJSON stream from `POST /api/ai/chat/stream`
 * (metadata, plain-language thinking lines, then the same result envelope). Mode names the
 * provider: `bedrock-read-only` or `gemini-read-only`.
 */
export type ChatMode = 'gemini-read-only' | 'bedrock-read-only'
const CHAT_MODES: readonly string[] = ['gemini-read-only', 'bedrock-read-only']
// Optional direct FastAPI origin (CORS); default is same-origin through the Vite /api proxy.
export const API_BASE = ((import.meta.env.VITE_LANGGRAPH_API_URL as string | undefined) ?? '').trim().replace(/\/+$/, '')
export const CHAT_ENDPOINT = `${API_BASE}/api/ai/chat`

export type ReadOnlyChatRequest = {
  request_id: string
  conversation_id: string
  project_id: string
  case_id: string
  object_id: string
  expected_revision_id?: string
  message: string
}

export type ReadOnlyChatResponse = {
  mode: ChatMode
  request_id: string
  conversation_id: string
  outcome: {
    status: 'completed' | 'unsupported' | 'unavailable' | 'stale' | 'failed'
    code?: string | null
    explanation: string
  }
  limitations: string[]
}

function isResponse(value: unknown): value is ReadOnlyChatResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<ReadOnlyChatResponse>
  return typeof response.mode === 'string' && CHAT_MODES.includes(response.mode)
    && typeof response.request_id === 'string'
    && typeof response.conversation_id === 'string'
    && !!response.outcome
    && typeof response.outcome.explanation === 'string'
    && Array.isArray(response.limitations)
}

export const chatClient = {
  async send(request: ReadOnlyChatRequest, signal?: AbortSignal): Promise<ReadOnlyChatResponse> {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`)
    }
    const payload: unknown = await response.json()
    if (!isResponse(payload)) {
      throw new Error('Chat response does not match the read-only contract')
    }
    return payload
  },
}

/** Request-side selection identity (snake_case, as the API expects). */
export type ChatRequestContext = {
  project_id: string
  case_id: string
  object_id: string
  expected_revision_id: string | null
}

export type ProposalStatus = 'pending' | 'accepted' | 'discarded' | 'stale' | 'expired'
type ProposalBase = {
  proposal_id: string
  status: ProposalStatus
  summary: string
  project_id: string
  case_id: string
  resolved_revision_id?: string | null
}
export type FixAction = 'generate' | 'threshold' | 'region'
export type StagedProposal =
  | (ProposalBase & { kind: 'rigid_pose'; candidate_id: string; base_revision_id: string })
  | (ProposalBase & {
      kind: 'model_fix'
      /** null for a generate proposal: it is bound to the skull until accepted. */
      candidate_id: string | null
      base_revision_id: string | null
      sample_id: string | null
      payload: { action: FixAction; threshold?: number; region?: number[][] }
      resolved_run_id?: string | null
    })
export type OverlaySeverity = 'critical' | 'warning' | 'ok'
/** Read-only geometric finding to draw on the 3D skull (voxel indices in the source grid). */
export type ViewportOverlay = {
  overlay_id: string
  kind: string
  title: string
  unit: 'mm'
  threshold_mm: number
  legend: Array<{ severity: OverlaySeverity; label: string }>
  frame: 'voxel-ijk'
  sizes: [number, number, number]
  spacing_mm: [number, number, number]
  object_id: string
  revision_id: string | null
  focus_ijk: [number, number, number] | null
  points: Array<{ ijk: [number, number, number]; value_mm: number; severity: OverlaySeverity }>
}
export type ThinkingKind = 'step' | 'reasoning' | 'subagent'
export type SubagentPhase = 'spawned' | 'step' | 'returned' | 'failed'
const SUBAGENT_PHASES: readonly string[] = ['spawned', 'step', 'returned', 'failed']
/** Thinking trace line; subagent lines (ai-deep-agent-research R17) name the subagent and its phase. */
export type ThinkingItem =
  | { id: string; kind: 'step' | 'reasoning'; text: string }
  | { id: string; kind: 'subagent'; subagent: string; phase: SubagentPhase; text: string }

export interface ChatMessage {
  id: string
  role: 'human' | 'ai'
  content: string
  streaming?: boolean
  createdAt: string
  /** Live/finished thinking trace for an AI message, in arrival order. */
  thinking?: ThinkingItem[]
  /** Milliseconds from send until the answer arrived. */
  thoughtMs?: number
  /** Staged proposal returned with this answer, if any. */
  proposal?: StagedProposal
  /** Geometric finding that can be drawn in the 3D viewport. */
  overlay?: ViewportOverlay
}
export type ChatTurn = { role: 'human' | 'assistant'; content: string }

/** A case report plan waiting for browser captures (ai-case-report R6). */
export type ReportShot =
  | { id: string; kind: 'view'; section: 'hero' | 'anatomy' | 'repair'; preset: string; objects: string[]; title: string }
  | { id: string; kind: 'annotated_view'; section: 'annotated'; preset: string; objects: string[]; title: string;
      callouts: Array<{ annotation_id: string; label: string }> }
  | { id: string; kind: 'slices'; section: 'slices'; centre: 'defect' | 'volume' | { annotation_id: string }; title: string }
export type ReportJob = { reportId: string; conversationId: string; title: string; shots: ReportShot[] }

function reportJob(value: unknown, conversationId: string): ReportJob | null {
  if (!record(value) || typeof value.report_id !== 'string' || value.conversation_id !== conversationId
    || typeof value.title !== 'string' || !Array.isArray(value.shots)) return null
  const shots = value.shots.filter((shot): shot is ReportShot => record(shot) && typeof shot.id === 'string'
    && (shot.kind === 'view' || shot.kind === 'annotated_view' || shot.kind === 'slices'))
  if (shots.length !== value.shots.length || shots.length === 0) return null
  return { reportId: value.report_id, conversationId, title: value.title, shots }
}
export type StreamEvent =
  | { event: 'metadata'; data: { run_id: string; mode: ChatMode } }
  | { event: 'thinking'; data: ThinkingItem }
  | { event: 'proposal'; data: StagedProposal }
  | { event: 'overlay'; data: ViewportOverlay }
  | { event: 'report'; data: ReportJob }
  | { event: 'messages'; data: Array<{ id: string; content: string; type: string }> }
  | { event: 'end'; data: Record<string, never> }

export const CHAT_STREAM_ENDPOINT = `${API_BASE}/api/ai/chat/stream`
const PROPOSAL_ENDPOINT = (id: string) => `${API_BASE}/api/ai/proposals/${encodeURIComponent(id)}`

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function thinkingItem(value: Record<string, unknown>): ThinkingItem | null {
  if (typeof value.id !== 'string' || typeof value.text !== 'string') return null
  if (value.kind === 'step' || value.kind === 'reasoning') return { id: value.id, kind: value.kind, text: value.text }
  if (value.kind === 'subagent' && typeof value.subagent === 'string' && value.subagent
    && typeof value.phase === 'string' && SUBAGENT_PHASES.includes(value.phase)) {
    return { id: value.id, kind: 'subagent', subagent: value.subagent, phase: value.phase as SubagentPhase, text: value.text }
  }
  return null
}

/** Validate the final envelope against the request; returns the explanation text. */
function validatedExplanation(body: unknown, requestId: string, conversationId: string, context: ChatRequestContext): string {
  if (!record(body) || typeof body.mode !== 'string' || !CHAT_MODES.includes(body.mode) || body.request_id !== requestId || body.conversation_id !== conversationId
    || !record(body.outcome) || typeof body.outcome.explanation !== 'string') throw new Error('Invalid AI chat response.')
  const outcome = body.outcome
  if (outcome.status !== 'completed') throw new Error(String(outcome.explanation))
  const actual = outcome.context
  if (!record(actual) || actual.project_id !== context.project_id || actual.case_id !== context.case_id
    || actual.selected_object_id !== context.object_id || actual.revision_id !== context.expected_revision_id
    || !record(outcome.observation) || outcome.observation.scope !== 'application-read') throw new Error('Chat context mismatch. Reload the selected document.')
  return String(outcome.explanation)
}

const FIX_ACTIONS: readonly string[] = ['generate', 'threshold', 'region']
const optionalString = (value: unknown) => value === null || typeof value === 'string'

function stagedProposal(value: unknown, context: ChatRequestContext): StagedProposal | null {
  if (value === null || value === undefined) return null
  if (!record(value) || value.status !== 'pending' || typeof value.summary !== 'string'
    || ['proposal_id', 'project_id', 'case_id'].some(key => typeof value[key] !== 'string'))
    throw new Error('Invalid AI chat response.')
  if (value.kind === 'rigid_pose') {
    if (typeof value.candidate_id !== 'string' || typeof value.base_revision_id !== 'string') throw new Error('Invalid AI chat response.')
  } else if (value.kind === 'model_fix') {
    if (!optionalString(value.candidate_id) || !optionalString(value.base_revision_id) || !optionalString(value.sample_id ?? null)
      || !record(value.payload) || !FIX_ACTIONS.includes(String(value.payload.action))) throw new Error('Invalid AI chat response.')
  } else {
    throw new Error('Invalid AI chat response.')
  }
  // A proposal must target exactly the selection the question was asked about.
  if (value.project_id !== context.project_id || value.case_id !== context.case_id) return null
  const generate = value.kind === 'model_fix' && (value.payload as Record<string, unknown>).action === 'generate'
  if (!generate && (value.candidate_id !== context.object_id || value.base_revision_id !== context.expected_revision_id)) return null
  return value as unknown as StagedProposal
}

const SEVERITIES: readonly string[] = ['critical', 'warning', 'ok']
const MAX_OVERLAY_POINTS = 5000
const isIjk = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(v => Number.isInteger(v) && v >= 0)

/** Accept an overlay only for the exact selection/revision it was measured on; malformed → dropped. */
function viewportOverlay(value: unknown, context: ChatRequestContext): ViewportOverlay | null {
  if (!record(value) || value.frame !== 'voxel-ijk' || typeof value.overlay_id !== 'string' || typeof value.title !== 'string'
    || !Array.isArray(value.points) || value.points.length === 0 || value.points.length > MAX_OVERLAY_POINTS
    || !Array.isArray(value.legend) || !isIjk(value.sizes)) return null
  if (value.object_id !== context.object_id || (value.revision_id ?? null) !== context.expected_revision_id) return null
  const points = value.points.filter((p): p is ViewportOverlay['points'][number] =>
    record(p) && isIjk(p.ijk) && typeof p.value_mm === 'number' && SEVERITIES.includes(String(p.severity)))
  if (points.length !== value.points.length) return null
  const legend = value.legend.filter((item): item is ViewportOverlay['legend'][number] =>
    record(item) && typeof item.label === 'string' && SEVERITIES.includes(String(item.severity)))
  return { ...(value as unknown as ViewportOverlay), points, legend,
    focus_ijk: isIjk(value.focus_ijk) ? value.focus_ijk : null }
}

async function proposalRequest(url: string, body?: unknown): Promise<StagedProposal> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}) })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = record(payload) && typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    throw new Error(message)
  }
  if (!record(payload) || !record(payload.proposal)) throw new Error('Invalid proposal response.')
  return payload.proposal as unknown as StagedProposal
}

async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = done ? '' : lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try { yield JSON.parse(line) } catch { throw new Error('Invalid AI chat response.') }
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

export const streamingChatClient = {
  async createThread(): Promise<string> { return crypto.randomUUID() },
  async *streamResponse(conversationId: string, history: ChatTurn[], message: string,
    context?: ChatRequestContext | null, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    if (!context) throw new Error('Open a source or candidate to provide chat context.')
    const requestId = crypto.randomUUID()
    const response = await fetch(CHAT_STREAM_ENDPOINT, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ ...context, request_id: requestId, conversation_id: conversationId,
        message, history: history.slice(-24).map(turn => ({ ...turn, content: turn.content.slice(0, 4000) })) }) })
    if (!response.ok) throw new Error(`AI chat unavailable (${response.status}). Start FastAPI with GOOGLE_API_KEY set.`)
    if (!response.body) throw new Error('Invalid AI chat response.')
    let mode: ChatMode | null = null
    for await (const line of ndjsonLines(response.body)) {
      if (!record(line)) throw new Error('Invalid AI chat response.')
      if (line.type === 'metadata') {
        if (typeof line.mode !== 'string' || !CHAT_MODES.includes(line.mode) || line.request_id !== requestId
          || line.conversation_id !== conversationId) throw new Error('Invalid AI chat response.')
        mode = line.mode as ChatMode
        yield { event: 'metadata', data: { run_id: requestId, mode } }
      } else if (line.type === 'thinking') {
        const item = mode ? thinkingItem(line) : null
        if (item) yield { event: 'thinking', data: item }
      } else if (line.type === 'result') {
        const explanation = validatedExplanation(line, requestId, conversationId, context)
        const proposal = stagedProposal(line.staged_proposal, context)
        if (proposal) yield { event: 'proposal', data: proposal }
        const overlay = viewportOverlay(line.viewport_overlay, context)
        if (overlay) yield { event: 'overlay', data: overlay }
        const report = reportJob(line.report_job, conversationId)
        if (report) yield { event: 'report', data: report }
        yield { event: 'messages', data: [{ id: requestId, content: explanation, type: 'AIMessageChunk' }] }
        yield { event: 'end', data: {} }
        return
      }
    }
    throw new Error('AI chat stream ended without a result.')
  },
  /** Human-confirmed commit; the server re-checks identity and that the base revision is current. */
  acceptProposal(proposal: StagedProposal): Promise<StagedProposal> {
    return proposalRequest(`${PROPOSAL_ENDPOINT(proposal.proposal_id)}/accept`, {
      project_id: proposal.project_id, case_id: proposal.case_id,
      candidate_id: proposal.candidate_id, base_revision_id: proposal.base_revision_id })
  },
  discardProposal(proposal: StagedProposal): Promise<StagedProposal> {
    return proposalRequest(`${PROPOSAL_ENDPOINT(proposal.proposal_id)}/discard`)
  },
}
