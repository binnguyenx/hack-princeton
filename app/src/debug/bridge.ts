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
import type { Mat4 } from '../domain/types'

export type CanvasRuntimeSnapshot = {
  activeView: 'three-d' | 'axial' | 'sagittal' | 'coronal'
  mode: 'view' | 'window-level' | 'place'
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    projection: 'perspective' | 'orthographic'
    near: number
    far: number
  }
  visibleObjectIds: string[]
  objectWorldMatrices: Record<string, Mat4>
  crosshairRas: [number, number, number]
  sliceOffsets: { axial: number; sagittal: number; coronal: number }
  pendingOperationCount: number
  webglStatus: 'initializing' | 'ready' | 'lost' | 'error'
  lastAction: { id: string; result: 'changed' | 'unchanged' | 'rejected' | 'failed' } | null
}

const INITIAL_CANVAS_RUNTIME: CanvasRuntimeSnapshot = {
  activeView: 'three-d',
  mode: 'view',
  camera: {
    position: [0, 0, 400],
    target: [0, 0, 0],
    projection: 'perspective',
    near: 0.1,
    far: 8000,
  },
  visibleObjectIds: [],
  objectWorldMatrices: {},
  crosshairRas: [0, 0, 0],
  sliceOffsets: { axial: 0, sagittal: 0, coronal: 0 },
  pendingOperationCount: 0,
  webglStatus: 'initializing',
  lastAction: null,
}

let canvasRuntime: CanvasRuntimeSnapshot = structuredClone(INITIAL_CANVAS_RUNTIME)

export function resetCanvasRuntime(): void {
  canvasRuntime = structuredClone(INITIAL_CANVAS_RUNTIME)
}

export function updateCanvasRuntime(
  patch: Partial<CanvasRuntimeSnapshot>,
): void {
  canvasRuntime = {
    ...canvasRuntime,
    ...patch,
    camera: patch.camera ? { ...patch.camera } : canvasRuntime.camera,
    sliceOffsets: patch.sliceOffsets
      ? { ...patch.sliceOffsets }
      : canvasRuntime.sliceOffsets,
    objectWorldMatrices: patch.objectWorldMatrices
      ? { ...patch.objectWorldMatrices }
      : canvasRuntime.objectWorldMatrices,
    visibleObjectIds: patch.visibleObjectIds
      ? [...patch.visibleObjectIds]
      : canvasRuntime.visibleObjectIds,
    crosshairRas: patch.crosshairRas
      ? [...patch.crosshairRas]
      : canvasRuntime.crosshairRas,
    lastAction: patch.lastAction
      ? { ...patch.lastAction }
      : patch.lastAction === null
        ? null
        : canvasRuntime.lastAction,
  }
}

export function readCanvasRuntime(): CanvasRuntimeSnapshot {
  return structuredClone(canvasRuntime)
}

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
      readCanvas: () => CanvasRuntimeSnapshot
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
    readCanvas: readCanvasRuntime,
  }
}
