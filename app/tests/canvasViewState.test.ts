import { describe, expect, it } from 'vitest'
import { navigateCamera, readState } from '../src/ops'
import type { CameraState } from '../src/domain/types'
import { openDemo } from './helpers'

describe('canvas view-state safety', () => {
  it('rejects non-finite camera state and preserves the last valid camera', async () => {
    const ctx = await openDemo()
    const valid: CameraState = {
      position: [120, 80, 220],
      target: [0, 0, 0],
    }
    expect(navigateCamera(ctx, valid)).toEqual({ ok: true, value: undefined })

    const invalid: CameraState = {
      position: [Number.NaN, 80, 220],
      target: [0, 0, 0],
    }
    expect(navigateCamera(ctx, invalid)).toEqual({
      ok: false,
      error: 'Camera state must contain finite coordinates',
    })

    const state = readState(ctx)
    expect(state.ok && state.value?.view.camera).toEqual(valid)
  })

  it('rejects a camera positioned on its target', async () => {
    const ctx = await openDemo()
    expect(
      navigateCamera(ctx, {
        position: [4, 5, 6],
        target: [4, 5, 6],
      }),
    ).toEqual({
      ok: false,
      error: 'Camera must remain separated from its target',
    })
  })
})
