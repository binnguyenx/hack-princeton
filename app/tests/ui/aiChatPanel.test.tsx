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

describe('subagent trace and source links (ai-deep-agent-research R18, R19)', () => {
  async function answer(explanation: string, thinking: Parameters<typeof ndjsonResponse>[1]) {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body)
      return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id, mode: 'gemini-read-only',
        outcome: { status: 'completed', explanation, context: { ...context, selected_object_id: 'source', revision_id: null },
          observation: { scope: 'application-read' } } }, thinking)
    }))
    render(<AiChatPanel chatContext={panelContext} open={true} onOpenChange={vi.fn()} />)
    const input = await waitFor(() => {
      const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
      expect(box.disabled).toBe(false)
      return box
    })
    fireEvent.change(input, { target: { value: 'Papers on PEEK?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
  }

  it('S9: groups a research subagent run with its steps and result, counted separately in the summary', async () => {
    await answer('PEEK had fewer infections [1].', [
      { id: 'step-k', kind: 'step', text: 'Searching the clinical knowledge base: no verified protocol covers this' },
      { id: 'subagent-t1', kind: 'subagent', subagent: 'research', phase: 'spawned', text: 'Spawned research subagent: PEEK infection' },
      { id: 'subagent-t1-s1', kind: 'subagent', subagent: 'research', phase: 'step', text: 'Searching PubMed for “PEEK”…' },
      { id: 'subagent-t1-s1', kind: 'subagent', subagent: 'research', phase: 'step', text: 'PubMed: 2 results' },
      { id: 'subagent-t1-done', kind: 'subagent', subagent: 'research', phase: 'returned', text: 'Research subagent returned 2 sources: PEEK…' },
    ])
    await waitFor(() => expect(screen.getByText('PEEK had fewer infections [1].')).toBeTruthy())
    const summary = screen.getByText(/1 step · 1 subagent/)
    const group = summary.closest('details')!.querySelector('[data-subagent="research"]') as HTMLElement
    expect(group).toBeTruthy()
    expect(group.textContent).toContain('Research subagent')
    expect(group.textContent).toContain('PubMed: 2 results')
    expect(group.textContent).toContain('returned 2 sources')
    expect(group.textContent).not.toContain('Searching PubMed for “PEEK”…')
    expect(group.getAttribute('data-status')).toBe('returned')
  })

  it('S8: http(s) markdown links open in a new tab; other schemes stay plain text', async () => {
    await answer('See [PubMed](https://pubmed.ncbi.nlm.nih.gov/1/) and [x](javascript:alert(1)).', [])
    const link = await waitFor(() => screen.getByRole('link', { name: 'PubMed' }))
    expect(link.getAttribute('href')).toBe('https://pubmed.ncbi.nlm.nih.gov/1/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.queryByRole('link', { name: 'x' })).toBeNull()
    expect(screen.getByText(/\[x\]\(javascript:alert\(1\)\)/)).toBeTruthy()
  })
})

describe('case report card (ai-case-report R15–R17, S9)', () => {
  const job = { report_id: 'rep-1', status: 'needs-captures', title: 'Defect review', shots: [
    { id: 'shot-01', kind: 'view', section: 'hero', preset: 'left', objects: ['source'], title: '' },
    { id: 'shot-02', kind: 'slices', section: 'slices', centre: 'defect', title: '' }] }
  const renderer = {
    captureView: vi.fn(async () => new Blob(['v'], { type: 'image/png' })),
    captureSlices: vi.fn(async () => new Blob(['s'], { type: 'image/png' })),
  }

  function stubServer(uploads: Array<{ status: number; body: unknown }>) {
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      if (String(url).includes('/captures')) {
        const next = uploads.shift()!
        return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } })
      }
      const request = JSON.parse(String(options.body))
      return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id, mode: 'gemini-read-only',
        outcome: { status: 'completed', explanation: 'Your case report is being prepared.',
          context: { ...context, selected_object_id: 'source', revision_id: null }, observation: { scope: 'application-read' } },
        report_job: { ...job, conversation_id: request.conversation_id } }, [
        { id: 'subagent-t1', kind: 'subagent', subagent: 'case_report', phase: 'spawned', text: 'Spawned case report subagent: report' },
        { id: 'subagent-t1-r1', kind: 'subagent', subagent: 'case_report', phase: 'step', text: 'Reading the conversation…' },
        { id: 'subagent-t1-done', kind: 'subagent', subagent: 'case_report', phase: 'returned', text: 'Case report subagent returned: Submitted.' }])
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  async function ask() {
    render(<AiChatPanel chatContext={panelContext} open={true} onOpenChange={vi.fn()} reportRenderer={renderer} />)
    const input = await waitFor(() => {
      const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
      expect(box.disabled).toBe(false)
      return box
    })
    fireEvent.change(input, { target: { value: 'Make a case report' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
  }

  const ready = { status: 200, body: { report: { report_id: 'rep-1', conversation_id: 'x', status: 'ready', title: 'Defect review', pages: 7, error: null } } }

  it('captures, builds and shows Open PDF / Download, with progress in the case report group', async () => {
    stubServer([ready])
    await ask()
    const open = await waitFor(() => screen.getByRole('link', { name: 'Open PDF' }))
    expect(open.getAttribute('href')).toBe('/api/ai/reports/rep-1.pdf')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('download')).toBeTruthy()
    expect(screen.getByLabelText('Case report').textContent).toContain('7 pages')
    const group = document.querySelector('[data-subagent="case_report"]') as HTMLElement
    expect(group.textContent).toContain('Capturing views (2/2)')
    expect(group.textContent).toContain('Report ready')
    expect(renderer.captureView).toHaveBeenCalled()
    expect(renderer.captureSlices).toHaveBeenCalled()
  })

  it('a failed build shows the error and Try again re-runs capture and build without another chat request', async () => {
    const fetchMock = stubServer([{ status: 500, body: { error: 'The PDF could not be built.', code: 'pdf-build-failed' } }, ready])
    await ask()
    await waitFor(() => expect(screen.getByLabelText('Case report').textContent).toContain('The PDF could not be built'))
    expect((document.querySelector('[data-subagent="case_report"]') as HTMLElement).getAttribute('data-status')).toBe('failed')
    const chatCalls = () => fetchMock.mock.calls.filter(([url]) => !String(url).includes('/captures')).length
    expect(chatCalls()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open PDF' })).toBeTruthy())
    expect(chatCalls()).toBe(1)
  })
})

