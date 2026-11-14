import { describe, expect, it } from 'vitest'
import { loadSampleVolume } from '../src/io/nrrd'
import { sample0, sample1 } from './helpers'

describe('R3 reference check', () => {
  it('both curated samples match metadata.json within tolerance', async () => {
    for (const dir of [sample0, sample1]) {
      const loaded = await loadSampleVolume(dir)
      expect(loaded.spatiallyVerified, loaded.verifyError).toBe(true)
      expect(loaded.meta.license).toMatch(/CC BY-NC-SA/)
      expect(loaded.meta.r3ToleranceMm).toBeTypeOf('number')
    }
  })
})
