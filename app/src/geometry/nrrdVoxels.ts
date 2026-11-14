import { gunzipSync } from 'fflate'

/** Split NRRD header from payload; gunzip when encoding is gzip. */
export function decodeNrrdVoxels(fileBytes: Uint8Array): {
  voxels: Uint8Array
  encoding: string
  sizes: number[]
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
  const encoding =
    headerText
      .split(/\r?\n/)
      .find((l) => l.toLowerCase().startsWith('encoding:'))
      ?.split(':')[1]
      ?.trim()
      .toLowerCase() ?? 'raw'
  const sizesLine = headerText.split(/\r?\n/).find((l) => l.startsWith('sizes:'))
  const sizes = (sizesLine?.split(':')[1] ?? '')
    .trim()
    .split(/\s+/)
    .map(Number)
  const payload = fileBytes.subarray(split + sep)
  let voxels: Uint8Array
  if (encoding === 'gzip' || encoding === 'gz') {
    voxels = gunzipSync(payload)
  } else if (encoding === 'raw') {
    voxels = payload
  } else {
    throw new Error(`Unsupported NRRD encoding: ${encoding}`)
  }
  return { voxels, encoding, sizes }
}
