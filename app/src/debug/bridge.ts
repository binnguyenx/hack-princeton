import { editorStore } from '../state/store'
import {
  createCandidate,
  navigateCamera,
  readState,
  restoreRevision,
  selectObject,
  setInspectionPlane,
  setVisibility,
  transformCandidate,
  type OpsContext,
} from '../ops/session'

const browserOps = {
  readState,
  navigateCamera,
  setVisibility,
  setInspectionPlane,
  selectObject,
  createCandidate,
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
