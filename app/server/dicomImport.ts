import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SpatialMeta } from '../src/domain/types'
import { addSample } from './storageSqlite'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONVERTER = path.join(HERE, 'dicomToNrrd.py')
const DEFAULT_LICENSE = 'user-supplied-ct'

export type DicomConverterMeta = {
  type: string
  sizes: number[]
  spacings: number[]
  origin?: number[]
  direction?: number[]
  space?: string
  spatiallyVerified: boolean
  spatialReason?: string | null
  voxelCount: number
  sliceCount: number
  seriesInstanceUID?: string
}

export type ImportDicomSampleArgs = {
  projectId: string
  caseId: string
  displayName?: string
  license?: string
  files: Array<{ originalname: string; buffer: Buffer }>
}

function resolvePython(): string {
  const cranial = path.resolve(HERE, '../cranial-env/bin/python')
  const probe = spawnSync(cranial, ['-c', 'import SimpleITK'], { encoding: 'utf8' })
  if (probe.status === 0) return cranial
  const sys = spawnSync('python3', ['-c', 'import SimpleITK'], { encoding: 'utf8' })
  if (sys.status === 0) return 'python3'
  throw new Error(
    'SimpleITK is required for DICOM import. Install into app/cranial-env (pip install SimpleITK) or system python3.',
  )
}

function directionToSpaceDirections(
  direction: number[],
  spacings: number[],
): SpatialMeta['spaceDirections'] | undefined {
  if (direction.length !== 9 || spacings.length < 3) return undefined
  // SimpleITK direction is row-major 3×3; column i is axis-i cosine.
  const col = (i: number): [number, number, number] => [
    direction[i]! * spacings[i]!,
    direction[3 + i]! * spacings[i]!,
    direction[6 + i]! * spacings[i]!,
  ]
  return [col(0), col(1), col(2)]
}

export function metaToSpatial(meta: DicomConverterMeta): SpatialMeta {
  const sizes = meta.sizes
  const spacings = meta.spacings
  const bboxMm = sizes.map((s, i) => s * (spacings[i] ?? 1))
  const origin = meta.origin
  const spaceOrigin =
    origin && origin.length >= 3
      ? ([origin[0], origin[1], origin[2]] as [number, number, number])
      : undefined
  return {
    units: 'mm',
    space: meta.space ?? 'LPS',
    patientBasis: 'LPS',
    sizes,
    spacings,
    bboxMm,
    spaceOrigin,
    spaceDirections: meta.direction
      ? directionToSpaceDirections(meta.direction, spacings)
      : undefined,
  }
}

/** Run server-side DICOM→NRRD converter on a temp folder of uploaded instances. */
export function convertDicomFolder(inputDir: string, outputNrrd: string): DicomConverterMeta {
  const python = resolvePython()
  const result = spawnSync(python, [CONVERTER, inputDir, outputNrrd], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'DICOM conversion failed').trim()
    throw new Error(detail)
  }
  const stdout = (result.stdout || '').trim()
  if (!stdout) throw new Error('DICOM converter produced no metadata')
  return JSON.parse(stdout) as DicomConverterMeta
}

export async function importDicomSample(args: ImportDicomSampleArgs) {
  if (!args.files.length) {
    throw new Error('files are required')
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-dicom-upload-'))
  try {
    const inputDir = path.join(tempRoot, 'dicom')
    await mkdir(inputDir)
    for (const file of args.files) {
      const safeName = path.basename(file.originalname) || 'instance.dcm'
      await writeFile(path.join(inputDir, safeName), file.buffer)
    }
    const outNrrd = path.join(tempRoot, 'converted.nrrd')
    const meta = convertDicomFolder(inputDir, outNrrd)
    const bytes = await readFile(outNrrd)
    const spatial = metaToSpatial(meta)
    const sample = await addSample({
      projectId: args.projectId,
      caseId: args.caseId,
      displayName: args.displayName?.trim() || 'CT intensity',
      spatiallyVerified: meta.spatiallyVerified,
      meta: spatial,
      bytes,
      license: args.license?.trim() || DEFAULT_LICENSE,
    })
    return sample
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
