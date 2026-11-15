/** @vitest-environment jsdom */
// Generate-fix button, progress card and run polling (cranial-reconstruction-candidate R5, R10, R11, S5).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIX_STAGES, FixProgressCard, GenerateFixButton } from '../../src/ui/FixGeneration'
import { FixRunLostError, watchRun, type FixRun } from '../../src/ui/fixRun'
import { ApiCodeError } from '../../src/api/client'

afterEach(() => cleanup())

const run = (over: Partial<FixRun>): FixRun => ({ runId: 'r1', status: 'running', stage: 'Checking skull', elapsedS: 0, ...over })

describe('FixProgressCard', () => {
  it('shows the current stage and advances the bar through the fixed stage list', () => {
    const { rerender } = render(<FixProgressCard run={run({ stage: 'Uploading skull' })} />)
    const bar = screen.getByRole('progressbar')
    const first = Number(bar.getAttribute('aria-valuenow'))
    expect(screen.getByText('Uploading skull')).toBeTruthy()
    rerender(<FixProgressCard run={run({ stage: 'Predicting missing bone' })} />)
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(first)
    expect(FIX_STAGES).toEqual(['Checking skull', 'Uploading skull', 'Waking model', 'Predicting missing bone',
      'Mapping fix onto skull', 'Building mesh', 'Saving candidate'])
  })

  it('ends on the real failure message, not a stage', () => {
    render(<FixProgressCard run={run({ status: 'failed', error: { code: 'empty-prediction', message: 'The model predicted no missing bone for this skull.' } })} />)
    expect(screen.getByRole('alert').textContent).toContain('The model predicted no missing bone for this skull.')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('GenerateFixButton', () => {
  it('is disabled with the reason when the selection cannot be used', () => {
    const onGenerate = vi.fn()
    render(<GenerateFixButton disabledReason="Only segmented skull masks (NRRD) are supported" running={false} onGenerate={onGenerate} />)
    const button = screen.getByRole('button', { name: /generate fix/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toContain('Only segmented skull masks')
  })

  it('cannot start a second run while one is active', () => {
    const onGenerate = vi.fn()
    render(<GenerateFixButton disabledReason={null} running onGenerate={onGenerate} />)
    const button = screen.getByRole('button', { name: /generat/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('starts generation when enabled', () => {
    const onGenerate = vi.fn()
    render(<GenerateFixButton disabledReason={null} running={false} onGenerate={onGenerate} />)
    fireEvent.click(screen.getByRole('button', { name: /generate fix/i }))
    expect(onGenerate).toHaveBeenCalledOnce()
  })
})

describe('watchRun', () => {
  it('reports each server state in order and stops on the terminal one', async () => {
    const states = [run({ stage: 'Uploading skull' }), run({ stage: 'Predicting missing bone' }),
      run({ status: 'succeeded', stage: 'Saving candidate', result: { candidateId: 'c1', revisionId: 'v1', implantVoxels: 8 } })]
    const get = vi.fn(async () => states.shift()!)
    const seen: string[] = []
    const final = await watchRun(get, 'r1', (r) => seen.push(r.stage), { sleep: async () => {} })
    expect(seen).toEqual(['Uploading skull', 'Predicting missing bone', 'Saving candidate'])
    expect(final.status).toBe('succeeded')
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('keeps tracking through a transient poll failure', async () => {
    const results: Array<FixRun | Error> = [run({ stage: 'Uploading skull' }), new Error('network'),
      run({ status: 'succeeded', stage: 'Saving candidate' })]
    const get = vi.fn(async () => { const next = results.shift()!; if (next instanceof Error) throw next; return next })
    const final = await watchRun(get, 'r1', () => {}, { sleep: async () => {} })
    expect(final.status).toBe('succeeded')
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('gives up with FixRunLostError after too many consecutive failures', async () => {
    const get = vi.fn(async (): Promise<FixRun> => { throw new Error('down') })
    await expect(watchRun(get, 'r1', () => {}, { sleep: async () => {}, maxConsecutiveErrors: 2 }))
      .rejects.toBeInstanceOf(FixRunLostError)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('stops immediately when the server no longer knows the run', async () => {
    const get = vi.fn(async (): Promise<FixRun> => { throw new ApiCodeError('gone', 'run-not-found', 404) })
    await expect(watchRun(get, 'r1', () => {}, { sleep: async () => {} })).rejects.toBeInstanceOf(ApiCodeError)
    expect(get).toHaveBeenCalledOnce()
  })

  it('times out a run that never finishes', async () => {
    let t = 0
    const get = vi.fn(async () => run({ stage: 'Predicting missing bone' }))
    await expect(watchRun(get, 'r1', () => {}, { sleep: async () => { t += 1000 }, now: () => t, timeoutMs: 3000 }))
      .rejects.toBeInstanceOf(FixRunLostError)
  })
})
