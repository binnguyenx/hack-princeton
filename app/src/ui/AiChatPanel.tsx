/**
 * AiChatPanel — Total column chat panel for the canvas workspace.
 *
 * Uses the same read-only FastAPI chat route as the application.
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
import { chatClient, type ChatMode, type ReadOnlyChatRequest } from '../api/chat'

type ChatMessage = {
  id: string
  role: 'human' | 'ai'
  content: string
}

export type ChatContext = {
  projectId: string
  caseId: string
  objectId: string
  revisionId?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contextLabel?: string
  chatContext?: ChatContext
}

const QUICK_PROMPTS = [
  'Describe the selected object',
  'Show the current revision',
  'What metadata is available?',
]

export function AiChatPanel({ open, onOpenChange, contextLabel, chatContext }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Conversation ids correlate stateless requests; FastAPI does not persist history.
  useEffect(() => {
    if (open && !conversationId) setConversationId(uid())
  }, [open, conversationId])

  // Scroll to the newest completed request.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isSending])

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
      if (!text || isSending || !conversationId || !chatContext) return
      setInput('')
      setError(null)

      const humanMsg: ChatMessage = {
        id: uid(),
        role: 'human',
        content: text,
      }

      const aiMsgId = uid()
      setMessages((prev) => [...prev, humanMsg])
      setIsSending(true)

      try {
        const request: ReadOnlyChatRequest = {
          request_id: uid(),
          conversation_id: conversationId,
          project_id: chatContext.projectId,
          case_id: chatContext.caseId,
          object_id: chatContext.objectId,
          expected_revision_id: chatContext.revisionId,
          message: text,
        }
        const response = await chatClient.send(request)
        setMode(response.mode)
        const content = [response.outcome.explanation, ...response.limitations.map((item) => `• ${item}`)]
          .filter(Boolean)
          .join('\n\n')
        setMessages((prev) => [...prev, { id: aiMsgId, role: 'ai', content }])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error communicating with agent')
      } finally {
        setIsSending(false)
      }
    },
    [isSending, conversationId, chatContext],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendText(input)
    }
  }

  const handleReset = () => {
    setMessages([])
    setConversationId(null)
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
            className="ai-chat-badge"
            title={mode === 'gemini-read-only' ? 'FastAPI LangGraph agent (Gemini) with read-only tools' : 'Read-only FastAPI chat'}
          >
            {mode === 'gemini-read-only' ? 'Gemini · read-only' : 'Read-only'}
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
            </div>
          </div>
        ))}

        {messages.length === 0 && !conversationId && (
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
            disabled={isSending || !conversationId || !chatContext}
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
          disabled={isSending || !conversationId || !chatContext}
          aria-label="Message for AI assistant"
        />
        <button
          type="button"
          className="ai-chat-send-btn"
          aria-label="Send message to AI assistant"
          disabled={!input.trim() || isSending || !conversationId || !chatContext}
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
