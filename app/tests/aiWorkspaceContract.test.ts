import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { pythonExecutable } from './backendContract/python'
import { createFastApiContractBackend } from './backendContract/fastapiLifecycle'
import { postJson, TRANSLATED_POSE } from './backendContract/fixtures'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function runPython(origin: string, projectId: string, candidateId: string): Promise<string> {
  const script = `
import sys
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
    const child = spawn(pythonExecutable(), ['-B', '-c', script, origin, projectId, candidateId], {
      cwd: repoRoot,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: path.join(repoRoot, 'backend/ai/src') },
    })
    let output = ''
    let errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Python workspace read timed out')) }, 10000)
    child.stdout.on('data', (data) => { output += String(data) })
    child.stderr.on('data', (data) => { errors += String(data) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`Python HTTP contract failed (${code}): ${errors}`))
    })
  })
}

it('Python reads the actual FastAPI HTTP manifest and follows restored currentRevisionId without writing', async () => {
  const backend = await createFastApiContractBackend()
  try {
    const { baseUrl } = backend
    const projectResponse = await postJson(baseUrl, '/api/projects', { name: 'AI HTTP contract proof' })
    expect(projectResponse.status).toBe(201)
    const { projectId } = await projectResponse.json()
    const caseResponse = await postJson(baseUrl, `/api/projects/${projectId}/cases`, { name: 'Prepared case' })
    expect(caseResponse.status).toBe(201)
    const { caseId } = await caseResponse.json()
    const bytes = await readFile(path.join(repoRoot, 'data/samples/skullbreak-000-parietotemporal/defective_skull.nrrd'))
    const spatial = { units: 'mm', space: 'left-posterior-superior', sizes: [512, 512, 512], spacings: [0.4, 0.4, 0.4], bboxMm: [204.8, 204.8, 204.8] }
    const form = new FormData()
    form.set('file', new Blob([bytes]), 'prepared-source.nrrd')
    form.set('displayName', 'Prepared source')
    form.set('spatiallyVerified', 'true')
    form.set('meta', JSON.stringify(spatial))
    const upload = await fetch(`${baseUrl}/api/projects/${projectId}/cases/${caseId}/samples`, { method: 'POST', body: form })
    expect(upload.status).toBe(201)
    const { sampleId } = await upload.json()
    const creation = await postJson(baseUrl, `/api/samples/${sampleId}/candidates`, {})
    expect(creation.status).toBe(201)
    const { candidateId, revisionId } = await creation.json()
    expect((await postJson(baseUrl, `/api/candidates/${candidateId}/transform`, { pose: TRANSLATED_POSE })).status).toBe(201)
    expect((await postJson(baseUrl, `/api/candidates/${candidateId}/restore`, { revisionId })).status).toBe(200)
    const before = await (await fetch(`${baseUrl}/api/projects/${projectId}`)).json()
    const result = JSON.parse(await runPython(baseUrl, projectId, candidateId))
    expect(result.project_id).toBe(projectId)
    expect(result.case_id).toBe(caseId)
    expect(result.sample_id).toBe(sampleId)
    expect(result.revision_id).toBe(revisionId)
    expect(result.pose[3]).toBe(0)
    expect(result.volume_hash).toBe(before.samples[0].sourceAnatomy.volumeHash)
    expect(result.spatial).toEqual(spatial)
    expect(await (await fetch(`${baseUrl}/api/projects/${projectId}`)).json()).toEqual(before)
  } finally { await backend.close() }
}, 15000)
