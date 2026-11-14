import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EditorStore } from '../src/state/store'
import type { OpsContext } from '../src/ops/session'
import { seedEmptyProject } from '../src/ops/session'
import { openProject } from '../src/ops/persistence'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '../..')
export const sample0 = path.join(
  repoRoot,
  'data/samples/skullbreak-000-parietotemporal',
)
export const sample1 = path.join(
  repoRoot,
  'data/samples/skullbreak-001-frontoorbital',
)
export const demoProject = path.join(repoRoot, 'data/fixtures/demo-project')

export function freshCtx(): OpsContext {
  return { store: new EditorStore() }
}

export async function openDemo(ctx: OpsContext = freshCtx()) {
  const r = await openProject(ctx, demoProject)
  if (!r.ok) throw new Error(r.error)
  return ctx
}

export function openSeed(ctx: OpsContext = freshCtx()) {
  seedEmptyProject(ctx)
  return ctx
}
