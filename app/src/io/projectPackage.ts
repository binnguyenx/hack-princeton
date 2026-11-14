import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256Hex } from '../domain/hash'
import type {
  Candidate,
  CandidateRevision,
  Case,
  EditorState,
  Mat4,
  Project,
  Sample,
  User,
  ViewState,
} from '../domain/types'
import { emptyViewState } from '../state/store'

export type ProjectManifest = {
  landmarks?: EditorState['landmarks']
  formatVersion: 1
  user: User
  project: Project
  cases: Case[]
  samples: Array<
    Omit<Sample, 'sourceAnatomy'> & {
      sourceAnatomy: Sample['sourceAnatomy']
    }
  >
  candidates: Candidate[]
  revisions: CandidateRevision[]
  viewState: ViewState
  openDocuments?: EditorState['openDocuments']
  activeDocumentId?: string | null
}

export async function saveProjectPackage(
  dir: string,
  state: EditorState,
): Promise<void> {
  await mkdir(path.join(dir, 'volumes'), { recursive: true })
  const manifest: ProjectManifest = {
    formatVersion: 1,
    ...(state.landmarks?.length ? { landmarks: state.landmarks } : {}),
    user: state.user,
    project: state.project,
    cases: state.cases,
    samples: state.samples,
    candidates: state.candidates,
    revisions: state.revisions,
    viewState: state.view,
    openDocuments: state.openDocuments,
    activeDocumentId: state.activeDocumentId,
  }
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const [volumeId, bytes] of state.volumes) {
    await writeFile(path.join(dir, 'volumes', `${volumeId}.nrrd`), bytes)
  }
}

export async function loadProjectPackage(dir: string): Promise<EditorState> {
  const manifest = JSON.parse(
    await readFile(path.join(dir, 'manifest.json'), 'utf8'),
  ) as ProjectManifest
  const volumes = new Map<string, Uint8Array>()
  const needed = new Set<string>()
  for (const s of manifest.samples) needed.add(s.sourceAnatomy.volumeId)
  for (const r of manifest.revisions) needed.add(r.volumeId)
  for (const volumeId of needed) {
    const p = path.join(dir, 'volumes', `${volumeId}.nrrd`)
    try {
      volumes.set(volumeId, new Uint8Array(await readFile(p)))
    } catch {
      throw new Error(`Missing or unreadable volume blob: ${volumeId}`)
    }
  }
  const samples: Sample[] = []
  for (const s of manifest.samples) {
    const bytes = volumes.get(s.sourceAnatomy.volumeId)!
    samples.push({
      ...s,
      sourceAnatomy: {
        ...s.sourceAnatomy,
        volumeHash: s.sourceAnatomy.volumeHash || (await sha256Hex(bytes)),
      },
    })
  }
  const revisions: CandidateRevision[] = []
  for (const r of manifest.revisions) {
    const bytes = volumes.get(r.volumeId)!
    revisions.push({
      ...r,
      volumeHash: r.volumeHash || (await sha256Hex(bytes)),
    })
  }
  return {
    landmarks: manifest.landmarks ?? [],
    user: manifest.user,
    project: manifest.project,
    cases: manifest.cases,
    samples,
    candidates: manifest.candidates,
    revisions,
    view: manifest.viewState ?? emptyViewState(),
    volumes,
    dirty: false,
    openDocuments: manifest.openDocuments ?? [],
    activeDocumentId: manifest.activeDocumentId ?? null,
  }
}

export function poseEquals(a: Mat4, b: Mat4, eps = 1e-9): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= eps)
}
