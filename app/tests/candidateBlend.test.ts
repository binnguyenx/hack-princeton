import { expect, it } from 'vitest'
import { blendSlice } from '../src/geometry/candidateBlend'
it('blends literal source/candidate values and respects opacity without changing either buffer', () => {
  const background = new Uint8Array([0,1]), candidate = new Uint8Array([1,0])
  expect(Array.from(blendSlice(background, candidate, .5, 1, .5, 'normal'))).toEqual([0,41,102,255,255,255,255,255])
  expect(Array.from(blendSlice(background, candidate, .5, 1, 1, 'maximum'))).toEqual([255,255,255,255,255,255,255,255])
  expect(Array.from(blendSlice(background, candidate, .5, 1, 1, 'difference'))).toEqual([255,255,255,255,255,255,255,255])
  expect(Array.from(blendSlice(background, candidate, .5, 1, 0, 'normal'))).toEqual([0,0,0,255,255,255,255,255])
  expect(Array.from(background)).toEqual([0,1]); expect(Array.from(candidate)).toEqual([1,0])
})
