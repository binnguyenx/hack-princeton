/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChatPanel } from '../../src/ui/AiChatPanel'
import { CanvasWorkspace } from '../../src/ui/CanvasWorkspace'
import { ndjsonLines, ndjsonResponse } from '../chatStreamMock'

const context = { project_id: 'project', case_id: 'case', object_id: 'source', expected_revision_id: null }
const panelContext = { projectId: 'project', caseId: 'case', objectId: 'source' }
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return ndjsonResponse(({ request_id: request.request_id, conversation_id: request.conversation_id,
      mode: 'gemini-read-only', outcome: { status: 'completed',
        context: { project_id: request.project_id, case_id: request.case_id, selected_object_id: request.object_id, revision_id: request.expected_revision_id },
        observation: { scope: 'application-read' },
        explanation: 'Stored grid metadata: 2 × 3 × 4 voxels.' } }))
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AiChatPanel Gemini FastAPI integration', () => {
  it('renders the chat panel with header, status, and input', async () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        chatContext={panelContext}
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1 · Defect SkullBreak"
      />,
    )

    expect(screen.getByRole('region', { name: 'AI Workspace Assistant' })).toBeTruthy()
    expect(screen.getByText('AI Assistant')).toBeTruthy()
    expect(screen.getByText('AI')).toBeTruthy()
    expect(screen.getByText('Case 1 · Defect SkullBreak')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Ask about defect anatomy/i)).toBeTruthy()
    expect(screen.queryByLabelText('Suggested prompts')).toBeNull()

    // Welcome message appears
    await waitFor(() => {
      expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy()
    })
  })

  it('shows the Gemini badge once the backend reports Gemini', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body)
      return ndjsonResponse(({ request_id: request.request_id, conversation_id: request.conversation_id,
        mode: 'gemini-read-only', outcome: { status: 'completed', explanation: 'Gemini answer.',
          context: { project_id: request.project_id, case_id: request.case_id, selected_object_id: request.object_id, revision_id: request.expected_revision_id },
          observation: { scope: 'application-read' } } }))
    }))
    render(<AiChatPanel chatContext={panelContext} open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('AI')).toBeTruthy()
    const input = await waitFor(() => {
      const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
      expect(box.disabled).toBe(false)
      return box
    })
    fireEvent.change(input, { target: { value: 'What is selected?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
    await waitFor(() => expect(screen.getByText('Gemini answer.')).toBeTruthy())
    expect(screen.getByText('Gemini')).toBeTruthy()
  })

  it('shows the Bedrock badge when the backend reports the Bedrock provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body)
      return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id,
        mode: 'bedrock-read-only', outcome: { status: 'completed', explanation: 'Bedrock answer.',
          context: { project_id: request.project_id, case_id: request.case_id, selected_object_id: request.object_id, revision_id: request.expected_revision_id },
          observation: { scope: 'application-read' } } })
    }))
    render(<AiChatPanel chatContext={panelContext} open={true} onOpenChange={vi.fn()} />)
    const input = await waitFor(() => {
      const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
      expect(box.disabled).toBe(false)
      return box
    })
    fireEvent.change(input, { target: { value: 'Which model?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
    await waitFor(() => expect(screen.getByText('Bedrock answer.')).toBeTruthy())
    expect(screen.getByText('Bedrock')).toBeTruthy()
  })

  it('allows collapsing the panel via the close button', () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        chatContext={panelContext}
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1"
      />,
    )

    const closeBtn = screen.getByRole('button', { name: 'Collapse AI assistant panel' })
    fireEvent.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sends user message and receives backend response', async () => {
    render(
      <AiChatPanel
        chatContext={panelContext}
        open={true}
        onOpenChange={() => {}}
        contextLabel="Case 1"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy()
    })

    const textarea = screen.getByLabelText('Message for AI assistant')
    const sendBtn = screen.getByLabelText('Send message to AI assistant')

    fireEvent.change(textarea, { target: { value: 'measure defect' } })
    fireEvent.click(sendBtn)

    // User message should appear immediately
    expect(screen.getByText('measure defect')).toBeTruthy()

    // Streamed mock response should arrive
    await waitFor(
      () => {
        expect(screen.getByText(/Stored grid metadata:/i)).toBeTruthy()
      },
      { timeout: 3000 },
    )
  })

}
)

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

describe('chat conversation scope guards', () => {
  it('disables sending without a real selection', async () => {
    render(<AiChatPanel open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Message for AI assistant'), {target:{value:'hello'}})
    expect((screen.getByLabelText('Send message to AI assistant') as HTMLButtonElement).disabled).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('shows live thinking while waiting, then collapses it into a summary', async () => {
    let push!: (text: string) => void
    let close!: () => void
    let captured: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      captured = JSON.parse(options.body)
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        push = text => controller.enqueue(encoder.encode(text))
        close = () => controller.close()
      } })
      return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } })
    }))
    render(<AiChatPanel chatContext={panelContext} open={true} onOpenChange={vi.fn()} />)
    const input = await waitFor(() => {
      const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
      expect(box.disabled).toBe(false)
      return box
    })
    fireEvent.change(input, { target: { value: 'Is PMMA safe in situ?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
    await waitFor(() => expect(screen.getByText('Thinking…')).toBeTruthy())
    const envelope = { request_id: captured.request_id, conversation_id: captured.conversation_id, mode: 'gemini-read-only',
      outcome: { status: 'completed', explanation: 'In-situ PMMA can exceed 80 °C.',
        context: { ...context, selected_object_id: 'source', revision_id: null }, observation: { scope: 'application-read' } } }
    const [metadata, ...rest] = ndjsonLines(envelope).trim().split('\n')
    push(metadata + '\n')
    push(JSON.stringify({ type: 'thinking', id: 'step-1', kind: 'step', text: 'Searching the clinical knowledge base…' }) + '\n')
    await waitFor(() => expect(screen.getByText('Searching the clinical knowledge base…')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toContain('Thinking…')
    push(JSON.stringify({ type: 'thinking', id: 'step-1', kind: 'step', text: 'Searching the clinical knowledge base: found PMMA' }) + '\n')
    await waitFor(() => expect(screen.getByText('Searching the clinical knowledge base: found PMMA')).toBeTruthy())
    expect(screen.queryByText('Searching the clinical knowledge base…')).toBeNull()
    push(rest.join('\n') + '\n'); close()
    await waitFor(() => expect(screen.getByText('In-situ PMMA can exceed 80 °C.')).toBeTruthy())
    expect(screen.queryByText('Thinking…')).toBeNull()
    const summary = screen.getByText(/Thought for .* · 1 step/)
    expect(summary.closest('details')).toBeTruthy()
    expect(summary.closest('details')?.textContent).toContain('found PMMA')
  })

  it.each(['reset','context change'] as const)('suppresses late replies after %s and starts a fresh conversation', async kind => {
    let resolve!: (response: Response) => void
    let captured: Record<string, unknown> = {}
    const mock = vi.fn((_url, options) => {
      captured = JSON.parse(options.body)
      return new Promise<Response>(done => { resolve = done })
    })
    vi.stubGlobal('fetch',mock)
    const view = render(<AiChatPanel open chatContext={panelContext} onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Message for AI assistant'), {target:{value:'Inspect skull'}})
    fireEvent.click(screen.getByLabelText('Send message to AI assistant'))
    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
    if (kind === 'reset') fireEvent.click(screen.getByLabelText('Reset conversation'))
    else view.rerender(<AiChatPanel open chatContext={{...panelContext,objectId:'another-source'}} onOpenChange={() => {}} />)
    expect(mock.mock.calls[0][1].signal.aborted).toBe(true)
    resolve(ndjsonResponse(({request_id:captured.request_id,conversation_id:captured.conversation_id,mode:'gemini-read-only',
      outcome:{status:'completed',explanation:'LATE OLD REPLY',context:{...context,selected_object_id:'source',revision_id:null},observation:{scope:'application-read'}}})))
    await waitFor(() => expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy())
    expect(screen.queryByText('LATE OLD REPLY')).toBeNull()
    expect(screen.queryByText('Inspect skull')).toBeNull()
  })
})
