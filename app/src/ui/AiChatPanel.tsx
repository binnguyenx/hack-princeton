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

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronRight,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react'
import { langGraphClient, type ChatMessage, type ChatTurn } from '../ai/langGraphClient'
import { chatContextKey, type ChatContext } from '../ai/chatContext'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contextLabel?: string
  chatContext?: ChatContext | null
}

const QUICK_PROMPTS = [
  'Measure defect dimensions',
  'Recommend implant constraints',
  'Review candidate margins',
  'Draft reconstruction brief',
]

export function AiChatPanel(props: Props) {
  return <ChatSession key={chatContextKey(props.chatContext)} {...props} />
}

function ChatSession({ open, onOpenChange, contextLabel, chatContext }: Props) {
  const [messages, setMessages] = useState<(ChatMessage & { failed?: boolean })[]>([])
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
        content: "Hello! I'm your cranial reconstruction assistant. This chat uses a fake model to read selected-object metadata. Geometry measurements, reconstruction and AI writes are unavailable.",
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

  const handleSendText = useCallback(async (textToSend: string) => {
    const text = textToSend.trim()
    if (!text || text.length > 4000 || busy.current || !threadId || !chatContext) return
    busy.current = true
    const token = ++flight.current
    const abort = new AbortController()
    controller.current = abort
    const humanId = crypto.randomUUID(), aiId = crypto.randomUUID()
    setInput(''); setError(null); setIsStreaming(true)
    setMessages(previous => [...previous,
      { id: humanId, role: 'human', content: text, createdAt: new Date().toISOString() },
      { id: aiId, role: 'ai', content: '', streaming: true, createdAt: new Date().toISOString() }])
    const history: ChatTurn[] = messages.filter(message => message.id !== 'welcome' && !message.failed && !message.streaming)
      .map(message => ({ role: message.role === 'human' ? 'human' : 'assistant', content: message.content }))
    try {
      for await (const event of langGraphClient.streamResponse(threadId, history, text, chatContext, abort.signal)) {
        if (token !== flight.current || abort.signal.aborted) return
        if (event.event === 'messages') {
          const content = event.data.at(-1)?.content
          if (content) setMessages(previous => previous.map(message => message.id === aiId ? { ...message, content, streaming: true } : message))
        }
        if (event.event === 'end') setMessages(previous => previous.map(message => message.id === aiId ? { ...message, streaming: false } : message))
      }
    } catch (error) {
      if (token !== flight.current || abort.signal.aborted) return
      setError(error instanceof Error ? error.message : 'Read-only chat unavailable.')
      setMessages(previous => previous.map(message => message.id === aiId
        ? { ...message, content: '[Failed to receive agent response]', failed: true, streaming: false }
        : message.id === humanId ? { ...message, failed: true } : message))
    } finally {
      if (token === flight.current) { busy.current = false; setIsStreaming(false); controller.current = null }
    }
  }, [threadId, chatContext, messages])

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
            className={`ai-chat-badge ${
              langGraphClient.isMock ? 'ai-chat-badge--mock' : 'ai-chat-badge--live'
            }`}
            title={
              langGraphClient.isMock
                ? 'Connected to FastAPI with a read-only fake model'
                : 'Connected to live LangGraph API'
            }
          >
            {langGraphClient.isMock ? 'Mock' : 'Live'}
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
              <MessageBody content={msg.content} />
              {msg.streaming && <span className="ai-chat-cursor" aria-hidden>▌</span>}
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

      {/* Quick suggestion prompt chips */}
      <div className="ai-chat-chips" aria-label="Suggested prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="ai-chat-chip"
            disabled={isStreaming || !threadId || !chatContext}
            onClick={() => void handleSendText(prompt)}
          >
            {prompt}
          </button>
        ))}
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
          return <span key={pIdx}>{part}</span>
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
