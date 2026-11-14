import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { volumeToDisplayMesh } from '../src/geometry/derivedMesh'
import { sample0 } from './helpers'

describe('display mesh', () => {
  it('builds a mesh from gzip NRRD + spatial meta', async () => {
    const bytes = new Uint8Array(await readFile(`${sample0}/defective_skull.nrrd`))
    const mesh = volumeToDisplayMesh(
      bytes,
      {
        units: 'mm',
        space: 'left-posterior-superior',
        sizes: [512, 512, 512],
        spacings: [0.4, 0.4, 0.4],
        bboxMm: [204.8, 204.8, 204.8],
      },
      { resolution: 32 },
    )
    const pos = mesh.geometry.getAttribute('position')
    expect(pos.count).toBeGreaterThan(100)
  })
})
