import { editorStore } from '../state/store'
import { readState, selectObject, setVisibility, showAllObjects, type OpsContext } from '../ops/session'
import type { Mat4, OpResult } from '../domain/types'
import type { CommandId } from '../commands/registry'

const VIEW_COMMANDS = new Set<CommandId>(['view.reset', 'view.focus', 'view.toggleTiltLock', 'view.toggleProjection',
  'view.standardAnterior', 'view.standardPosterior', 'view.standardLeft', 'view.standardRight',
  'view.standardSuperior', 'view.standardInferior', 'view.toggleVisibility', 'view.showAll',
  'tool.select', 'tool.navigate', 'select.clear'])
let dispatch: ((id: CommandId) => OpResult) | undefined
export function registerCanvasCommandDispatcher(handler: typeof dispatch): void { dispatch = handler }
/** Success acknowledges dispatch. readCanvas() supplies subsequent actual render evidence. */
export function executeCanvasCommand(id: string): OpResult {
  if (!VIEW_COMMANDS.has(id as CommandId)) return { ok: false, error: 'Unknown or non-view command; use the manual UI for writes' }
  return dispatch?.(id as CommandId) ?? { ok: false, error: 'Canvas command dispatcher is unavailable' }
}

export type CanvasRuntimeSnapshot = {
  activeView: 'three-d' | 'axial' | 'sagittal' | 'coronal'
  mode: 'view' | 'window-level' | 'place'
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    projection: 'perspective' | 'orthographic'
    quaternion?: [number, number, number, number]
    zoom?: number
    viewHeight?: number
    viewportHeight?: number
    near: number
    far: number
  }
  diagnostics?: { loopFps: number; drawCalls: number; triangles: number }
  ruler?: { millimetres: number; pixels: number; pixelsPerMm: number } | null
  selectedObjectId: string | null
  highlightedObjectIds: string[]
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
  selectedObjectId: null,
  highlightedObjectIds: [],
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

const browserOps = { readState, selectObject, setVisibility, showAllObjects }

declare global {
  interface Window {
    __hackPrincetonDebug?: {
      readState: () => ReturnType<typeof readState>
      readCanvas: () => CanvasRuntimeSnapshot
      executeCommand: typeof executeCanvasCommand
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
    executeCommand: executeCanvasCommand,
  }
}
