/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChatPanel } from '../../src/ui/AiChatPanel'
import { CanvasWorkspace } from '../../src/ui/CanvasWorkspace'

const context = { project_id: 'project', case_id: 'case', object_id: 'source', expected_revision_id: null }
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body)
    return new Response(JSON.stringify({ request_id: request.request_id, conversation_id: request.conversation_id,
      mode: 'fake-read-only', outcome: { status: 'completed',
        context: { project_id: request.project_id, case_id: request.case_id, selected_object_id: request.object_id, revision_id: request.expected_revision_id },
        observation: { scope: 'application-read' },
        explanation: request.message.includes('Recommend') ? 'Read-only chat cannot recommend implant constraints.' : 'Stored grid metadata: 2 × 3 × 4 voxels.' } }))
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AiChatPanel read-only FastAPI integration', () => {
  it('renders the chat panel with header, status, and input', async () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        chatContext={context}
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1 · Defect SkullBreak"
      />,
    )

    expect(screen.getByRole('region', { name: 'AI Workspace Assistant' })).toBeTruthy()
    expect(screen.getByText('AI Assistant')).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    expect(screen.getByText('Case 1 · Defect SkullBreak')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Ask about defect anatomy/i)).toBeTruthy()

    // Suggested prompt chips
    expect(screen.getByText('Measure defect dimensions')).toBeTruthy()
    expect(screen.getByText('Recommend implant constraints')).toBeTruthy()

    // Welcome message appears
    await waitFor(() => {
      expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy()
    })
  })

  it('allows collapsing the panel via the close button', () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        chatContext={context}
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
        chatContext={context}
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

  it('clicking a prompt chip sends the prompt immediately', async () => {
    render(
      <AiChatPanel
        chatContext={context}
        open={true}
        onOpenChange={() => {}}
        contextLabel="Case 1"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy()
    })

    const chip = screen.getByRole('button', { name: 'Recommend implant constraints' })
    fireEvent.click(chip)

    // User message should appear in feed and response should arrive
    await waitFor(
      () => {
        expect(screen.getByText(/cannot recommend implant constraints/i)).toBeTruthy()
      },
      { timeout: 3000 },
    )
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

describe('chat conversation scope guards', () => {
  it('disables sending without a real selection', async () => {
    render(<AiChatPanel open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Message for AI assistant'), {target:{value:'hello'}})
    expect((screen.getByLabelText('Send message to AI assistant') as HTMLButtonElement).disabled).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['reset','context change'] as const)('suppresses late replies after %s and starts a fresh conversation', async kind => {
    let resolve!: (response: Response) => void
    let captured: Record<string, unknown> = {}
    const mock = vi.fn((_url, options) => {
      captured = JSON.parse(options.body)
      return new Promise<Response>(done => { resolve = done })
    })
    vi.stubGlobal('fetch',mock)
    const view = render(<AiChatPanel open chatContext={context} onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Message for AI assistant'), {target:{value:'Inspect skull'}})
    fireEvent.click(screen.getByLabelText('Send message to AI assistant'))
    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
    if (kind === 'reset') fireEvent.click(screen.getByLabelText('Reset conversation'))
    else view.rerender(<AiChatPanel open chatContext={{...context,object_id:'another-source'}} onOpenChange={() => {}} />)
    expect(mock.mock.calls[0][1].signal.aborted).toBe(true)
    resolve(new Response(JSON.stringify({request_id:captured.request_id,conversation_id:captured.conversation_id,mode:'fake-read-only',
      outcome:{status:'completed',explanation:'LATE OLD REPLY',context:{...context,selected_object_id:'source',revision_id:null},observation:{scope:'application-read'}}})))
    await waitFor(() => expect(screen.getByText(/cranial reconstruction assistant/i)).toBeTruthy())
    expect(screen.queryByText('LATE OLD REPLY')).toBeNull()
    expect(screen.queryByText('Inspect skull')).toBeNull()
  })
})


it('shows Gemini after a verified response, then reset discards provider and successful history', async () => {
  const requests: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request)
    return new Response(JSON.stringify({request_id:request.request_id,conversation_id:request.conversation_id,
      mode:'llm-read-only',capability_policy:'metadata-read-only',model:{provider:'gemini',id:'gemini-test'},
      outcome:{status:'completed',explanation:'We can inspect stored metadata. Which aspect interests you?',
        context:{...context,selected_object_id:'source',revision_id:null},observation:{scope:'application-read'}}}))
  }))
  const view = render(<AiChatPanel open chatContext={context} onOpenChange={() => {}} />)
  const send = async (value: string) => {
    await waitFor(() => expect((screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('Message for AI assistant'),{target:{value}})
    fireEvent.click(screen.getByLabelText('Send message to AI assistant'))
    await waitFor(() => expect(screen.getByText('Gemini · Read-only')).toBeTruthy())
  }
  await send('Inspect skull')
  await send('continue')
  expect(requests[1].history).toEqual([{role:'human',content:'Inspect skull'},
    {role:'assistant',content:'We can inspect stored metadata. Which aspect interests you?'}])
  fireEvent.click(screen.getByLabelText('Reset conversation'))
  expect(screen.getByText('Read-only')).toBeTruthy()
  await send('Start fresh')
  expect(requests[2].history).toEqual([])
  expect(requests[2].conversation_id).not.toBe(requests[0].conversation_id)
  view.unmount()
  render(<AiChatPanel open chatContext={context} onOpenChange={() => {}} />)
  expect(screen.queryByText('Start fresh')).toBeNull()
})
