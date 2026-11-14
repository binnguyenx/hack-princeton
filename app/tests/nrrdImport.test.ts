import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSampleVolume, parseNrrdBuffer } from '../src/io/nrrd'
import { sample0 } from './helpers'

describe('R2 nrrd import', () => {
  it('preserves units, spacing, orientation from defective volume', async () => {
    const loaded = await loadSampleVolume(sample0)
    expect(loaded.spatiallyVerified).toBe(true)
    expect(loaded.spatial.spacings).toEqual([0.4, 0.4, 0.4])
    expect(loaded.spatial.sizes).toEqual([512, 512, 512])
    expect(loaded.spatial.space).toBe('left-posterior-superior')
    expect(loaded.spatial.units).toBe('mm')
  })

  it('marks unverified when required spatial fields stripped', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'nrrd-bad-'))
    await copyFile(path.join(sample0, 'metadata.json'), path.join(tmp, 'metadata.json'))
    const good = await readFile(path.join(sample0, 'defective_skull.nrrd'))
    // Corrupt: remove space directions / spacings from header
    const text = good.toString('binary')
    const split = text.indexOf('\n\n')
    let header = text.slice(0, split)
    header = header
      .split('\n')
      .filter((l) => !l.startsWith('space directions:') && !l.startsWith('spacings:'))
      .join('\n')
    const bad = Buffer.from(header + '\n\n' + text.slice(split + 2), 'binary')
    await writeFile(path.join(tmp, 'defective_skull.nrrd'), bad)
    const loaded = await loadSampleVolume(tmp)
    expect(loaded.spatiallyVerified).toBe(false)
  })

  it('parseNrrdBuffer fails without sizes', () => {
    const buf = new TextEncoder().encode('NRRD0005\nencoding: raw\n\n')
    expect(() => parseNrrdBuffer(buf)).toThrow(/sizes/i)
  })
})
