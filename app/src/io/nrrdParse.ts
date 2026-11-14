import type { SpatialMeta } from '../domain/types'

export type NrrdParseResult = {
  bytes: Uint8Array
  spatial: SpatialMeta
  header: Record<string, string>
}

function indexOfDoubleNewline(raw: Uint8Array): { split: number; sep: number } {
  for (let i = 0; i < raw.length - 1; i++) {
    if (raw[i] === 10 && raw[i + 1] === 10) return { split: i, sep: 2 }
    if (
      i < raw.length - 3 &&
      raw[i] === 13 &&
      raw[i + 1] === 10 &&
      raw[i + 2] === 13 &&
      raw[i + 3] === 10
    ) {
      return { split: i, sep: 4 }
    }
  }
  return { split: -1, sep: 0 }
}

function parseVector(raw: string): [number, number, number] {
  const values = raw
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map((value) => Number(value.trim()))
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`Invalid NRRD vector: ${raw}`)
  }
  return values as [number, number, number]
}

/** Browser-safe NRRD header parse (raw encoding assumed for voxel access). */
export function parseNrrdBuffer(buf: Uint8Array): NrrdParseResult {
  const { split } = indexOfDoubleNewline(buf)
  if (split < 0) throw new Error('NRRD header terminator missing')
  const headerText = new TextDecoder('ascii').decode(buf.subarray(0, split))
  const header: Record<string, string> = {}
  for (const line of headerText.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('NRRD')) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    header[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  const sizes = (header.sizes ?? '').split(/\s+/).filter(Boolean).map(Number)
  if (!sizes.length) throw new Error('NRRD sizes missing')
  let spacings: number[] = []
  if (header.spacings) {
    spacings = header.spacings.split(/\s+/).map(Number)
  } else if (header['space directions']) {
    const vecs = [...header['space directions'].matchAll(/\(([^)]+)\)/g)]
    spacings = vecs.map((m) => {
      const comps = m[1].split(',').map((c) => Number(c.trim()))
      return Math.sqrt(comps.reduce((a, b) => a + b * b, 0))
    })
  } else {
    throw new Error('NRRD spacings / space directions missing')
  }
  if (spacings.length < sizes.length) throw new Error('NRRD spacings incomplete')
  const bboxMm = sizes.map((s, i) => s * spacings[i])
  const space = header.space
  const directionMatches = header['space directions']
    ? [...header['space directions'].matchAll(/\(([^)]+)\)/g)]
    : []
  const spaceDirections =
    directionMatches.length >= 3
      ? (directionMatches.slice(0, 3).map((match) =>
          parseVector(match[1]),
        ) as [
          [number, number, number],
          [number, number, number],
          [number, number, number],
        ])
      : undefined
  const spaceOrigin = header['space origin']
    ? parseVector(header['space origin'])
    : undefined
  const patientBasis = space?.toLowerCase().startsWith('right-')
    ? 'RAS'
    : space?.toLowerCase().startsWith('left-')
      ? 'LPS'
      : undefined
  return {
    bytes: buf,
    header,
    spatial: {
      units: space ? 'mm' : 'unknown',
      space,
      patientBasis,
      sizes,
      spacings,
      bboxMm,
      spaceOrigin,
      spaceDirections,
    },
  }
}

export function withinTol(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol
}
