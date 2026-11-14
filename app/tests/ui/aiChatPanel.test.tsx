/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiChatPanel } from '../../src/ui/AiChatPanel'
import { CanvasWorkspace } from '../../src/ui/CanvasWorkspace'

afterEach(() => cleanup())

describe('AiChatPanel frontend & mock service', () => {
  it('renders the chat panel with header, status, and input', async () => {
    const onOpenChange = vi.fn()
    render(
      <AiChatPanel
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1 · Defect SkullBreak"
      />,
    )

    expect(screen.getByRole('region', { name: 'AI Workspace Assistant' })).toBeTruthy()
    expect(screen.getByText('AI Assistant')).toBeTruthy()
    expect(screen.getByText('Mock')).toBeTruthy()
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
        open={true}
        onOpenChange={onOpenChange}
        contextLabel="Case 1"
      />,
    )

    const closeBtn = screen.getByRole('button', { name: 'Collapse AI assistant panel' })
    fireEvent.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sends user message and receives streamed mock response', async () => {
    render(
      <AiChatPanel
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
        expect(screen.getByText(/Defect area:/i)).toBeTruthy()
      },
      { timeout: 3000 },
    )
  })

  it('clicking a prompt chip sends the prompt immediately', async () => {
    render(
      <AiChatPanel
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
        expect(screen.getByText(/PEEK/i)).toBeTruthy()
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
