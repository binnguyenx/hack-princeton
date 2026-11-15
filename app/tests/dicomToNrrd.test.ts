import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { decodeNrrdVoxels } from '../src/geometry/nrrdVoxels'

const here = path.dirname(fileURLToPath(import.meta.url))
const tinySeries = path.join(here, 'fixtures/dicom-series-tiny')
const twoSeries = path.join(here, 'fixtures/dicom-series-two')
const converter = path.resolve(here, '../server/dicomToNrrd.py')

function resolvePython(): string {
  const cranial = path.resolve(here, '../cranial-env/bin/python')
  const probe = spawnSync(cranial, ['-c', 'import SimpleITK'], { encoding: 'utf8' })
  if (probe.status === 0) return cranial
  const sys = spawnSync('python3', ['-c', 'import SimpleITK'], { encoding: 'utf8' })
  if (sys.status === 0) return 'python3'
  throw new Error(
    'SimpleITK required for DICOM conversion tests (app/cranial-env or python3)',
  )
}

function runConverter(inputDir: string, outputNrrd: string) {
  const python = resolvePython()
  return spawnSync(python, [converter, inputDir, outputNrrd], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
}

describe('dicomToNrrd converter (R3, R5, R7, R11)', () => {
  let tempRoot = ''

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
    tempRoot = ''
  })

  it('converts one-series fixture to int16 HU NRRD with spatial JSON', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-dcm-'))
    const outNrrd = path.join(tempRoot, 'out.nrrd')
    const result = runConverter(tinySeries, outNrrd)
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const meta = JSON.parse(result.stdout) as {
      type: string
      sizes: number[]
      spacings: number[]
      spatiallyVerified: boolean
      voxelCount: number
    }
    expect(meta.type).toMatch(/^(short|int16)$/i)
    expect(meta.sizes).toEqual([8, 8, 4])
    expect(meta.spacings[0]).toBeCloseTo(1, 5)
    expect(meta.spacings[1]).toBeCloseTo(1, 5)
    expect(meta.spacings[2]).toBeCloseTo(1, 5)
    expect(meta.spatiallyVerified).toBe(true)
    expect(meta.voxelCount).toBe(8 * 8 * 4)

    const bytes = new Uint8Array(await readFile(outNrrd))
    const decoded = decodeNrrdVoxels(bytes)
    expect(decoded.type).toBe('int16')
    expect(decoded.voxels).toBeInstanceOf(Int16Array)
    const values = Array.from(decoded.voxels as Int16Array)
    expect(values.some((v) => v < 0)).toBe(true)
    expect(values.some((v) => v > 255)).toBe(true)
    expect(values).toContain(-1000)
  })

  it('rejects a folder with two SeriesInstanceUIDs', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-dcm2-'))
    const outNrrd = path.join(tempRoot, 'out.nrrd')
    const result = runConverter(twoSeries, outNrrd)
    expect(result.status).not.toBe(0)
    expect(`${result.stderr}${result.stdout}`.toLowerCase()).toMatch(/series|multiple/)
  })

  it('rejects empty input directory', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hp-dcm-empty-'))
    const empty = path.join(tempRoot, 'empty')
    await mkdir(empty)
    const outNrrd = path.join(tempRoot, 'out.nrrd')
    const result = runConverter(empty, outNrrd)
    expect(result.status).not.toBe(0)
  })
})
