import { Router } from 'express'
import multer from 'multer'
import type { Mat4, SpatialMeta } from '../src/domain/types'
import {
  addCase,
  addSample,
  commitTransform,
  createCandidate,
  createProject,
  deleteCandidate,
  deleteProject,
  findCandidateProject,
  findSampleContext,
  findSampleVolume,
  getProjectManifest,
  listProjects,
  readVolume,
  removeCase,
  removeSample,
  restoreRevision,
} from './storageSqlite'

const upload = multer({ storage: multer.memoryStorage() })

function one(v: string | string[] | undefined): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v[0] ?? ''
  return ''
}

function statusFor(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err)
  if (/ENOENT/i.test(msg)) return 404
  if (/not found/i.test(msg)) return 404
  if (/required/i.test(msg)) return 400
  if (/verified/i.test(msg)) return 409
  return 500
}

function jsonError(res: { status: (n: number) => { json: (v: unknown) => unknown } }, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  res.status(statusFor(err)).json({ error: msg })
}

export function createApiRouter(): Router {
  const router = Router()

  router.get('/projects', async (_req, res) => {
    try {
      res.json(await listProjects())
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.post('/projects', async (req, res) => {
    try {
      const body = req.body as { name?: string }
      const created = await createProject(body.name ?? '')
      res.status(201).json({ projectId: created.id })
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.get('/projects/:id', async (req, res) => {
    try {
      res.json(await getProjectManifest(req.params.id))
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.delete('/projects/:id', async (req, res) => {
    try {
      await deleteProject(req.params.id)
      res.status(204).send()
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.post('/projects/:id/cases', async (req, res) => {
    try {
      const body = req.body as { name?: string }
      const c = await addCase(req.params.id, body.name ?? '')
      res.status(201).json({ caseId: c.id })
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.delete('/projects/:id/cases/:caseId', async (req, res) => {
    try {
      await removeCase(req.params.id, req.params.caseId)
      res.status(204).send()
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.post('/projects/:id/cases/:caseId/samples', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'file is required' })
        return
      }
      const body = req.body as Record<string, string>
      const projectId = one(req.params.id as unknown as string | string[])
      const caseId = one(req.params.caseId as unknown as string | string[])
      const meta = JSON.parse(one((body as unknown as Record<string, string | string[]>).meta) || '{}') as SpatialMeta
      const sample = await addSample({
        projectId,
        caseId,
        displayName: one((body as unknown as Record<string, string | string[]>).displayName) || req.file.originalname,
        spatiallyVerified: one((body as unknown as Record<string, string | string[]>).spatiallyVerified) === 'true',
        meta,
        bytes: req.file.buffer,
      })
      res.status(201).json({ sampleId: sample.id, spatiallyVerified: sample.spatiallyVerified })
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.get('/samples/:id/volume', async (req, res) => {
    try {
      const found = await findSampleVolume(req.params.id)
      if (!found) {
        res.status(404).json({ error: `Sample ${req.params.id} not found` })
        return
      }
      const bytes = await readVolume(found.projectId, found.volumeId)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.status(200).send(bytes)
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.delete('/samples/:id', async (req, res) => {
    try {
      const ctx = await findSampleContext(req.params.id)
      if (!ctx) {
        res.status(404).json({ error: `Sample ${req.params.id} not found` })
        return
      }
      await removeSample(ctx.projectId, ctx.caseId, req.params.id)
      res.status(204).send()
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.post('/samples/:id/candidates', async (req, res) => {
    try {
      const created = await createCandidate(req.params.id)
      res.status(201).json({ candidateId: created.candidateId, revisionId: created.revisionId })
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.post('/candidates/:id/transform', async (req, res) => {
    try {
      const body = req.body as { pose?: number[] }
      if (!Array.isArray(body.pose) || body.pose.length !== 16) {
        res.status(400).json({ error: 'pose must have 16 numbers' })
        return
      }
      const revisionId = await commitTransform(req.params.id, body.pose as unknown as Mat4)
      res.status(201).json({ revisionId })
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.post('/candidates/:id/restore', async (req, res) => {
    try {
      const body = req.body as { revisionId?: string }
      if (!body.revisionId) {
        res.status(400).json({ error: 'revisionId is required' })
        return
      }
      await restoreRevision(req.params.id, body.revisionId)
      res.status(200).json({ ok: true })
    } catch (err) {
      jsonError(res, err)
    }
  })

  router.delete('/candidates/:id', async (req, res) => {
    try {
      const project = await findCandidateProject(req.params.id)
      if (!project) {
        res.status(404).json({ error: `Candidate ${req.params.id} not found` })
        return
      }
      void project
      await deleteCandidate(req.params.id)
      res.status(204).send()
    } catch (err) {
      jsonError(res, err)
    }
  })

  return router
}

