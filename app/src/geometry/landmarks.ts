import type { SourceLandmark } from '../domain/types'

export function landmarkDistance(a: SourceLandmark, b: SourceLandmark): number {
  if (a.id === b.id) throw new Error('Choose two distinct landmarks')
  if (a.sampleId !== b.sampleId || a.sourceObjectId !== b.sourceObjectId || a.volumeHash !== b.volumeHash) throw new Error('Landmarks require the same source volume')
  if ([a.ras, b.ras].some((point) => point.length !== 3 || point.some((n) => !Number.isFinite(n)))) throw new Error('Landmark coordinates must be finite')
  const distance = Math.hypot(...a.ras.map((value, index) => value - b.ras[index]))
  if (!Number.isFinite(distance)) throw new Error('Distance exceeds finite range')
  return distance
}
