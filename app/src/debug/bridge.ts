import { editorStore } from '../state/store'
import {
  closeDocument,
  createCandidate,
  createCase,
  createProject,
  listProjects,
  navigateCamera,
  openDocument,
  readState,
  restoreRevision,
  selectObject,
  setActiveDocument,
  setInspectionPlane,
  setVisibility,
  transformCandidate,
  type OpsContext,
} from '../ops/session'
import { importPreparedSample } from '../ops/importPrepared'

const browserOps = {
  readState,
  listProjects,
  navigateCamera,
  setVisibility,
  setInspectionPlane,
  selectObject,
  createProject,
  createCase,
  importPreparedSample,
  createCandidate,
  openDocument,
  closeDocument,
  setActiveDocument,
  transformCandidate,
  restoreRevision,
}

declare global {
  interface Window {
    __hackPrincetonDebug?: {
      readState: () => ReturnType<typeof readState>
      ops: typeof browserOps
      ctx: OpsContext
    }
  }
}

/** Expose shared session ops for coding agents (R16–R19). */
export function installDebugBridge(ctx: OpsContext = { store: editorStore }): void {
  if (typeof window === 'undefined') return
  window.__hackPrincetonDebug = {
    ctx,
    ops: browserOps,
    readState: () => readState(ctx),
  }
}
