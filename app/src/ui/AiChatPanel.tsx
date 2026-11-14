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
import { langGraphClient, type ChatMessage } from '../ai/langGraphClient'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contextLabel?: string
}

const QUICK_PROMPTS = [
  'Measure defect dimensions',
  'Recommend implant constraints',
  'Review candidate margins',
  'Draft reconstruction brief',
]

export function AiChatPanel({ open, onOpenChange, contextLabel }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef(false)

  // Initialize conversation thread on mount or open
  useEffect(() => {
    if (!open || threadId) return
    langGraphClient
      .createThread()
      .then((id) => {
        setThreadId(id)
        setMessages([
          {
            id: 'welcome',
            role: 'ai',
            content: `Hello! I'm your cranial reconstruction assistant${
              contextLabel ? ` analyzing **${contextLabel}**` : ''
            }.\n\nI can compute defect metrics, verify candidate margins, and prepare reconstruction constraints. How can I assist?`,
            createdAt: new Date().toISOString(),
          },
        ])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not start AI session'))
  }, [open, threadId, contextLabel])

  // Scroll to bottom as messages stream
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isStreaming])

  // Focus textarea when opened
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150)
      return () => clearTimeout(timer)
    }
  }, [open])

  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  const handleSendText = useCallback(
    async (textToSend: string) => {
      const text = textToSend.trim()
      if (!text || isStreaming || !threadId) return
      setInput('')
      setError(null)

      const humanMsg: ChatMessage = {
        id: uid(),
        role: 'human',
        content: text,
        createdAt: new Date().toISOString(),
      }

      const aiMsgId = uid()
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        role: 'ai',
        content: '',
        streaming: true,
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, humanMsg, aiMsg])
      setIsStreaming(true)
      abortRef.current = false

      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role === 'human' ? 'human' : 'assistant',
          content: m.content,
        }))

      try {
        for await (const event of langGraphClient.streamResponse(threadId, history, text)) {
          if (abortRef.current) break

          if (event.event === 'messages') {
            const chunks = Array.isArray(event.data) ? event.data : [event.data]
            const latest = chunks.at(-1)
            if (latest && typeof latest.content === 'string') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId ? { ...m, content: latest.content, streaming: true } : m,
                ),
              )
            }
          }

          if (event.event === 'end') {
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, streaming: false } : m)),
            )
          }

          if (event.event === 'error') {
            throw new Error(
              typeof event.data === 'object' && event.data !== null && 'message' in event.data
                ? String((event.data as { message: string }).message)
                : 'Agent execution failed',
            )
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error communicating with agent')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: '[Failed to receive agent response]', streaming: false }
              : m,
          ),
        )
      } finally {
        setIsStreaming(false)
      }
    },
    [isStreaming, threadId, messages],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendText(input)
    }
  }

  const handleReset = () => {
    if (isStreaming) abortRef.current = true
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
                ? 'Mock LangGraph agent service active'
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
            disabled={isStreaming || !threadId}
            onClick={() => void handleSendText(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

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
          disabled={isStreaming || !threadId}
          aria-label="Message for AI assistant"
        />
        <button
          type="button"
          className="ai-chat-send-btn"
          aria-label="Send message to AI assistant"
          disabled={!input.trim() || isStreaming || !threadId}
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
