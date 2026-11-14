import { describe, expect, it } from 'vitest'
import type { ContractBackendFactory, RunningContractBackend } from './types'
import {
  IDENTITY_POSE,
  TEST_SPATIAL_META,
  TEST_VOLUME_BYTES,
  TRANSLATED_POSE,
  expectJsonError,
  postJson,
  rawSha256,
  readJson,
} from './fixtures'
import { ROUTE_CONTRACT_COVERAGE } from './coverage'

interface ProjectSummary {
  id: string
  name: string
  caseCount: number
  updatedAt: string
}

interface ContractManifest {
  formatVersion: number
  user: { id: string; displayName: string }
  project: { id: string; ownerUserId: string; name: string }
  cases: Array<{ id: string; projectId: string; name: string }>
  samples: Array<{
    id: string
    caseId: string
    displayName?: string
    license: string
    spatiallyVerified: boolean
    sourceAnatomy: {
      objectId: string
      sampleId: string
      volumeId: string
      spatial: unknown
      volumeHash: string
    }
  }>
  candidates: Array<{
    objectId: string
    sampleId: string
    displayName?: string
    currentRevisionId: string
  }>
  revisions: Array<{
    id: string
    candidateId: string
    order: number
    volumeId: string
    pose: unknown[]
    volumeHash: string
  }>
  viewState: unknown
  openDocuments?: unknown[]
  activeDocumentId?: string | null
}

interface FixtureIds {
  projectId: string
  caseId: string
}

async function withBackend(
  createBackend: ContractBackendFactory,
  assertion: (backend: RunningContractBackend) => Promise<void>,
): Promise<void> {
  const backend = await createBackend()
  try {
    await assertion(backend)
  } finally {
    await backend.close()
  }
}

async function createProject(baseUrl: string, name: string): Promise<string> {
  const response = await postJson(baseUrl, '/api/projects', { name })
  expect(response.status).toBe(201)
  return (await readJson<{ projectId: string }>(response)).projectId
}

async function createCase(baseUrl: string, projectId: string, name: string): Promise<string> {
  const response = await postJson(baseUrl, `/api/projects/${projectId}/cases`, { name })
  expect(response.status).toBe(201)
  return (await readJson<{ caseId: string }>(response)).caseId
}

async function createProjectCase(baseUrl: string, suffix = ''): Promise<FixtureIds> {
  const projectId = await createProject(baseUrl, `Contract project${suffix}`)
  const caseId = await createCase(baseUrl, projectId, `Contract case${suffix}`)
  return { projectId, caseId }
}

async function uploadSample(
  baseUrl: string,
  ids: FixtureIds,
  options: {
    bytes?: Buffer
    filename?: string
    displayName?: string
    spatiallyVerified?: string
    meta?: unknown
    omitMeta?: boolean
  } = {},
): Promise<{ response: Response; sampleId?: string; spatiallyVerified?: boolean }> {
  const form = new FormData()
  form.set(
    'file',
    new Blob([options.bytes ?? TEST_VOLUME_BYTES]),
    options.filename ?? 'synthetic-contract-test.nrrd',
  )
  if (options.displayName !== undefined) form.set('displayName', options.displayName)
  if (options.spatiallyVerified !== undefined) {
    form.set('spatiallyVerified', options.spatiallyVerified)
  }
  if (!options.omitMeta) form.set('meta', JSON.stringify(options.meta ?? TEST_SPATIAL_META))
  const response = await fetch(
    `${baseUrl}/api/projects/${ids.projectId}/cases/${ids.caseId}/samples`,
    { method: 'POST', body: form },
  )
  if (response.status !== 201) return { response }
  const body = await readJson<{ sampleId: string; spatiallyVerified: boolean }>(response)
  return { response, ...body }
}

async function getManifest(baseUrl: string, projectId: string): Promise<ContractManifest> {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}`)
  expect(response.status).toBe(200)
  return readJson<ContractManifest>(response)
}

async function createVerifiedSample(
  baseUrl: string,
  suffix = '',
): Promise<FixtureIds & { sampleId: string }> {
  const ids = await createProjectCase(baseUrl, suffix)
  const upload = await uploadSample(baseUrl, ids, {
    displayName: `Verified sample${suffix}`,
    spatiallyVerified: 'true',
  })
  expect(upload.response.status).toBe(201)
  expect(upload.sampleId).toEqual(expect.any(String))
  return { ...ids, sampleId: upload.sampleId! }
}

async function createCandidate(
  baseUrl: string,
  sampleId: string,
): Promise<{ candidateId: string; revisionId: string }> {
  const response = await postJson(baseUrl, `/api/samples/${sampleId}/candidates`, {})
  expect(response.status).toBe(201)
  return readJson<{ candidateId: string; revisionId: string }>(response)
}

export function registerBackendContractScenarios(
  backendName: string,
  createBackend: ContractBackendFactory,
): void {
  describe(`${backendName} HTTP compatibility contract`, () => {
    it('maps exactly 13 public method/path pairs to requirements and scenarios', () => {
      expect(ROUTE_CONTRACT_COVERAGE).toHaveLength(13)
      expect(
        new Set(ROUTE_CONTRACT_COVERAGE.map(({ method, path }) => `${method} ${path}`)).size,
      ).toBe(13)
      for (const route of ROUTE_CONTRACT_COVERAGE) {
        expect(route.requirements.length).toBeGreaterThan(0)
        expect(route.scenarios.length).toBeGreaterThan(0)
      }
    })

    it('creates, lists, orders, and fetches projects with stable identity links', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const initiallyEmpty = await fetch(`${baseUrl}/api/projects`)
        expect(initiallyEmpty.status).toBe(200)
        expect(await readJson<ProjectSummary[]>(initiallyEmpty)).toEqual([])

        const firstId = await createProject(baseUrl, 'First project')
        const secondId = await createProject(baseUrl, 'Second project')
        const firstCaseId = await createCase(baseUrl, firstId, 'First case')

        const listed = await fetch(`${baseUrl}/api/projects`)
        expect(listed.status).toBe(200)
        const projects = await readJson<ProjectSummary[]>(listed)
        expect(projects).toHaveLength(2)
        expect(new Set(projects.map(({ id }) => id))).toEqual(new Set([firstId, secondId]))
        expect(projects.find(({ id }) => id === firstId)).toMatchObject({
          name: 'First project',
          caseCount: 1,
        })
        expect(projects.find(({ id }) => id === secondId)).toMatchObject({
          name: 'Second project',
          caseCount: 0,
        })
        expect(
          projects.every(({ updatedAt }) => !Number.isNaN(Date.parse(updatedAt))),
        ).toBe(true)
        expect(
          projects.every(
            (project, index) =>
              index === 0 ||
              Date.parse(projects[index - 1].updatedAt) >= Date.parse(project.updatedAt),
          ),
        ).toBe(true)

        const manifest = await getManifest(baseUrl, firstId)
        expect(Object.keys(manifest).sort()).toEqual([
          'activeDocumentId',
          'candidates',
          'cases',
          'formatVersion',
          'openDocuments',
          'project',
          'revisions',
          'samples',
          'user',
          'viewState',
        ])
        expect(manifest).toMatchObject({
          formatVersion: 1,
          user: { id: 'local-dev', displayName: 'Local Dev' },
          project: { id: firstId, ownerUserId: 'local-dev', name: 'First project' },
          cases: [{ id: firstCaseId, projectId: firstId, name: 'First case' }],
          samples: [],
          candidates: [],
          revisions: [],
          openDocuments: [],
          activeDocumentId: null,
        })
      })
    })

    it('characterizes JSON validation, malformed input, and the 10 MB parser limit', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        await expectJsonError(
          await postJson(baseUrl, '/api/projects', { name: '' }),
          400,
          /Project name is required/,
        )
        await expectJsonError(
          await postJson(baseUrl, '/api/projects', { name: 42 }),
          500,
        )
        await expectJsonError(
          await fetch(`${baseUrl}/api/projects`, { method: 'POST' }),
          500,
        )

        const malformed = await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"name":',
        })
        expect(malformed.status).toBe(400)
        expect(malformed.headers.get('content-type')).toContain('text/html')
        expect((await malformed.text()).length).toBeGreaterThan(0)

        const tooLarge = await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'x'.repeat(10 * 1024 * 1024 + 1) }),
        })
        expect(tooLarge.status).toBe(413)
        expect(tooLarge.headers.get('content-type')).toContain('text/html')

        const listed = await fetch(`${baseUrl}/api/projects`)
        expect(await readJson<ProjectSummary[]>(listed)).toEqual([])
      })
    })

    it('returns public missing-resource and case validation errors', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        await expectJsonError(
          await fetch(`${baseUrl}/api/projects/missing-project`),
          404,
          /Project missing-project not found/,
        )
        await expectJsonError(
          await postJson(baseUrl, '/api/projects/missing-project/cases', { name: 'Case' }),
          404,
        )
        const projectId = await createProject(baseUrl, 'Validation project')
        await expectJsonError(
          await postJson(baseUrl, `/api/projects/${projectId}/cases`, { name: '' }),
          400,
        )
        await expectJsonError(
          await fetch(`${baseUrl}/api/projects/${projectId}/cases`, { method: 'POST' }),
          500,
        )
        expect((await getManifest(baseUrl, projectId)).cases).toEqual([])
      })
    })

    it('preserves multipart names, metadata, filename fallback, boolean encoding, bytes, and hash', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const ids = await createProjectCase(baseUrl)
        const uploaded = await uploadSample(baseUrl, ids, {
          filename: 'fallback-name.nrrd',
          displayName: '',
          spatiallyVerified: 'true',
        })
        expect(uploaded.response.status).toBe(201)
        expect(uploaded.spatiallyVerified).toBe(true)

        const manifest = await getManifest(baseUrl, ids.projectId)
        const sample = manifest.samples[0]
        expect(sample).toEqual({
          id: uploaded.sampleId,
          caseId: ids.caseId,
          displayName: 'fallback-name.nrrd',
          license: 'unknown',
          spatiallyVerified: true,
          sourceAnatomy: {
            objectId: expect.any(String),
            sampleId: uploaded.sampleId,
            volumeId: expect.any(String),
            spatial: TEST_SPATIAL_META,
            volumeHash: rawSha256(TEST_VOLUME_BYTES),
          },
        })
        expect(sample.sourceAnatomy.volumeHash).toMatch(/^[0-9a-f]{64}$/)

        const download = await fetch(`${baseUrl}/api/samples/${uploaded.sampleId}/volume`)
        expect(download.status).toBe(200)
        expect(download.headers.get('content-type')).toContain('application/octet-stream')
        expect(Buffer.from(await download.arrayBuffer())).toEqual(TEST_VOLUME_BYTES)

        const uppercase = await uploadSample(baseUrl, ids, {
          filename: 'uppercase.nrrd',
          spatiallyVerified: 'TRUE',
          omitMeta: true,
        })
        expect(uppercase.response.status).toBe(201)
        expect(uppercase.spatiallyVerified).toBe(false)
        const updated = await getManifest(baseUrl, ids.projectId)
        const uppercaseSample = updated.samples.find(({ id }) => id === uppercase.sampleId)
        expect(uppercaseSample).toMatchObject({
          displayName: 'uppercase.nrrd',
          spatiallyVerified: false,
          sourceAnatomy: { spatial: {} },
        })
      })
    })

    it('characterizes missing and malformed multipart input without side effects', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const ids = await createProjectCase(baseUrl)
        const noFile = new FormData()
        noFile.set('meta', JSON.stringify(TEST_SPATIAL_META))
        await expectJsonError(
          await fetch(
            `${baseUrl}/api/projects/${ids.projectId}/cases/${ids.caseId}/samples`,
            { method: 'POST', body: noFile },
          ),
          400,
          /file is required/,
        )

        const malformed = new FormData()
        malformed.set('file', new Blob([TEST_VOLUME_BYTES]), 'bad-meta.nrrd')
        malformed.set('meta', '{')
        await expectJsonError(
          await fetch(
            `${baseUrl}/api/projects/${ids.projectId}/cases/${ids.caseId}/samples`,
            { method: 'POST', body: malformed },
          ),
          500,
        )

        const other = await createProjectCase(baseUrl, ' other')
        const wrongOwner = await uploadSample(
          baseUrl,
          { projectId: other.projectId, caseId: ids.caseId },
          { spatiallyVerified: 'true' },
        )
        await expectJsonError(wrongOwner.response, 404, /Case .* not found/)
        expect((await getManifest(baseUrl, ids.projectId)).samples).toEqual([])
        expect((await getManifest(baseUrl, other.projectId)).samples).toEqual([])
      })
    })

    it('rejects candidates for missing or unverified samples', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        await expectJsonError(
          await postJson(baseUrl, '/api/samples/missing-sample/candidates', {}),
          404,
        )
        const ids = await createProjectCase(baseUrl)
        const upload = await uploadSample(baseUrl, ids, { spatiallyVerified: 'false' })
        await expectJsonError(
          await postJson(baseUrl, `/api/samples/${upload.sampleId}/candidates`, {}),
          409,
          /not spatially verified/,
        )
        const manifest = await getManifest(baseUrl, ids.projectId)
        expect(manifest.candidates).toEqual([])
        expect(manifest.revisions).toEqual([])
      })
    })

    it('creates the initial candidate revision with shared volume identity and omitted optional name', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const fixture = await createVerifiedSample(baseUrl)
        const created = await createCandidate(baseUrl, fixture.sampleId)
        const manifest = await getManifest(baseUrl, fixture.projectId)
        const sample = manifest.samples[0]
        expect(manifest.candidates).toEqual([
          {
            objectId: created.candidateId,
            sampleId: fixture.sampleId,
            currentRevisionId: created.revisionId,
          },
        ])
        expect('displayName' in manifest.candidates[0]).toBe(false)
        expect(manifest.revisions).toEqual([
          {
            id: created.revisionId,
            candidateId: created.candidateId,
            order: 0,
            volumeId: sample.sourceAnatomy.volumeId,
            pose: IDENTITY_POSE,
            volumeHash: sample.sourceAnatomy.volumeHash,
          },
        ])
      })
    })

    it('appends transforms, restores an older revision, and appends after the maximum order', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const fixture = await createVerifiedSample(baseUrl)
        const initial = await createCandidate(baseUrl, fixture.sampleId)

        const transformed = await postJson(
          baseUrl,
          `/api/candidates/${initial.candidateId}/transform`,
          { pose: TRANSLATED_POSE },
        )
        expect(transformed.status).toBe(201)
        const revision1 = (await readJson<{ revisionId: string }>(transformed)).revisionId

        const restored = await postJson(
          baseUrl,
          `/api/candidates/${initial.candidateId}/restore`,
          { revisionId: initial.revisionId },
        )
        expect(restored.status).toBe(200)
        expect(await readJson<{ ok: boolean }>(restored)).toEqual({ ok: true })
        let manifest = await getManifest(baseUrl, fixture.projectId)
        expect(manifest.candidates[0].currentRevisionId).toBe(initial.revisionId)
        expect(manifest.revisions.map(({ id, order, pose }) => ({ id, order, pose }))).toEqual([
          { id: initial.revisionId, order: 0, pose: IDENTITY_POSE },
          { id: revision1, order: 1, pose: TRANSLATED_POSE },
        ])

        const pose2 = [...IDENTITY_POSE]
        pose2[3] = 99
        const afterRestore = await postJson(
          baseUrl,
          `/api/candidates/${initial.candidateId}/transform`,
          { pose: pose2 },
        )
        expect(afterRestore.status).toBe(201)
        const revision2 = (await readJson<{ revisionId: string }>(afterRestore)).revisionId
        manifest = await getManifest(baseUrl, fixture.projectId)
        expect(manifest.candidates[0].currentRevisionId).toBe(revision2)
        expect(manifest.revisions.map(({ id, order }) => ({ id, order }))).toEqual([
          { id: initial.revisionId, order: 0 },
          { id: revision1, order: 1 },
          { id: revision2, order: 2 },
        ])
      })
    })

    it('characterizes invalid pose handling and currently accepted invalid elements', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const fixture = await createVerifiedSample(baseUrl)
        const candidate = await createCandidate(baseUrl, fixture.sampleId)
        await expectJsonError(
          await postJson(baseUrl, `/api/candidates/${candidate.candidateId}/transform`, {
            pose: IDENTITY_POSE.slice(0, 15),
          }),
          400,
          /pose must have 16 numbers/,
        )
        await expectJsonError(
          await postJson(baseUrl, '/api/candidates/missing-candidate/transform', {
            pose: IDENTITY_POSE,
          }),
          404,
        )

        const invalidElements: unknown[] = [...IDENTITY_POSE]
        invalidElements[5] = 'not-a-number'
        invalidElements[10] = null
        const accepted = await postJson(
          baseUrl,
          `/api/candidates/${candidate.candidateId}/transform`,
          { pose: invalidElements },
        )
        expect(accepted.status).toBe(201)
        const acceptedId = (await readJson<{ revisionId: string }>(accepted)).revisionId
        const manifest = await getManifest(baseUrl, fixture.projectId)
        expect(manifest.revisions.find(({ id }) => id === acceptedId)?.pose).toEqual(
          invalidElements,
        )
      })
    })

    it('rejects missing and cross-candidate restore references without mutation', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const fixture = await createVerifiedSample(baseUrl)
        const first = await createCandidate(baseUrl, fixture.sampleId)
        const second = await createCandidate(baseUrl, fixture.sampleId)
        await expectJsonError(
          await postJson(baseUrl, `/api/candidates/${first.candidateId}/restore`, {}),
          400,
        )
        await expectJsonError(
          await postJson(baseUrl, `/api/candidates/${first.candidateId}/restore`, {
            revisionId: 'missing-revision',
          }),
          404,
        )
        await expectJsonError(
          await postJson(baseUrl, `/api/candidates/${first.candidateId}/restore`, {
            revisionId: second.revisionId,
          }),
          404,
        )
        const manifest = await getManifest(baseUrl, fixture.projectId)
        expect(
          manifest.candidates.find(({ objectId }) => objectId === first.candidateId)
            ?.currentRevisionId,
        ).toBe(first.revisionId)
        expect(manifest.revisions).toHaveLength(2)
      })
    })

    it('deletes candidates while preserving the sample and its downloadable volume', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const fixture = await createVerifiedSample(baseUrl)
        const candidate = await createCandidate(baseUrl, fixture.sampleId)
        const deleted = await fetch(`${baseUrl}/api/candidates/${candidate.candidateId}`, {
          method: 'DELETE',
        })
        expect(deleted.status).toBe(204)
        expect(await deleted.text()).toBe('')
        await expectJsonError(
          await fetch(`${baseUrl}/api/candidates/${candidate.candidateId}`, {
            method: 'DELETE',
          }),
          404,
        )
        const manifest = await getManifest(baseUrl, fixture.projectId)
        expect(manifest.samples).toHaveLength(1)
        expect(manifest.candidates).toEqual([])
        expect(manifest.revisions).toEqual([])
        const volume = await fetch(`${baseUrl}/api/samples/${fixture.sampleId}/volume`)
        expect(Buffer.from(await volume.arrayBuffer())).toEqual(TEST_VOLUME_BYTES)
      })
    })

    it('deletes samples and publicly exposes the cascade', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const fixture = await createVerifiedSample(baseUrl)
        const candidate = await createCandidate(baseUrl, fixture.sampleId)
        const deleted = await fetch(`${baseUrl}/api/samples/${fixture.sampleId}`, {
          method: 'DELETE',
        })
        expect(deleted.status).toBe(204)
        expect(await deleted.text()).toBe('')
        await expectJsonError(
          await fetch(`${baseUrl}/api/samples/${fixture.sampleId}/volume`),
          404,
        )
        await expectJsonError(
          await fetch(`${baseUrl}/api/samples/${fixture.sampleId}`, { method: 'DELETE' }),
          404,
        )
        await expectJsonError(
          await fetch(`${baseUrl}/api/candidates/${candidate.candidateId}`, {
            method: 'DELETE',
          }),
          404,
        )
        const manifest = await getManifest(baseUrl, fixture.projectId)
        expect(manifest.samples).toEqual([])
        expect(manifest.candidates).toEqual([])
        expect(manifest.revisions).toEqual([])
      })
    })

    it('deletes cases and projects with observable cascades and characterizes missing deletes', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const caseFixture = await createVerifiedSample(baseUrl, ' case cascade')
        expect(
          (
            await fetch(
              `${baseUrl}/api/projects/${caseFixture.projectId}/cases/${caseFixture.caseId}`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(204)
        expect((await getManifest(baseUrl, caseFixture.projectId)).cases).toEqual([])
        await expectJsonError(
          await fetch(`${baseUrl}/api/samples/${caseFixture.sampleId}/volume`),
          404,
        )
        expect(
          (
            await fetch(
              `${baseUrl}/api/projects/${caseFixture.projectId}/cases/missing-case`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(204)

        const projectFixture = await createVerifiedSample(baseUrl, ' project cascade')
        const deletedProject = await fetch(
          `${baseUrl}/api/projects/${projectFixture.projectId}`,
          { method: 'DELETE' },
        )
        expect(deletedProject.status).toBe(204)
        expect(await deletedProject.text()).toBe('')
        await expectJsonError(
          await fetch(`${baseUrl}/api/projects/${projectFixture.projectId}`),
          404,
        )
        await expectJsonError(
          await fetch(`${baseUrl}/api/samples/${projectFixture.sampleId}/volume`),
          404,
        )
        expect(
          (
            await fetch(`${baseUrl}/api/projects/missing-project`, { method: 'DELETE' })
          ).status,
        ).toBe(204)
      })
    })

    it('characterizes cross-project case deletion with and without volume references', async () => {
      await withBackend(createBackend, async ({ baseUrl }) => {
        const owner = await createProjectCase(baseUrl, ' owner')
        const wrongProjectId = await createProject(baseUrl, 'Wrong owner')
        const emptyMismatch = await fetch(
          `${baseUrl}/api/projects/${wrongProjectId}/cases/${owner.caseId}`,
          { method: 'DELETE' },
        )
        expect(emptyMismatch.status).toBe(204)
        expect((await getManifest(baseUrl, owner.projectId)).cases).toHaveLength(1)

        const upload = await uploadSample(baseUrl, owner, { spatiallyVerified: 'true' })
        const populatedMismatch = await fetch(
          `${baseUrl}/api/projects/${wrongProjectId}/cases/${owner.caseId}`,
          { method: 'DELETE' },
        )
        await expectJsonError(populatedMismatch, 500)
        const ownerManifest = await getManifest(baseUrl, owner.projectId)
        expect(ownerManifest.cases).toHaveLength(1)
        expect(ownerManifest.samples.map(({ id }) => id)).toContain(upload.sampleId)
        const volume = await fetch(`${baseUrl}/api/samples/${upload.sampleId}/volume`)
        expect(Buffer.from(await volume.arrayBuffer())).toEqual(TEST_VOLUME_BYTES)
      })
    })

    it('persists relationships, pointers, hashes, bytes, and subsequent writes across restart', async () => {
      await withBackend(createBackend, async (backend) => {
        const fixture = await createVerifiedSample(backend.baseUrl, ' restart')
        const candidate = await createCandidate(backend.baseUrl, fixture.sampleId)
        const transformed = await postJson(
          backend.baseUrl,
          `/api/candidates/${candidate.candidateId}/transform`,
          { pose: TRANSLATED_POSE },
        )
        const transformedId = (
          await readJson<{ revisionId: string }>(transformed)
        ).revisionId
        const before = await getManifest(backend.baseUrl, fixture.projectId)

        await backend.restart()

        const after = await getManifest(backend.baseUrl, fixture.projectId)
        expect(after).toEqual(before)
        expect(after.candidates[0].currentRevisionId).toBe(transformedId)
        expect(after.revisions.map(({ order }) => order)).toEqual([0, 1])
        const volume = await fetch(`${backend.baseUrl}/api/samples/${fixture.sampleId}/volume`)
        expect(Buffer.from(await volume.arrayBuffer())).toEqual(TEST_VOLUME_BYTES)
        const additionalCaseId = await createCase(
          backend.baseUrl,
          fixture.projectId,
          'After restart',
        )
        expect((await getManifest(backend.baseUrl, fixture.projectId)).cases).toContainEqual({
          id: additionalCaseId,
          projectId: fixture.projectId,
          name: 'After restart',
        })
      })
    })
  })
}
