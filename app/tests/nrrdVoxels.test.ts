import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { decodeNrrdVoxels } from '../src/geometry/nrrdVoxels'
import { sample0 } from './helpers'

describe('gzip NRRD voxels', () => {
  it('decompresses SkullBreak defective volume to 512^3 voxels', async () => {
    const bytes = new Uint8Array(await readFile(`${sample0}/defective_skull.nrrd`))
    const { voxels, encoding, sizes } = decodeNrrdVoxels(bytes)
    expect(encoding).toBe('gzip')
    expect(sizes).toEqual([512, 512, 512])
    expect(voxels.length).toBe(512 * 512 * 512)
    const solid = voxels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0)
    expect(solid).toBeGreaterThan(1000)
  })
})
