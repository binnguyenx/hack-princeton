import type { SpatialMeta } from '../domain/types'

export type Vec3 = [number, number, number]

export function lpsToRas([l, p, s]: Vec3): Vec3 {
  return [-l, -p, s]
}

function basisFor(spatial: SpatialMeta): 'RAS' | 'LPS' {
  if (spatial.patientBasis) return spatial.patientBasis
  return spatial.space?.toLowerCase().startsWith('right-') ? 'RAS' : 'LPS'
}

function directionsFor(spatial: SpatialMeta): [Vec3, Vec3, Vec3] {
  if (spatial.spaceDirections) return spatial.spaceDirections
  return [
    [spatial.spacings[0] ?? 1, 0, 0],
    [0, spatial.spacings[1] ?? 1, 0],
    [0, 0, spatial.spacings[2] ?? 1],
  ]
}

function originFor(spatial: SpatialMeta): Vec3 {
  return spatial.spaceOrigin ?? [0, 0, 0]
}

function imageToPatient(spatial: SpatialMeta, [i, j, k]: Vec3): Vec3 {
  const [x, y, z] = originFor(spatial)
  const [di, dj, dk] = directionsFor(spatial)
  return [
    x + di[0] * i + dj[0] * j + dk[0] * k,
    y + di[1] * i + dj[1] * j + dk[1] * k,
    z + di[2] * i + dj[2] * j + dk[2] * k,
  ]
}

export function ijkToRas(spatial: SpatialMeta, ijk: Vec3): Vec3 {
  const patient = imageToPatient(spatial, ijk)
  return basisFor(spatial) === 'RAS' ? patient : lpsToRas(patient)
}

function determinant3(columns: [Vec3, Vec3, Vec3]): number {
  const [a, b, c] = columns
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    b[0] * (a[1] * c[2] - a[2] * c[1]) +
    c[0] * (a[1] * b[2] - a[2] * b[1])
  )
}

function inverseMultiply(columns: [Vec3, Vec3, Vec3], value: Vec3): Vec3 {
  const det = determinant3(columns)
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    throw new Error('Image-to-patient transform is singular')
  }
  const [a, b, c] = columns
  return [
    determinant3([value, b, c]) / det,
    determinant3([a, value, c]) / det,
    determinant3([a, b, value]) / det,
  ]
}

export function rasToIjk(spatial: SpatialMeta, ras: Vec3): Vec3 {
  const patient = basisFor(spatial) === 'RAS' ? ras : lpsToRas(ras)
  const origin = originFor(spatial)
  return inverseMultiply(directionsFor(spatial), [
    patient[0] - origin[0],
    patient[1] - origin[1],
    patient[2] - origin[2],
  ])
}
