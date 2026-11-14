import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { expect, it } from 'vitest'
import { createApiRouter } from '../server/api'
import {
  addCase, addSample, commitTransform, createCandidate, createProject,
  getProjectManifest, restoreRevision, setStorageRootForTests,
} from '../server/storageSqlite'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function runPython(origin: string, projectId: string, candidateId: string): Promise<string> {
  const script = `
import json, sys
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter, HttpAppManifestReader, WorkspaceError
adapter = AppWorkspaceAdapter(HttpAppManifestReader(sys.argv[1]))
context = adapter.load_context(sys.argv[2], sys.argv[3])
try:
    adapter.execute_mutation('transformCandidate', {})
except WorkspaceError as error:
    assert error.code == 'app-mutation-contract-missing'
else:
    raise AssertionError('An app mutation must not be exposed')
print(context.model_dump_json())
`
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-B', '-c', script, origin, projectId, candidateId], {
      cwd: repoRoot,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: path.join(repoRoot, 'backend/ai/src') },
    })
    let output = ''
    let errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Python workspace read timed out')) }, 10_000)
    child.stdout.on('data', (data) => { output += String(data) })
    child.stderr.on('data', (data) => { errors += String(data) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`Python contract check failed (${code}): ${errors}`))
    })
  })
}

it('Python reads the actual app HTTP manifest and follows restored currentRevisionId', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hp-ai-contract-'))
  let server: Server | undefined
  try {
    setStorageRootForTests(root)
    const project = await createProject('AI contract proof')
    const kase = await addCase(project.id, 'Prepared case')
    const bytes = await readFile(path.join(repoRoot, 'data/samples/skullbreak-000-parietotemporal/defective_skull.nrrd'))
    const sample = await addSample({
      projectId: project.id, caseId: kase.id, displayName: 'Prepared source',
      spatiallyVerified: true, bytes,
      meta: { units: 'mm', space: 'left-posterior-superior', sizes: [512, 512, 512], spacings: [0.4, 0.4, 0.4], bboxMm: [204.8, 204.8, 204.8] },
    })
    const candidate = await createCandidate(sample.id)
    await commitTransform(candidate.candidateId, [1, 0, 0, 7, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    await restoreRevision(candidate.candidateId, candidate.revisionId)
    const before = await getProjectManifest(project.id)
    const app = express()
    app.use(express.json())
    app.use('/api', createApiRouter())
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
      listener.on('error', reject)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing server address')
    const result = JSON.parse(await runPython(`http://127.0.0.1:${address.port}`, project.id, candidate.candidateId))
    expect(result.project_id).toBe(project.id)
    expect(result.case_id).toBe(kase.id)
    expect(result.sample_id).toBe(sample.id)
    expect(result.revision_id).toBe(candidate.revisionId)
    expect(result.pose[3]).toBe(0)
    expect(result.volume_hash).toBe(sample.sourceAnatomy.volumeHash)
    expect(result.spatial).toEqual(sample.sourceAnatomy.spatial)
    expect(await getProjectManifest(project.id)).toEqual(before)
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
