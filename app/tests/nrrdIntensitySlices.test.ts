import { describe, expect, it } from 'vitest'
import { decodeNrrdVoxels } from '../src/geometry/nrrdVoxels'
import {
  extractSlice,
  volumeIntensityRange,
  windowToDisplay,
} from '../src/geometry/slices'

/** Tiny 2×2×1 int16 HU NRRD (raw, little-endian). */
function buildInt16HuNrrd(voxels: number[]): Uint8Array {
  const header = [
    'NRRD0004',
    'type: short',
    'dimension: 3',
    'sizes: 2 2 1',
    'spacings: 1 1 1',
    'encoding: raw',
    'endian: little',
    '',
    '',
  ].join('\n')
  const headerBytes = new TextEncoder().encode(header)
  const payload = new Uint8Array(voxels.length * 2)
  const view = new DataView(payload.buffer)
  voxels.forEach((value, index) => {
    view.setInt16(index * 2, value, true)
  })
  const out = new Uint8Array(headerBytes.length + payload.length)
  out.set(headerBytes, 0)
  out.set(payload, headerBytes.length)
  return out
}

function buildUint8Nrrd(voxels: number[]): Uint8Array {
  const header = [
    'NRRD0004',
    'type: uint8',
    'dimension: 3',
    'sizes: 2 2 1',
    'spacings: 1 1 1',
    'encoding: raw',
    '',
    '',
  ].join('\n')
  const headerBytes = new TextEncoder().encode(header)
  const payload = Uint8Array.from(voxels)
  const out = new Uint8Array(headerBytes.length + payload.length)
  out.set(headerBytes, 0)
  out.set(payload, headerBytes.length)
  return out
}

describe('int16 HU intensity slices (R4)', () => {
  it('decodes short NRRD as Int16Array with HU values outside 0–255', () => {
    const bytes = buildInt16HuNrrd([-1000, 40, 400, 1200])
    const decoded = decodeNrrdVoxels(bytes)
    expect(decoded.type).toMatch(/^(short|int16)$/i)
    expect(decoded.voxels).toBeInstanceOf(Int16Array)
    expect(Array.from(decoded.voxels as Int16Array)).toEqual([-1000, 40, 400, 1200])
    expect(decoded.sizes).toEqual([2, 2, 1])
  })

  it('extracts slice HU values and window/levels to non-flat display', () => {
    const bytes = buildInt16HuNrrd([-1000, 40, 400, 1200])
    const decoded = decodeNrrdVoxels(bytes)
    const slice = extractSlice(decoded.voxels, [2, 2, 1], 'axial', 0)
    expect(Array.from(slice.values)).toEqual([-1000, 40, 400, 1200])

    // Bone preset (P3): center 400, width 1500 → air dark, bone brighter, not flat.
    const display = windowToDisplay(slice.values, 400, 1500)
    expect(display).toBeInstanceOf(Uint8Array)
    const unique = new Set(Array.from(display))
    expect(unique.size).toBeGreaterThan(2)
    expect(display[0]).toBeLessThan(display[2]!)
    expect(display[2]).toBeLessThan(display[3]!)
  })

  it('keeps uint8 curated path: decode, extract, and full-range windowing', () => {
    const bytes = buildUint8Nrrd([0, 64, 128, 255])
    const decoded = decodeNrrdVoxels(bytes)
    expect(decoded.type).toMatch(/^(uint8|uchar)$/i)
    expect(decoded.voxels).toBeInstanceOf(Uint8Array)
    expect(Array.from(decoded.voxels as Uint8Array)).toEqual([0, 64, 128, 255])

    const slice = extractSlice(decoded.voxels, [2, 2, 1], 'axial', 0)
    expect(Array.from(slice.values)).toEqual([0, 64, 128, 255])
    expect(volumeIntensityRange(decoded.voxels)).toEqual([0, 255])

    const display = windowToDisplay(slice.values, 127.5, 255)
    expect(display[0]).toBe(0)
    expect(display[3]).toBe(255)
  })
})
