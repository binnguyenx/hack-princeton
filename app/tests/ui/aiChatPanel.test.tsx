/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiChatPanel } from '../../src/ui/AiChatPanel'
import { CanvasWorkspace } from '../../src/ui/CanvasWorkspace'

const CHAT_CONTEXT = { projectId: 'project-1', caseId: 'case-1', objectId: 'candidate-1', revisionId: 'revision-1' }

function chatResponse(explanation = 'Read authoritative metadata.') {
  return new Response(JSON.stringify({
    mode: 'fake-read-only', request_id: 'request-1', conversation_id: 'conversation-1',
    outcome: { status: 'completed', explanation },
    limitations: ['No geometry operation was performed.'],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('AiChatPanel read-only FastAPI client', () => {
  it('renders the chat panel with header, status, and input', async () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1 · Defect SkullBreak"
        chatContext={CHAT_CONTEXT}
      />,
    )

    expect(screen.getByRole('region', { name: 'AI Workspace Assistant' })).toBeTruthy()
    expect(screen.getByText('AI Assistant')).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    expect(screen.getByText('Case 1 · Defect SkullBreak')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Ask about defect anatomy/i)).toBeTruthy()

    // Suggested prompt chips
    expect(screen.getByText('Describe the selected object')).toBeTruthy()
    expect(screen.getByText('Show the current revision')).toBeTruthy()

  })

  it('allows collapsing the panel via the close button', () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1"
        chatContext={CHAT_CONTEXT}
      />,
    )

    const closeBtn = screen.getByRole('button', { name: 'Collapse AI assistant panel' })
    fireEvent.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sends a user message and renders the FastAPI outcome', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(chatResponse())
    render(
      <AiChatPanel
        open={true}
        onOpenChange={() => {}}
        contextLabel="Case 1"
        chatContext={CHAT_CONTEXT}
      />,
    )

    const textarea = screen.getByLabelText('Message for AI assistant')
    const sendBtn = screen.getByLabelText('Send message to AI assistant')

    fireEvent.change(textarea, { target: { value: 'measure defect' } })
    fireEvent.click(sendBtn)

    // User message should appear immediately
    expect(screen.getByText('measure defect')).toBeTruthy()

    expect(await screen.findByText('Read authoritative metadata.')).toBeTruthy()
  })

  it('sends the selected workspace context to FastAPI and renders its limitations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        mode: 'fake-read-only',
        request_id: 'request-1',
        conversation_id: 'conversation-1',
        outcome: { status: 'completed', explanation: 'Read authoritative metadata.' },
        limitations: ['No geometry operation was performed.'],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    render(
      <AiChatPanel
        open={true}
        onOpenChange={() => {}}
        contextLabel="Case 1"
        chatContext={CHAT_CONTEXT}
      />,
    )

    fireEvent.change(screen.getByLabelText('Message for AI assistant'), { target: { value: 'Describe it' } })
    fireEvent.click(screen.getByLabelText('Send message to AI assistant'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/chat', expect.objectContaining({ method: 'POST' })))
    expect(await screen.findByText('Read authoritative metadata.')).toBeTruthy()
    expect(screen.getByText(/No geometry operation was performed/)).toBeTruthy()
  })

  it('clicking a prompt chip sends the prompt immediately', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(chatResponse('Read selected metadata.'))
    render(
      <AiChatPanel
        open={true}
        onOpenChange={() => {}}
        contextLabel="Case 1"
        chatContext={CHAT_CONTEXT}
      />,
    )

    const chip = screen.getByRole('button', { name: 'Describe the selected object' })
    fireEvent.click(chip)

    expect(await screen.findByText('Read selected metadata.')).toBeTruthy()
  })
})

describe('CanvasWorkspace AI chat column integration', () => {
  it('toggles AI chat column in CanvasWorkspace', () => {
    render(
      <CanvasWorkspace
        documentName="skullbreak-000"
        activeMode="view"
        volumeAvailable={true}
        selectedObjectId={null}
        onModeChange={() => {}}
      >
        <div>3D Viewport</div>
      </CanvasWorkspace>,
    )

    // Column is open by default
    expect(screen.getByRole('region', { name: 'AI Workspace Assistant' })).toBeTruthy()

    // Click collapse
    const collapseBtn = screen.getByRole('button', { name: 'Collapse AI assistant panel' })
    fireEvent.click(collapseBtn)

    // AI column is now collapsed
    expect(screen.queryByRole('region', { name: 'AI Workspace Assistant' })).toBeNull()

    // Find the expand button on the dock tab
    const expandButtons = screen.getAllByRole('button', { name: /Expand AI assistant/i })
    expect(expandButtons.length).toBeGreaterThanOrEqual(1)

    // Click expand
    fireEvent.click(expandButtons[0])

    // AI column is opened again
    expect(screen.getByRole('region', { name: 'AI Workspace Assistant' })).toBeTruthy()
  })
})
