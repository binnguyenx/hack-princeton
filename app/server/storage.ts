/**
 * Disk I/O layer for persistent project storage.
 *
 * Layout:
 *   data/storage/
 *     projects.json              # StorageIndex
 *     projects/{projectId}/
 *       manifest.json            # ProjectManifest
 *       volumes/{volumeId}.nrrd
 */

import { fileURLToPath } from 'url'
import path from 'node:path'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import type { ProjectSummary, Case, Sample, Candidate, CandidateRevision, SpatialMeta, Mat4 } from '../src/domain/types'
import type { ProjectManifest } from '../src/io/projectPackage'
import { IDENTITY_POSE } from '../src/domain/types'

// Resolve storage root relative to repo root (this file is app/server/storage.ts → repo is ../../)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..')
export const STORAGE = path.join(ROOT, 'data', 'storage')
const INDEX_FILE = path.join(STORAGE, 'projects.json')

export type StorageIndex = Record<string, ProjectSummary>

// ── Index ─────────────────────────────────────────────────────────────────────

export async function readIndex(): Promise<StorageIndex> {
  try {
    const raw = await readFile(INDEX_FILE, 'utf8')
    return JSON.parse(raw) as StorageIndex
  } catch {
    return {}
  }
}

export async function writeIndex(index: StorageIndex): Promise<void> {
  await mkdir(STORAGE, { recursive: true })
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2) + '\n')
}

// ── Manifest ──────────────────────────────────────────────────────────────────

function projectDir(projectId: string): string {
  return path.join(STORAGE, 'projects', projectId)
}

function volumeDir(projectId: string): string {
  return path.join(projectDir(projectId), 'volumes')
}

export async function readManifest(projectId: string): Promise<ProjectManifest> {
  const raw = await readFile(path.join(projectDir(projectId), 'manifest.json'), 'utf8')
  return JSON.parse(raw) as ProjectManifest
}

export async function writeManifest(projectId: string, manifest: ProjectManifest): Promise<void> {
  const dir = projectDir(projectId)
  await mkdir(path.join(dir, 'volumes'), { recursive: true })
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

export async function deleteProjectDir(projectId: string): Promise<void> {
  await rm(projectDir(projectId), { recursive: true, force: true })
}

// ── Volumes ───────────────────────────────────────────────────────────────────

export async function readVolume(projectId: string, volumeId: string): Promise<Buffer> {
  return readFile(path.join(volumeDir(projectId), `${volumeId}.nrrd`))
}

export async function writeVolume(projectId: string, volumeId: string, bytes: Buffer | Uint8Array): Promise<void> {
  await mkdir(volumeDir(projectId), { recursive: true })
  await writeFile(path.join(volumeDir(projectId), `${volumeId}.nrrd`), bytes)
}

export async function deleteVolume(projectId: string, volumeId: string): Promise<void> {
  await rm(path.join(volumeDir(projectId), `${volumeId}.nrrd`), { force: true })
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

/** Create a new blank project, persists index + manifest. Returns ProjectSummary. */
export async function createProject(name: string): Promise<ProjectSummary> {
  const projectId = crypto.randomUUID()
  const summary: ProjectSummary = { id: projectId, name, updatedAt: now(), caseCount: 0 }

  const manifest: ProjectManifest = {
    formatVersion: 1,
    user: { id: 'local', displayName: 'Local User' },
    project: { id: projectId, ownerUserId: 'local', name },
    cases: [],
    samples: [],
    candidates: [],
    revisions: [],
    viewState: {
      selectionObjectId: null,
      camera: { position: [0, 0, 500], target: [0, 0, 0] },
      visibility: {},
      inspectionPlane: { enabled: false, axis: 'z', offset: 0 },
    },
    openDocuments: [],
    activeDocumentId: null,
  }

  await writeManifest(projectId, manifest)
  const index = await readIndex()
  index[projectId] = summary
  await writeIndex(index)
  return summary
}

/** Add a case to the manifest. */
export async function addCase(projectId: string, name: string): Promise<Case> {
  const caseId = crypto.randomUUID()
  const newCase: Case = { id: caseId, projectId, name }
  const manifest = await readManifest(projectId)
  manifest.cases = [...manifest.cases, newCase]
  await writeManifest(projectId, manifest)

  // update caseCount in index
  const index = await readIndex()
  if (index[projectId]) {
    index[projectId].caseCount = manifest.cases.length
    index[projectId].updatedAt = now()
    await writeIndex(index)
  }
  return newCase
}

/** Remove a case (and its samples/candidates) from manifest. */
export async function removeCase(projectId: string, caseId: string): Promise<void> {
  const manifest = await readManifest(projectId)
  const samplesToRemove = manifest.samples.filter(s => s.caseId === caseId)
  const sampleIds = new Set(samplesToRemove.map(s => s.id))
  const candidatesToRemove = manifest.candidates.filter(c => sampleIds.has(c.sampleId))
  const candidateIds = new Set(candidatesToRemove.map(c => c.objectId))

  manifest.cases = manifest.cases.filter(c => c.id !== caseId)
  manifest.samples = manifest.samples.filter(s => s.caseId !== caseId)
  manifest.candidates = manifest.candidates.filter(c => !candidateIds.has(c.objectId))
  manifest.revisions = manifest.revisions.filter(r => !candidateIds.has(r.candidateId))

  // delete volumes
  for (const s of samplesToRemove) {
    await deleteVolume(projectId, s.sourceAnatomy.volumeId).catch(() => {})
  }

  await writeManifest(projectId, manifest)
}

export interface AddSampleArgs {
  projectId: string
  caseId: string
  displayName: string
  spatiallyVerified: boolean
  meta: SpatialMeta
  bytes: Buffer | Uint8Array
}

export async function addSample(args: AddSampleArgs): Promise<Sample> {
  const { projectId, caseId, displayName, spatiallyVerified, meta, bytes } = args
  const sampleId = crypto.randomUUID()
  const volumeId = crypto.randomUUID()
  const objectId = crypto.randomUUID()

  await writeVolume(projectId, volumeId, bytes)

  const sample: Sample = {
    id: sampleId,
    caseId,
    displayName,
    license: 'unknown',
    spatiallyVerified,
    sourceAnatomy: {
      objectId,
      sampleId,
      volumeId,
      spatial: meta,
      volumeHash: '',
    },
  }

  const manifest = await readManifest(projectId)
  manifest.samples = [...manifest.samples, sample]
  await writeManifest(projectId, manifest)

  // update index
  const index = await readIndex()
  if (index[projectId]) {
    index[projectId].updatedAt = now()
    await writeIndex(index)
  }

  return sample
}

/** Looks up which projectId owns this sampleId. */
async function findProjectForSample(sampleId: string): Promise<{ projectId: string; manifest: ProjectManifest } | null> {
  const index = await readIndex()
  for (const projectId of Object.keys(index)) {
    try {
      const manifest = await readManifest(projectId)
      if (manifest.samples.some(s => s.id === sampleId)) {
        return { projectId, manifest }
      }
    } catch { /* skip */ }
  }
  return null
}

/** Looks up which projectId owns this candidateId. */
async function findProjectForCandidate(candidateId: string): Promise<{ projectId: string; manifest: ProjectManifest } | null> {
  const index = await readIndex()
  for (const projectId of Object.keys(index)) {
    try {
      const manifest = await readManifest(projectId)
      if (manifest.candidates.some(c => c.objectId === candidateId)) {
        return { projectId, manifest }
      }
    } catch { /* skip */ }
  }
  return null
}

export async function createCandidate(sampleId: string): Promise<{ candidateId: string; revisionId: string }> {
  const found = await findProjectForSample(sampleId)
  if (!found) throw new Error(`Sample ${sampleId} not found`)
  const { projectId, manifest } = found

  const sample = manifest.samples.find(s => s.id === sampleId)!
  const candidateId = crypto.randomUUID()
  const revisionId = crypto.randomUUID()

  const candidate: Candidate = {
    objectId: candidateId,
    sampleId,
    currentRevisionId: revisionId,
  }

  const revision: CandidateRevision = {
    id: revisionId,
    candidateId,
    order: 0,
    volumeId: sample.sourceAnatomy.volumeId,
    pose: IDENTITY_POSE,
    volumeHash: sample.sourceAnatomy.volumeHash,
  }

  manifest.candidates = [...manifest.candidates, candidate]
  manifest.revisions = [...manifest.revisions, revision]
  await writeManifest(projectId, manifest)

  return { candidateId, revisionId }
}

export async function commitTransform(candidateId: string, pose: Mat4): Promise<string> {
  const found = await findProjectForCandidate(candidateId)
  if (!found) throw new Error(`Candidate ${candidateId} not found`)
  const { projectId, manifest } = found

  const candidate = manifest.candidates.find(c => c.objectId === candidateId)!
  const prevRevision = manifest.revisions.find(r => r.id === candidate.currentRevisionId)!
  const revisionId = crypto.randomUUID()
  const order = manifest.revisions.filter(r => r.candidateId === candidateId).length

  const newRevision: CandidateRevision = {
    id: revisionId,
    candidateId,
    order,
    volumeId: prevRevision.volumeId,
    pose,
    volumeHash: prevRevision.volumeHash,
  }

  candidate.currentRevisionId = revisionId
  manifest.revisions = [...manifest.revisions, newRevision]
  await writeManifest(projectId, manifest)
  return revisionId
}

export async function restoreRevision(candidateId: string, revisionId: string): Promise<void> {
  const found = await findProjectForCandidate(candidateId)
  if (!found) throw new Error(`Candidate ${candidateId} not found`)
  const { projectId, manifest } = found

  const candidate = manifest.candidates.find(c => c.objectId === candidateId)!
  const rev = manifest.revisions.find(r => r.id === revisionId && r.candidateId === candidateId)
  if (!rev) throw new Error(`Revision ${revisionId} not found for candidate ${candidateId}`)
  candidate.currentRevisionId = revisionId
  await writeManifest(projectId, manifest)
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  const found = await findProjectForCandidate(candidateId)
  if (!found) throw new Error(`Candidate ${candidateId} not found`)
  const { projectId, manifest } = found

  manifest.candidates = manifest.candidates.filter(c => c.objectId !== candidateId)
  manifest.revisions = manifest.revisions.filter(r => r.candidateId !== candidateId)
  await writeManifest(projectId, manifest)
}

export async function removeSample(projectId: string, caseId: string, sampleId: string): Promise<void> {
  const manifest = await readManifest(projectId)
  const sample = manifest.samples.find(s => s.id === sampleId && s.caseId === caseId)
  if (!sample) throw new Error(`Sample ${sampleId} not found`)

  const candidatesToRemove = manifest.candidates.filter(c => c.sampleId === sampleId)
  const candidateIds = new Set(candidatesToRemove.map(c => c.objectId))

  manifest.samples = manifest.samples.filter(s => s.id !== sampleId)
  manifest.candidates = manifest.candidates.filter(c => c.sampleId !== sampleId)
  manifest.revisions = manifest.revisions.filter(r => !candidateIds.has(r.candidateId))

  await deleteVolume(projectId, sample.sourceAnatomy.volumeId).catch(() => {})
  await writeManifest(projectId, manifest)
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteProjectDir(projectId)
  const index = await readIndex()
  delete index[projectId]
  await writeIndex(index)
}

/** Find which project a sample belongs to (for volume lookup by sampleId). */
export async function findSampleVolume(sampleId: string): Promise<{ projectId: string; volumeId: string } | null> {
  const index = await readIndex()
  for (const projectId of Object.keys(index)) {
    try {
      const manifest = await readManifest(projectId)
      const sample = manifest.samples.find(s => s.id === sampleId)
      if (sample) return { projectId, volumeId: sample.sourceAnatomy.volumeId }
    } catch { /* skip */ }
  }
  return null
}
