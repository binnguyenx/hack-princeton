import { afterEach, expect, it, vi } from 'vitest'
import { executeCanvasCommand, registerCanvasCommandDispatcher } from '../src/debug/bridge'
afterEach(() => registerCanvasCommandDispatcher(undefined))
it('dispatches supported view commands but never domain writes or unknown commands', () => {
  const dispatch = vi.fn(() => ({ ok: true as const, value: undefined }))
  registerCanvasCommandDispatcher(dispatch)
  expect(executeCanvasCommand('view.reset').ok).toBe(true)
  expect(dispatch).toHaveBeenCalledWith('view.reset')
  expect(executeCanvasCommand('object.applyDraft').ok).toBe(false)
  expect(executeCanvasCommand('edit.redo').ok).toBe(false)
  expect(executeCanvasCommand('unknown').ok).toBe(false)
  expect(dispatch).toHaveBeenCalledTimes(1)
})
it('reports absent/disabled runtime rather than claiming an effect', () => {
  expect(executeCanvasCommand('view.reset').ok).toBe(false)
  registerCanvasCommandDispatcher(() => ({ ok: false, error: 'No document open' }))
  expect(executeCanvasCommand('view.reset')).toEqual({ ok: false, error: 'No document open' })
})
