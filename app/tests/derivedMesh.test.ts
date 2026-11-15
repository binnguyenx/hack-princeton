import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { volumeToDisplayMesh } from '../src/geometry/derivedMesh'
import { sample0 } from './helpers'

/** Tiny 8×8×8 int16 HU NRRD: air shell + bone cube core. */
function buildInt16HuCubeNrrd(): Uint8Array {
  const size = 8
  const voxels = new Int16Array(size * size * size)
  voxels.fill(-1000)
  for (let z = 2; z < 6; z += 1) {
    for (let y = 2; y < 6; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        voxels[x + y * size + z * size * size] = 800
      }
    }
  }
  const header = [
    'NRRD0004',
    'type: short',
    'dimension: 3',
    `sizes: ${size} ${size} ${size}`,
    'spacings: 1 1 1',
    'encoding: raw',
    'endian: little',
    '',
    '',
  ].join('\n')
  const headerBytes = new TextEncoder().encode(header)
  const payload = new Uint8Array(voxels.buffer, voxels.byteOffset, voxels.byteLength)
  const out = new Uint8Array(headerBytes.length + payload.length)
  out.set(headerBytes, 0)
  out.set(payload, headerBytes.length)
  return out
}

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

  it('builds a mesh from int16 HU NRRD via bone threshold (not uint8-only)', () => {
    const bytes = buildInt16HuCubeNrrd()
    const mesh = volumeToDisplayMesh(
      bytes,
      {
        units: 'mm',
        sizes: [8, 8, 8],
        spacings: [1, 1, 1],
        bboxMm: [8, 8, 8],
      },
      { resolution: 24 },
    )
    const pos = mesh.geometry.getAttribute('position')
    expect(pos.count).toBeGreaterThan(50)
  })
})
