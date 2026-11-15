import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import type {
  Case,
  Mat4,
  ProjectSummary,
  Sample,
  SpatialMeta,
} from '../src/domain/types'
import type { ProjectManifest } from '../src/io/projectPackage'
import { IDENTITY_POSE } from '../src/domain/types'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..')
let storageRoot = process.env.HACK_STORAGE_ROOT || path.join(ROOT, 'data', 'storage')

export interface StorageFaults {
  failAfterVolumeWrite?: boolean
  failBeforeSampleDelete?: boolean
}

let faults: StorageFaults = {}

export function setStorageRootForTests(root: string): void {
  storageRoot = root
}

export function setStorageFaultsForTests(next: StorageFaults): void {
  faults = { ...next }
}

function dbPath(): string {
  return path.join(storageRoot, 'app-model.sqlite')
}

function volumesRoot(): string {
  return path.join(storageRoot, 'volumes')
}

function now(): string {
  return new Date().toISOString()
}

function sha(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function toPoseJson(pose: Mat4): string {
  return JSON.stringify(Array.from(pose))
}

function emptyViewState() {
  return {
    selectionObjectId: null,
    camera: {
      position: [0, 0, 500] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
    },
    visibility: {} as Record<string, boolean>,
    inspectionPlane: { enabled: false, axis: 'z' as const, offset: 0 },
  }
}

async function ensureRoots(): Promise<void> {
  await mkdir(storageRoot, { recursive: true })
  await mkdir(volumesRoot(), { recursive: true })
}

function initDb(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      case_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS volume_assets (
      id TEXT PRIMARY KEY,
      rel_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS samples (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      display_name TEXT,
      license TEXT NOT NULL,
      spatially_verified INTEGER NOT NULL,
      source_object_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      spatial_json TEXT NOT NULL,
      volume_hash TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES volume_assets(id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      sample_id TEXT NOT NULL,
      display_name TEXT,
      current_revision_id TEXT NOT NULL,
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS candidate_revisions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      ord INTEGER NOT NULL,
      volume_id TEXT NOT NULL,
      pose_json TEXT NOT NULL,
      volume_hash TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
      FOREIGN KEY (volume_id) REFERENCES volume_assets(id)
    );
  `)
  db.prepare('INSERT OR IGNORE INTO users(id, display_name) VALUES(?, ?)').run('local-dev', 'Local Dev')
}

async function withDb<T>(run: (db: DatabaseSync) => T): Promise<T> {
  await ensureRoots()
  const db = new DatabaseSync(dbPath())
  try {
    initDb(db)
    return run(db)
  } finally {
    db.close()
  }
}

function readProjectOrThrow(db: DatabaseSync, projectId: string) {
  const row = db
    .prepare('SELECT id, owner_user_id, name, updated_at, case_count FROM projects WHERE id = ?')
    .get(projectId) as
    | { id: string; owner_user_id: string; name: string; updated_at: string; case_count: number }
    | undefined
  if (!row) throw new Error(`Project ${projectId} not found`)
  return row
}

function projectManifest(db: DatabaseSync, projectId: string): ProjectManifest {
  const p = readProjectOrThrow(db, projectId)
  const cases = db
    .prepare('SELECT id, project_id, name FROM cases WHERE project_id = ? ORDER BY id')
    .all(projectId) as Array<{ id: string; project_id: string; name: string }>
  const samples = db
    .prepare(`
      SELECT s.id, s.case_id, s.display_name, s.license, s.spatially_verified,
             s.source_object_id, s.volume_id, s.spatial_json, s.volume_hash
      FROM samples s
      JOIN cases c ON c.id = s.case_id
      WHERE c.project_id = ?
      ORDER BY s.id
    `)
    .all(projectId) as Array<{
      id: string
      case_id: string
      display_name: string | null
      license: string
      spatially_verified: number
      source_object_id: string
      volume_id: string
      spatial_json: string
      volume_hash: string
    }>
  const candidates = db
    .prepare(`
      SELECT c.id, c.sample_id, c.display_name, c.current_revision_id
      FROM candidates c
      JOIN samples s ON s.id = c.sample_id
      JOIN cases k ON k.id = s.case_id
      WHERE k.project_id = ?
      ORDER BY c.id
    `)
    .all(projectId) as Array<{
      id: string
      sample_id: string
      display_name: string | null
      current_revision_id: string
    }>
  const revisions = db
    .prepare(`
      SELECT r.id, r.candidate_id, r.ord, r.volume_id, r.pose_json, r.volume_hash
      FROM candidate_revisions r
      JOIN candidates c ON c.id = r.candidate_id
      JOIN samples s ON s.id = c.sample_id
      JOIN cases k ON k.id = s.case_id
      WHERE k.project_id = ?
      ORDER BY r.candidate_id, r.ord
    `)
    .all(projectId) as Array<{
      id: string
      candidate_id: string
      ord: number
      volume_id: string
      pose_json: string
      volume_hash: string
    }>

  return {
    formatVersion: 1,
    user: { id: 'local-dev', displayName: 'Local Dev' },
    project: { id: p.id, ownerUserId: p.owner_user_id, name: p.name },
    cases: cases.map((c) => ({ id: c.id, projectId: c.project_id, name: c.name })),
    samples: samples.map((s) => ({
      id: s.id,
      caseId: s.case_id,
      displayName: s.display_name ?? undefined,
      license: s.license,
      spatiallyVerified: s.spatially_verified === 1,
      sourceAnatomy: {
        objectId: s.source_object_id,
        sampleId: s.id,
        volumeId: s.volume_id,
        spatial: JSON.parse(s.spatial_json) as SpatialMeta,
        volumeHash: s.volume_hash,
      },
    })),
    candidates: candidates.map((c) => ({
      objectId: c.id,
      sampleId: c.sample_id,
      displayName: c.display_name ?? undefined,
      currentRevisionId: c.current_revision_id,
    })),
    revisions: revisions.map((r) => ({
      id: r.id,
      candidateId: r.candidate_id,
      order: r.ord,
      volumeId: r.volume_id,
      pose: JSON.parse(r.pose_json) as Mat4,
      volumeHash: r.volume_hash,
    })),
    viewState: emptyViewState(),
    openDocuments: [],
    activeDocumentId: null,
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return withDb((db) => {
    const rows = db
      .prepare('SELECT id, name, updated_at, case_count FROM projects ORDER BY updated_at DESC')
      .all() as Array<{ id: string; name: string; updated_at: string; case_count: number }>
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updated_at,
      caseCount: r.case_count,
    }))
  })
}

export async function createProject(name: string): Promise<ProjectSummary> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Project name is required')
  return withDb((db) => {
    const id = randomUUID()
    const updatedAt = now()
    db.prepare(
      'INSERT INTO projects(id, owner_user_id, name, updated_at, case_count) VALUES(?, ?, ?, ?, 0)',
    ).run(id, 'local-dev', trimmed, updatedAt)
    return { id, name: trimmed, updatedAt, caseCount: 0 }
  })
}

export async function getProjectManifest(projectId: string): Promise<ProjectManifest> {
  return withDb((db) => projectManifest(db, projectId))
}

export async function addCase(projectId: string, name: string): Promise<Case> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Case name is required')
  return withDb((db) => {
    readProjectOrThrow(db, projectId)
    const id = randomUUID()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO cases(id, project_id, name) VALUES(?, ?, ?)').run(id, projectId, trimmed)
      const countRow = db
        .prepare('SELECT COUNT(*) AS n FROM cases WHERE project_id = ?')
        .get(projectId) as { n: number }
      db.prepare('UPDATE projects SET case_count = ?, updated_at = ? WHERE id = ?').run(
        countRow.n,
        now(),
        projectId,
      )
      db.exec('COMMIT')
      return { id, projectId, name: trimmed }
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })
}

export interface AddSampleArgs {
  projectId: string
  caseId: string
  displayName: string
  spatiallyVerified: boolean
  meta: SpatialMeta
  bytes: Buffer | Uint8Array
  /** Defaults to curated-era `unknown` so existing callers stay unchanged. */
  license?: string
}

export async function addSample(args: AddSampleArgs): Promise<Sample> {
  const { projectId, caseId, displayName, spatiallyVerified, meta, bytes } = args
  const license = args.license?.trim() || 'unknown'
  await ensureRoots()
  const db = new DatabaseSync(dbPath())
  try {
    initDb(db)
    readProjectOrThrow(db, projectId)
    const caseRow = db
      .prepare('SELECT id FROM cases WHERE id = ? AND project_id = ?')
      .get(caseId, projectId) as { id: string } | undefined
    if (!caseRow) throw new Error(`Case ${caseId} not found`)

    const sampleId = randomUUID()
    const volumeId = randomUUID()
    const sourceObjectId = randomUUID()
    const relPath = path.join('volumes', `${volumeId}.nrrd`)
    const absPath = path.join(storageRoot, relPath)
    const hash = sha(bytes)
    const label = displayName.trim() || sampleId

    let wroteFile = false
    try {
      await writeFile(absPath, bytes)
      wroteFile = true
      if (faults.failAfterVolumeWrite) throw new Error('injected fault: failAfterVolumeWrite')

      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare(
          'INSERT INTO volume_assets(id, rel_path, sha256, byte_size) VALUES(?, ?, ?, ?)',
        ).run(volumeId, relPath, hash, bytes.length)
        db.prepare(`
          INSERT INTO samples(
            id, case_id, display_name, license, spatially_verified,
            source_object_id, volume_id, spatial_json, volume_hash
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sampleId,
          caseId,
          label,
          license,
          spatiallyVerified ? 1 : 0,
          sourceObjectId,
          volumeId,
          JSON.stringify(meta),
          hash,
        )
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }

      return {
        id: sampleId,
        caseId,
        displayName: label,
        license,
        spatiallyVerified,
        sourceAnatomy: {
          objectId: sourceObjectId,
          sampleId,
          volumeId,
          spatial: meta,
          volumeHash: hash,
        },
      } satisfies Sample
    } catch (err) {
      if (wroteFile) await rm(absPath, { force: true }).catch(() => {})
      throw err
    }
  } finally {
    db.close()
  }
}

export async function findSampleVolume(
  sampleId: string,
): Promise<{ projectId: string; volumeId: string } | null> {
  return withDb((db) => {
    const row = db
      .prepare(`
        SELECT p.id AS project_id, s.volume_id
        FROM samples s
        JOIN cases c ON c.id = s.case_id
        JOIN projects p ON p.id = c.project_id
        WHERE s.id = ?
      `)
      .get(sampleId) as { project_id: string; volume_id: string } | undefined
    if (!row) return null
    return { projectId: row.project_id, volumeId: row.volume_id }
  })
}

export async function findSampleContext(
  sampleId: string,
): Promise<{ projectId: string; caseId: string; volumeId: string } | null> {
  return withDb((db) => {
    const row = db
      .prepare(`
        SELECT c.project_id, s.case_id, s.volume_id
        FROM samples s
        JOIN cases c ON c.id = s.case_id
        WHERE s.id = ?
      `)
      .get(sampleId) as { project_id: string; case_id: string; volume_id: string } | undefined
    if (!row) return null
    return { projectId: row.project_id, caseId: row.case_id, volumeId: row.volume_id }
  })
}

export async function readVolume(_projectId: string, volumeId: string): Promise<Buffer> {
  return readFile(path.join(volumesRoot(), `${volumeId}.nrrd`))
}

export async function createCandidate(
  sampleId: string,
): Promise<{ candidateId: string; revisionId: string }> {
  return withDb((db) => {
    const sample = db
      .prepare('SELECT volume_id, volume_hash, spatially_verified FROM samples WHERE id = ?')
      .get(sampleId) as
      | { volume_id: string; volume_hash: string; spatially_verified: number }
      | undefined
    if (!sample) throw new Error(`Sample ${sampleId} not found`)
    if (sample.spatially_verified !== 1) throw new Error('Sample is not spatially verified')
    const candidateId = randomUUID()
    const revisionId = randomUUID()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        'INSERT INTO candidates(id, sample_id, display_name, current_revision_id) VALUES(?, ?, ?, ?)',
      ).run(candidateId, sampleId, null, revisionId)
      db.prepare(`
        INSERT INTO candidate_revisions(id, candidate_id, ord, volume_id, pose_json, volume_hash)
        VALUES(?, ?, 0, ?, ?, ?)
      `).run(revisionId, candidateId, sample.volume_id, JSON.stringify(IDENTITY_POSE), sample.volume_hash)
      db.exec('COMMIT')
      return { candidateId, revisionId }
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })
}

export async function commitTransform(candidateId: string, pose: Mat4): Promise<string> {
  return withDb((db) => {
    const c = db
      .prepare('SELECT current_revision_id FROM candidates WHERE id = ?')
      .get(candidateId) as { current_revision_id: string } | undefined
    if (!c) throw new Error(`Candidate ${candidateId} not found`)
    const prev = db
      .prepare('SELECT volume_id, volume_hash FROM candidate_revisions WHERE id = ?')
      .get(c.current_revision_id) as { volume_id: string; volume_hash: string } | undefined
    if (!prev) throw new Error(`Missing revision ${c.current_revision_id}`)
    const order = (
      db.prepare('SELECT COUNT(*) AS n FROM candidate_revisions WHERE candidate_id = ?').get(
        candidateId,
      ) as { n: number }
    ).n
    const revisionId = randomUUID()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        INSERT INTO candidate_revisions(id, candidate_id, ord, volume_id, pose_json, volume_hash)
        VALUES(?, ?, ?, ?, ?, ?)
      `).run(revisionId, candidateId, order, prev.volume_id, toPoseJson(pose), prev.volume_hash)
      db.prepare('UPDATE candidates SET current_revision_id = ? WHERE id = ?').run(
        revisionId,
        candidateId,
      )
      db.exec('COMMIT')
      return revisionId
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })
}

export async function restoreRevision(candidateId: string, revisionId: string): Promise<void> {
  return withDb((db) => {
    const found = db
      .prepare('SELECT id FROM candidate_revisions WHERE id = ? AND candidate_id = ?')
      .get(revisionId, candidateId) as { id: string } | undefined
    if (!found) throw new Error(`Revision ${revisionId} not found for candidate ${candidateId}`)
    db.prepare('UPDATE candidates SET current_revision_id = ? WHERE id = ?').run(revisionId, candidateId)
  })
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  return withDb((db) => {
    db.prepare('DELETE FROM candidates WHERE id = ?').run(candidateId)
  })
}

export async function removeSample(projectId: string, caseId: string, sampleId: string): Promise<void> {
  if (faults.failBeforeSampleDelete) throw new Error('injected fault: failBeforeSampleDelete')
  const ctx = await findSampleContext(sampleId)
  if (!ctx || ctx.projectId !== projectId || ctx.caseId !== caseId) {
    throw new Error(`Sample ${sampleId} not found`)
  }
  const absPath = path.join(volumesRoot(), `${ctx.volumeId}.nrrd`)
  await stat(absPath)
  const parked = `${absPath}.pending-delete`
  await rename(absPath, parked)
  try {
    await withDb((db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('DELETE FROM samples WHERE id = ?').run(sampleId)
        db.prepare('DELETE FROM volume_assets WHERE id = ?').run(ctx.volumeId)
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    })
    await unlink(parked)
  } catch (err) {
    await rename(parked, absPath).catch(() => {})
    throw err
  }
}

export async function removeCase(projectId: string, caseId: string): Promise<void> {
  await withDb((db) => {
    readProjectOrThrow(db, projectId)
    const volumeRows = db
      .prepare(`
        SELECT s.volume_id
        FROM samples s
        WHERE s.case_id = ?
      `)
      .all(caseId) as Array<{ volume_id: string }>
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM cases WHERE id = ? AND project_id = ?').run(caseId, projectId)
      for (const v of volumeRows) db.prepare('DELETE FROM volume_assets WHERE id = ?').run(v.volume_id)
      const countRow = db
        .prepare('SELECT COUNT(*) AS n FROM cases WHERE project_id = ?')
        .get(projectId) as { n: number }
      db.prepare('UPDATE projects SET case_count = ?, updated_at = ? WHERE id = ?').run(
        countRow.n,
        now(),
        projectId,
      )
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return volumeRows.map((r) => r.volume_id)
  }).then(async (volumeIds) => {
    for (const volumeId of volumeIds) {
      await rm(path.join(volumesRoot(), `${volumeId}.nrrd`), { force: true }).catch(() => {})
    }
  })
}

export async function deleteProject(projectId: string): Promise<void> {
  const volumeIds = await withDb((db) => {
    const rows = db
      .prepare(`
        SELECT DISTINCT s.volume_id
        FROM samples s
        JOIN cases c ON c.id = s.case_id
        WHERE c.project_id = ?
      `)
      .all(projectId) as Array<{ volume_id: string }>
    return rows.map((r) => r.volume_id)
  })
  await withDb((db) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
      for (const volumeId of volumeIds) db.prepare('DELETE FROM volume_assets WHERE id = ?').run(volumeId)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })
  for (const volumeId of volumeIds) {
    await rm(path.join(volumesRoot(), `${volumeId}.nrrd`), { force: true }).catch(() => {})
  }
}

export async function findCandidateProject(candidateId: string): Promise<string | null> {
  return withDb((db) => {
    const row = db
      .prepare(`
        SELECT c2.project_id
        FROM candidates c
        JOIN samples s ON s.id = c.sample_id
        JOIN cases c2 ON c2.id = s.case_id
        WHERE c.id = ?
      `)
      .get(candidateId) as { project_id: string } | undefined
    return row?.project_id ?? null
  })
}

