import { gunzipSync } from 'fflate'

export type NrrdVoxelType = 'uint8' | 'int16' | string
export type VoxelBuffer = Uint8Array | Int16Array

/** Split NRRD header from payload; gunzip when encoding is gzip. */
export function decodeNrrdVoxels(fileBytes: Uint8Array): {
  voxels: VoxelBuffer
  encoding: string
  sizes: number[]
  type: NrrdVoxelType
} {
  let split = -1
  let sep = 2
  for (let i = 0; i < fileBytes.length - 1; i++) {
    if (fileBytes[i] === 10 && fileBytes[i + 1] === 10) {
      split = i
      sep = 2
      break
    }
    if (
      i < fileBytes.length - 3 &&
      fileBytes[i] === 13 &&
      fileBytes[i + 1] === 10 &&
      fileBytes[i + 2] === 13 &&
      fileBytes[i + 3] === 10
    ) {
      split = i
      sep = 4
      break
    }
  }
  if (split < 0) throw new Error('NRRD header missing')
  const headerText = new TextDecoder('ascii').decode(fileBytes.subarray(0, split))
  const lines = headerText.split(/\r?\n/)
  const encoding =
    lines
      .find((l) => l.toLowerCase().startsWith('encoding:'))
      ?.split(':')[1]
      ?.trim()
      .toLowerCase() ?? 'raw'
  const sizesLine = lines.find((l) => l.startsWith('sizes:'))
  const sizes = (sizesLine?.split(':')[1] ?? '')
    .trim()
    .split(/\s+/)
    .map(Number)
  const typeRaw =
    lines
      .find((l) => l.toLowerCase().startsWith('type:'))
      ?.split(':')[1]
      ?.trim()
      .toLowerCase() ?? 'uint8'
  const endian =
    lines
      .find((l) => l.toLowerCase().startsWith('endian:'))
      ?.split(':')[1]
      ?.trim()
      .toLowerCase() ?? 'little'
  const payload = fileBytes.subarray(split + sep)
  let raw: Uint8Array
  if (encoding === 'gzip' || encoding === 'gz') {
    raw = gunzipSync(payload)
  } else if (encoding === 'raw') {
    raw = payload
  } else {
    throw new Error(`Unsupported NRRD encoding: ${encoding}`)
  }

  const normalizedType = normalizeNrrdType(typeRaw)
  if (normalizedType === 'int16') {
    const little = endian !== 'big'
    const count = Math.floor(raw.length / 2)
    const voxels = new Int16Array(count)
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    for (let i = 0; i < count; i += 1) {
      voxels[i] = view.getInt16(i * 2, little)
    }
    return { voxels, encoding, sizes, type: 'int16' }
  }

  return { voxels: raw, encoding, sizes, type: normalizedType }
}

function normalizeNrrdType(typeRaw: string): NrrdVoxelType {
  if (
    typeRaw === 'short' ||
    typeRaw === 'int16' ||
    typeRaw === 'signed short'
  ) {
    return 'int16'
  }
  if (
    typeRaw === 'uint8' ||
    typeRaw === 'uchar' ||
    typeRaw === 'unsigned char' ||
    typeRaw === 'uint8_t'
  ) {
    return 'uint8'
  }
  return typeRaw
}
