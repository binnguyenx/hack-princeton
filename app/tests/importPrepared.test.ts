import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createCase,
  createProject,
  importPreparedSample,
  openDocument,
  readState,
} from '../src/ops'
import type { SampleMetadata } from '../src/ops/importPrepared'
import { freshCtx, sample0 } from './helpers'

describe('prepared sample import (data/samples)', () => {
  it('imports defective_skull.nrrd + metadata into a case and opens as a tab', async () => {
    const ctx = freshCtx()
    expect(createProject(ctx, { name: 'Import' }).ok).toBe(true)
    const c = createCase(ctx, { name: 'C1' })
    expect(c.ok).toBe(true)
    if (!c.ok) return

    const meta = JSON.parse(
      await readFile(path.join(sample0, 'metadata.json'), 'utf8'),
    ) as SampleMetadata
    const bytes = new Uint8Array(
      await readFile(path.join(sample0, meta.primaryVolume)),
    )
    const r = await importPreparedSample(ctx, {
      caseId: c.value.caseId,
      sampleId: meta.sampleId,
      displayName: meta.sampleId,
      bytes,
      meta,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.spatiallyVerified).toBe(true)
    expect(openDocument(ctx, { kind: 'sample', id: r.value.sampleId }).ok).toBe(
      true,
    )
    const st = readState(ctx)
    expect(st.value?.samples[0]?.sourceSampleDir).toBeUndefined()
    expect(st.value?.activeDocumentId).toBe(meta.sampleId)
  })
})
