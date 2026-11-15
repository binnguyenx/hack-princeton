/**
 * AiChatPanel — Total column chat panel for the canvas workspace.
 *
 * Integrates with LangGraph agent via langGraphClient.
 * Conforms to project design conventions (DESIGN.md):
 *  - Elevated white island, hairline border
 *  - Blue accent for strong action (Send button)
 *  - Calm corporate motion, soft shadows
 *  - Accessible labels and keyboard support
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bot,
  ChevronRight,
  Eye,
  FileText,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react'
import {
  streamingChatClient as langGraphClient,
  type ChatMessage,
  type ChatMode,
  type ChatRequestContext,
  type ChatTurn,
  type ReportJob,
  type StagedProposal,
  type ThinkingItem,
  type ViewportOverlay,
} from '../api/chat'
import { runReportJob, type ReportProgress, type ShotRenderer } from '../report/captureShots'

/** Selection identity from the workspace (camelCase, as App builds it). */
export type ChatContext = {
  projectId: string
  caseId: string
  objectId: string
  revisionId?: string
}

function toRequestContext(context?: ChatContext | null): ChatRequestContext | null {
  if (!context) return null
  return { project_id: context.projectId, case_id: context.caseId, object_id: context.objectId,
    expected_revision_id: context.revisionId ?? null }
}

function chatContextKey(context: ChatRequestContext | null): string {
  return context ? JSON.stringify([context.project_id, context.case_id, context.object_id, context.expected_revision_id]) : ''
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contextLabel?: string
  chatContext?: ChatContext | null
  /** Called after a human-accepted proposal commits, so the workspace reloads. */
  onWorkspaceChanged?: (accepted?: StagedProposal) => void
  /** Id of the AI overlay currently drawn in the viewport (null = none). */
  activeOverlayId?: string | null
  /** Show (overlay) or hide (null) an AI finding in the 3D viewport. */
  onOverlayChange?: (overlay: ViewportOverlay | null) => void
  /** Offscreen captures for case reports (ai-case-report R7); without it reports cannot be built here. */
  reportRenderer?: ShotRenderer
}

type ReportState = { phase: 'queued' } | ReportProgress
type SessionMessage = ChatMessage & { failed?: boolean; report?: { job: ReportJob; state: ReportState } }

const PROVIDER_LABELS: Record<string, string> = { 'gemini-read-only': 'Gemini', 'bedrock-read-only': 'Bedrock' }

type SessionProps = Omit<Props, 'chatContext'> & { chatContext: ChatRequestContext | null }

export function AiChatPanel(props: Props) {
  const chatContext = toRequestContext(props.chatContext)
  // A new selection or revision starts a fresh conversation (and drops stale proposals/overlays).
  return <ChatSession key={chatContextKey(chatContext)} {...props} chatContext={chatContext} />
}

function ChatSession({ open, onOpenChange, contextLabel, chatContext, onWorkspaceChanged, activeOverlayId, onOverlayChange,
  reportRenderer }: SessionProps) {
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Provider is known once the backend answers; the badge starts neutral.
  const [mode, setMode] = useState<ChatMode | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const flight = useRef(0)
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open || threadId) return
    let cancelled = false
    langGraphClient.createThread().then(id => {
      if (cancelled) return
      setThreadId(id)
      setMessages([{ id: 'welcome', role: 'ai',
        content: "Hello! I'm your cranial reconstruction assistant. I can inspect the selected object's metadata, case objects and revision history with read-only tools. Geometry measurements, reconstruction and AI writes are unavailable.",
        createdAt: new Date().toISOString() }])
    }).catch(error => { if (!cancelled) setError(String(error)) })
    return () => { cancelled = true }
  }, [open, threadId])

  useEffect(() => () => { flight.current += 1; controller.current?.abort() }, [])
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight }) }, [messages])
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [open])

  /** Capture → upload → PDF for a report plan; progress goes to the card and the case report group (R15–R17). */
  const startReport = useCallback((messageId: string, job: ReportJob) => {
    const update = (state: ReportState) => setMessages(previous => previous.map(message => {
      if (message.id !== messageId) return message
      return { ...message, report: { job, state }, thinking: withReportProgress(message.thinking, state) }
    }))
    update({ phase: 'queued' })
    if (!reportRenderer) {
      update({ phase: 'failed', error: 'Report capture is not available in this view.' })
      return
    }
    void runReportJob(job, reportRenderer, progress => update(progress))
  }, [reportRenderer])

  const handleSendText = useCallback(async (textToSend: string) => {
    const text = textToSend.trim()
    if (!text || text.length > 4000 || busy.current || !threadId || !chatContext) return
    busy.current = true
    const token = ++flight.current
    const abort = new AbortController()
    controller.current = abort
    const humanId = crypto.randomUUID(), aiId = crypto.randomUUID()
    const startedAt = Date.now()
    setInput(''); setError(null); setIsStreaming(true)
    setMessages(previous => [...previous,
      { id: humanId, role: 'human', content: text, createdAt: new Date().toISOString() },
      { id: aiId, role: 'ai', content: '', streaming: true, createdAt: new Date().toISOString() }])
    let reportJob: ReportJob | null = null
    const history: ChatTurn[] = messages.filter(message => message.id !== 'welcome' && !message.failed && !message.streaming)
      .map(message => ({ role: message.role === 'human' ? 'human' : 'assistant', content: message.content }))
    try {
      for await (const event of langGraphClient.streamResponse(threadId, history, text, chatContext, abort.signal)) {
        if (token !== flight.current || abort.signal.aborted) return
        if (event.event === 'metadata') setMode(event.data.mode)
        if (event.event === 'thinking') {
          const item = event.data
          setMessages(previous => previous.map(message => message.id === aiId
            ? { ...message, thinking: upsertThinking(message.thinking, item) } : message))
        }
        if (event.event === 'overlay') {
          const overlay = event.data
          setMessages(previous => previous.map(message => message.id === aiId ? { ...message, overlay } : message))
        }
        if (event.event === 'report') reportJob = event.data
        if (event.event === 'proposal') {
          const proposal = event.data
          setMessages(previous => previous.map(message => message.id === aiId ? { ...message, proposal } : message))
        }
        if (event.event === 'messages') {
          const content = event.data.at(-1)?.content
          if (content) setMessages(previous => previous.map(message => message.id === aiId
            ? { ...message, content, streaming: true, thoughtMs: Date.now() - startedAt } : message))
        }
        if (event.event === 'end') setMessages(previous => previous.map(message => message.id === aiId ? { ...message, streaming: false } : message))
      }
      if (reportJob && token === flight.current && !abort.signal.aborted) startReport(aiId, reportJob)
    } catch (error) {
      if (token !== flight.current || abort.signal.aborted) return
      setError(error instanceof Error ? error.message : 'Read-only chat unavailable.')
      setMessages(previous => previous.map(message => message.id === aiId
        ? { ...message, content: '[Failed to receive agent response]', failed: true, streaming: false }
        : message.id === humanId ? { ...message, failed: true } : message))
    } finally {
      if (token === flight.current) { busy.current = false; setIsStreaming(false); controller.current = null }
    }
  }, [threadId, chatContext, messages, startReport])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendText(input)
    }
  }

  const handleReset = () => {
    flight.current += 1
    controller.current?.abort()
    controller.current = null
    busy.current = false
    setIsStreaming(false)
    setMessages([])
    setThreadId(null)
    setError(null)
    setInput('')
  }

  return (
    <div className="ai-chat-column-inner" role="region" aria-label="AI Workspace Assistant">
      {/* Header */}
      <header className="ai-chat-header">
        <div className="ai-chat-title">
          <Bot size={16} className="ai-chat-icon" />
          <span>AI Assistant</span>
          <span
            className="ai-chat-badge ai-chat-badge--live"
            title={`Connected to FastAPI LangGraph agent (${PROVIDER_LABELS[mode ?? ''] ?? 'provider set by the server'}, read-only tools)`}
          >
            {PROVIDER_LABELS[mode ?? ''] ?? 'AI'}
          </span>
        </div>
        <div className="ai-chat-header-actions">
          <button
            type="button"
            className="ai-chat-icon-btn"
            title="Reset conversation"
            aria-label="Reset conversation"
            onClick={handleReset}
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            className="ai-chat-icon-btn"
            title="Collapse panel"
            aria-label="Collapse AI assistant panel"
            onClick={() => onOpenChange(false)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      {/* Context banner */}
      {contextLabel && (
        <div className="ai-chat-context" title={contextLabel}>
          <span className="ai-chat-context-tag">Context</span>
          <span className="ai-chat-context-name">{contextLabel}</span>
        </div>
      )}

      {/* Message feed */}
      <div className="ai-chat-feed" ref={scrollRef} tabIndex={0} aria-label="Chat messages history">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
            {msg.role === 'ai' && (
              <div className="ai-chat-avatar" aria-hidden>
                <Sparkles size={12} />
              </div>
            )}
            <div className="ai-chat-bubble">
              {msg.role === 'ai' && (
                <ThinkingTrace items={msg.thinking ?? []} live={!!msg.streaming && !msg.content} thoughtMs={msg.thoughtMs} />
              )}
              {msg.content && <MessageBody content={msg.content} />}
              {msg.overlay && !msg.streaming && (
                <button
                  type="button"
                  className="ai-chat-overlay-btn"
                  aria-pressed={activeOverlayId === msg.overlay.overlay_id}
                  onClick={() => onOverlayChange?.(activeOverlayId === msg.overlay!.overlay_id ? null : msg.overlay!)}
                >
                  <Eye size={12} aria-hidden />
                  {activeOverlayId === msg.overlay.overlay_id ? 'Hide overlay' : 'Show in viewport'}
                </button>
              )}
              {msg.report && !msg.streaming && (
                <ReportCard report={msg.report} onRetry={() => startReport(msg.id, msg.report!.job)} />
              )}
              {msg.proposal && !msg.streaming && (
                <ProposalCard proposal={msg.proposal} chatContext={chatContext} onWorkspaceChanged={onWorkspaceChanged} />
              )}
              {msg.streaming && msg.content && <span className="ai-chat-cursor" aria-hidden>▌</span>}
            </div>
          </div>
        ))}

        {messages.length === 0 && !threadId && (
          <div className="ai-chat-status-msg">
            <Bot size={22} />
            <span>Initializing agent session…</span>
          </div>
        )}

        {error && (
          <div className="ai-chat-error-banner" role="alert">
            {error}
          </div>
        )}
      </div>

      {!chatContext && <div className="ai-chat-status-msg" role="status">Open a source or candidate to provide chat context.</div>}
      {/* Input controls */}
      <div className="ai-chat-input-box">
        <textarea
          ref={inputRef}
          className="ai-chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about defect anatomy, metrics, candidate constraints…"
          rows={2}
          maxLength={4000}
          disabled={isStreaming || !threadId || !chatContext}
          aria-label="Message for AI assistant"
        />
        <button
          type="button"
          className="ai-chat-send-btn"
          aria-label="Send message to AI assistant"
          disabled={!input.trim() || isStreaming || !threadId || !chatContext}
          onClick={() => void handleSendText(input)}
        >
          <Send size={14} />
        </button>
      </div>


    </div>
  )
}

function MessageBody({ content }: { content: string }) {
  if (!content) return null

  const lines = content.split('\n')
  return (
    <div className="ai-chat-formatted">
      {lines.map((line, idx) => {
        // Parse bold **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        const rendered = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pIdx}>{part.slice(2, -2)}</strong>
          }
          return <span key={pIdx}>{withLinks(part)}</span>
        })

        if (/^[•\-*]\s/.test(line)) {
          return (
            <div key={idx} className="ai-chat-li">
              {rendered}
            </div>
          )
        }

        return (
          <span key={idx}>
            {rendered}
            {idx < lines.length - 1 && <br />}
          </span>
        )
      })}
    </div>
  )
}

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** Markdown links become new-tab links only for http(s) URLs (ai-deep-agent-research R19); anything else stays text. */
function withLinks(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [whole, label, href] = match
    const at = match.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(/^https?:\/\//i.test(href)
      ? <a key={at} href={href} target="_blank" rel="noopener noreferrer">{label}</a>
      : whole)
    last = at + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type SubagentItem = Extract<ThinkingItem, { kind: 'subagent' }>
type TraceEntry =
  | { type: 'item'; item: ThinkingItem }
  | { type: 'subagent'; key: string; subagent: string; items: SubagentItem[] }

const SUBAGENT_TITLES: Record<string, string> = { research: 'Research', case_report: 'Case report' }

function subagentTitle(name: string): string {
  return `${SUBAGENT_TITLES[name] ?? 'Specialist'} subagent`
}

/** Group each subagent run (its spawn line id is the prefix of its later lines) into one entry, in order. */
function traceEntries(items: ThinkingItem[]): TraceEntry[] {
  const entries: TraceEntry[] = []
  const runs = new Map<string, Extract<TraceEntry, { type: 'subagent' }>>()
  for (const item of items) {
    if (item.kind !== 'subagent') {
      entries.push({ type: 'item', item })
      continue
    }
    let run = item.phase === 'spawned' ? undefined
      : [...runs.values()].find(r => item.id.startsWith(`${r.key}-`))
    if (!run) {
      run = { type: 'subagent', key: item.phase === 'spawned' ? item.id : `subagent-${item.subagent}`, subagent: item.subagent, items: [] }
      runs.set(run.key, run)
      entries.push(run)
    }
    run.items.push(item)
  }
  return entries
}

function SubagentGroup({ run, live }: { run: Extract<TraceEntry, { type: 'subagent' }>; live: boolean }) {
  const done = [...run.items].reverse().find(item => item.phase === 'returned' || item.phase === 'failed')
  const status: 'returned' | 'failed' | 'running' | 'stopped' =
    done?.phase === 'returned' || done?.phase === 'failed' ? done.phase : live ? 'running' : 'stopped'
  const statusText = { returned: 'returned', failed: 'failed', running: 'running…', stopped: 'stopped' }[status]
  return (
    <li className={`ai-chat-subagent ai-chat-subagent--${status}`} data-subagent={run.subagent} data-status={status}>
      <div className="ai-chat-subagent-header">
        <span className="ai-chat-subagent-title">{subagentTitle(run.subagent)}</span>
        <span className="ai-chat-subagent-status">{statusText}</span>
      </div>
      <ul className="ai-chat-subagent-steps">
        {run.items.map(item => (
          <li key={item.id} className={`ai-chat-thinking-item ai-chat-subagent-item--${item.phase}`}>{item.text}</li>
        ))}
      </ul>
    </li>
  )
}

/** Client-side capture/build steps join the case report subagent's group in the trace (R15). */
function withReportProgress(items: ThinkingItem[] | undefined, state: ReportState): ThinkingItem[] | undefined {
  const list = items ?? []
  const spawned = [...list].reverse().find(item => item.kind === 'subagent' && item.subagent === 'case_report' && item.phase === 'spawned')
  const key = spawned?.id ?? 'subagent-case_report'
  const step = (suffix: string, text: string, phase: 'step' | 'failed' = 'step'): ThinkingItem =>
    ({ id: `${key}-client-${suffix}`, kind: 'subagent', subagent: 'case_report', phase, text })
  // A retry starts clean: drop the previous attempt's client lines.
  const kept = state.phase === 'queued' ? list.filter(item => !item.id.startsWith(`${key}-client-`)) : list
  if (state.phase === 'queued') return kept
  if (state.phase === 'capturing') return upsertThinking(kept, step('capture', `Capturing views (${state.done}/${state.total})`))
  if (state.phase === 'building') return upsertThinking(kept, step('build', 'Building PDF'))
  if (state.phase === 'ready') return upsertThinking(kept, step('ready', `Report ready (${state.pages} pages)`))
  return upsertThinking(kept, step('failed', state.error, 'failed'))
}

function ReportCard({ report, onRetry }: { report: { job: ReportJob; state: ReportState }; onRetry: () => void }) {
  const { job, state } = report
  return (
    <div className="ai-chat-report-card" aria-label="Case report">
      <div className="ai-chat-report-title">
        <FileText size={14} aria-hidden />
        <span>{job.title}</span>
      </div>
      {state.phase === 'queued' && <div className="ai-chat-report-status">Preparing captures…</div>}
      {state.phase === 'capturing' && (
        <div className="ai-chat-report-status" role="status">Capturing views ({state.done}/{state.total})</div>
      )}
      {state.phase === 'building' && <div className="ai-chat-report-status" role="status">Building PDF…</div>}
      {state.phase === 'ready' && (
        <>
          <div className="ai-chat-report-status">PDF · {state.pages} pages · demonstration only</div>
          <div className="ai-chat-report-actions">
            <a className="btn btn--primary btn--xs" href={state.pdfUrl} target="_blank" rel="noopener noreferrer">Open PDF</a>
            <a className="btn btn--secondary btn--xs" href={state.pdfUrl} download={`case-report-${job.reportId.slice(0, 8)}.pdf`}>Download</a>
          </div>
        </>
      )}
      {state.phase === 'failed' && (
        <>
          <div className="ai-chat-report-error" role="alert">{state.error}</div>
          <div className="ai-chat-report-actions">
            <button type="button" className="btn btn--secondary btn--xs" onClick={onRetry}>Try again</button>
          </div>
        </>
      )}
    </div>
  )
}

/** Replace an item with the same id (a step's result supersedes its "…" label), else append. */
function upsertThinking(items: ThinkingItem[] | undefined, item: ThinkingItem): ThinkingItem[] {
  const list = items ?? []
  return list.some(existing => existing.id === item.id)
    ? list.map(existing => existing.id === item.id ? item : existing)
    : [...list, item]
}

function formatThoughtDuration(ms?: number): string {
  if (ms === undefined) return 'Thought process'
  const seconds = Math.round(ms / 1000)
  return seconds < 1 ? 'Thought for <1s' : `Thought for ${seconds}s`
}

/** Live "Thinking…" trace while waiting; collapses to an expandable summary once answered. */
function ThinkingTrace({ items, live, thoughtMs }: { items: ThinkingItem[]; live: boolean; thoughtMs?: number }) {
  const entries = traceEntries(items)
  const list = items.length > 0 && (
    <ul className="ai-chat-thinking-list">
      {entries.map(entry => entry.type === 'subagent'
        ? <SubagentGroup key={entry.key} run={entry} live={live} />
        : <li key={entry.item.id} className={`ai-chat-thinking-item ai-chat-thinking-item--${entry.item.kind}`}>{entry.item.text}</li>)}
    </ul>
  )
  if (live) {
    return (
      <div className="ai-chat-thinking ai-chat-thinking--live" role="status" aria-live="polite">
        <div className="ai-chat-thinking-label">
          <span className="ai-chat-thinking-dot" aria-hidden />
          Thinking…
        </div>
        {list}
      </div>
    )
  }
  if (!items.length) return null
  const steps = items.filter(item => item.kind === 'step').length
  const subagents = entries.filter(entry => entry.type === 'subagent').length
  return (
    <details className="ai-chat-thinking">
      <summary className="ai-chat-thinking-label">
        <ChevronRight size={12} className="ai-chat-thinking-chevron" aria-hidden />
        {formatThoughtDuration(thoughtMs)}
        {steps > 0 && ` · ${steps} ${steps === 1 ? 'step' : 'steps'}`}
        {subagents > 0 && ` · ${subagents} ${subagents === 1 ? 'subagent' : 'subagents'}`}
      </summary>
      {list}
    </details>
  )
}

type ProposalUiState = 'pending' | 'accepting' | 'accepted' | 'discarding' | 'discarded'

/** True only while the selection is exactly the proposal's candidate at its base revision. */
function proposalMatches(proposal: StagedProposal, context?: ChatRequestContext | null): boolean {
  if (!context || context.project_id !== proposal.project_id || context.case_id !== proposal.case_id) return false
  // A generate proposal is bound to the skull (case), not to a candidate revision.
  if (proposal.kind === 'model_fix' && proposal.payload.action === 'generate') return true
  return context.object_id === proposal.candidate_id && context.expected_revision_id === proposal.base_revision_id
}

function proposalMeta(proposal: StagedProposal): string {
  if (proposal.kind === 'rigid_pose') return `Candidate pose · based on revision ${proposal.base_revision_id.slice(0, 8)}`
  const { action, threshold } = proposal.payload
  if (action === 'generate') return 'Predicted fix · runs the cranial model on this skull'
  const change = action === 'threshold' ? `Fix threshold ${threshold}` : 'Fix region'
  return `${change} · based on revision ${(proposal.base_revision_id ?? '').slice(0, 8)}`
}

/** Review card for an AI-staged change. Nothing is written until the user clicks Accept. */
function ProposalCard({ proposal, chatContext, onWorkspaceChanged }: {
  proposal: StagedProposal; chatContext?: ChatRequestContext | null; onWorkspaceChanged?: (accepted?: StagedProposal) => void
}) {
  const [state, setState] = useState<ProposalUiState>('pending')
  const [error, setError] = useState<string | null>(null)
  const settled = state === 'accepted' || state === 'discarded'
  // Stale protection: hide an unresolved proposal once the object or revision changes.
  if (!settled && !proposalMatches(proposal, chatContext)) return null
  const busy = state === 'accepting' || state === 'discarding'

  const accept = async () => {
    setState('accepting'); setError(null)
    try {
      const accepted = await langGraphClient.acceptProposal(proposal)
      setState('accepted')
      onWorkspaceChanged?.(accepted)
    } catch (failure) {
      setState('pending')
      setError(failure instanceof Error ? failure.message : 'Proposal could not be applied.')
    }
  }
  const discard = async () => {
    setState('discarding'); setError(null)
    try {
      await langGraphClient.discardProposal(proposal)
    } catch {
      // Discard is local-first; an unreachable server cannot apply it either.
    }
    setState('discarded')
  }

  return (
    <section className={`ai-chat-proposal ai-chat-proposal--${state}`} aria-label="Proposed change">
      <div className="ai-chat-proposal-head">
        <span className="ai-chat-proposal-title">Proposed change</span>
        <span className="ai-chat-proposal-tag">
          {state === 'accepted' ? 'Applied' : state === 'discarded' ? 'Discarded' : 'Review required'}
        </span>
      </div>
      <p className="ai-chat-proposal-summary">{proposal.summary}</p>
      <p className="ai-chat-proposal-meta">
        {proposalMeta(proposal)}
      </p>
      {error && <p className="ai-chat-proposal-error" role="alert">{error}</p>}
      {!settled && (
        <div className="ai-chat-proposal-actions">
          <button type="button" className="ai-chat-proposal-btn ai-chat-proposal-btn--primary"
            disabled={busy} onClick={() => void accept()}>
            {state === 'accepting' ? 'Applying…' : 'Accept proposal'}
          </button>
          <button type="button" className="ai-chat-proposal-btn" disabled={busy} onClick={() => void discard()}>
            Discard
          </button>
        </div>
      )}
    </section>
  )
}
