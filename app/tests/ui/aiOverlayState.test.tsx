/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAiOverlay } from '../../src/ai/useAiOverlay'
import type { ViewportOverlay } from '../../src/api/chat'
import { AiChatPanel } from '../../src/ui/AiChatPanel'
import { ndjsonResponse } from '../chatStreamMock'

const overlay = {
  overlay_id: 'ov-1', kind: 'rim_thickness', title: 'Rim thickness', unit: 'mm', threshold_mm: 2,
  legend: [{ severity: 'critical', label: '< 2.0 mm' }, { severity: 'ok', label: '≥ 2.5 mm' }], frame: 'voxel-ijk',
  sizes: [100, 100, 100], spacing_mm: [1, 1, 1], object_id: 'source', revision_id: null, focus_ijk: [5, 6, 7],
  points: [{ ijk: [5, 6, 7], value_mm: 1.5, severity: 'critical' }],
} as ViewportOverlay
const panelContext = { projectId: 'project', caseId: 'case', objectId: 'source' }

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AI overlay state', () => {
  it('keeps an overlay for the same selection and clears it when the selection changes', () => {
    const { result, rerender } = renderHook(({ key }) => useAiOverlay(key), { initialProps: { key: 'p|c|source|' } })
    act(() => result.current[1](overlay))
    expect(result.current[0]?.overlay_id).toBe('ov-1')
    rerender({ key: 'p|c|source|' })
    expect(result.current[0]?.overlay_id).toBe('ov-1')
    rerender({ key: 'p|c|candidate|rev-2' })
    expect(result.current[0]).toBeNull()
  })

  it('"Show in viewport" toggles the overlay and disappears on selection change', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body)
      return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id, mode: 'bedrock-read-only',
        outcome: { status: 'completed', explanation: 'The thinnest rim bone is 1.5 mm.',
          context: { project_id: 'project', case_id: 'case', selected_object_id: 'source', revision_id: null },
          observation: { scope: 'application-read' } }, viewport_overlay: overlay })
    }))
    const onOverlayChange = vi.fn()
    const view = render(<AiChatPanel chatContext={panelContext} open onOpenChange={vi.fn()}
      activeOverlayId={null} onOverlayChange={onOverlayChange} />)
    const input = await waitFor(() => {
      const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
      expect(box.disabled).toBe(false)
      return box
    })
    fireEvent.change(input, { target: { value: 'Check the rim thickness' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
    const show = await screen.findByRole('button', { name: 'Show in viewport' })
    expect(show.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(show)
    expect(onOverlayChange).toHaveBeenLastCalledWith(expect.objectContaining({ overlay_id: 'ov-1' }))
    view.rerender(<AiChatPanel chatContext={panelContext} open onOpenChange={vi.fn()}
      activeOverlayId="ov-1" onOverlayChange={onOverlayChange} />)
    const hide = screen.getByRole('button', { name: 'Hide overlay' })
    expect(hide.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(hide)
    expect(onOverlayChange).toHaveBeenLastCalledWith(null)
    view.rerender(<AiChatPanel chatContext={{ ...panelContext, objectId: 'other' }} open onOpenChange={vi.fn()}
      activeOverlayId={null} onOverlayChange={onOverlayChange} />)
    expect(screen.queryByRole('button', { name: 'Show in viewport' })).toBeNull()
  })
})
