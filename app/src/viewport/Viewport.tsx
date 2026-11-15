import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Annotation, Mat4, RasPoint } from '../domain/types'
import { updateCanvasRuntime } from '../debug/bridge'
import { prepareViewportMaterials } from '../geometry/displayMesh'
import type { AnnotationAction } from '../ui/annotationActions'
import { AnnotationViewportActionMenu } from '../ui/annotationActionMenu'
import {
  accumulateBrushTriangles,
  syncAnnotationObjects,
} from './AnnotationOverlay'
import {
  annotationIdFromIntersection,
  applyOrientedExtentDrag,
  collectPickables,
  isOrientedExtentType,
  syncGroupEmphasis,
} from './annotationBehaviors'
import {
  classifyPointerGesture,
  isCanvasSurfaceTarget,
  type PointerSample,
} from './canvasGestures'
import { resolveCanvasPointerOwner } from './canvasInteractions'
import { getSlicerMouseButtons } from './navigationPolicy'

export type ViewPreset =
  | 'anterior'
  | 'posterior'
  | 'left'
  | 'right'
  | 'superior'
  | 'inferior'
export type ProjectionMode = 'perspective' | 'orthographic'
export type CameraMotionMode = 'none' | 'spin' | 'rock'

type Props = {
  mesh?: THREE.Object3D | null
  /** Display mesh for Phase 2 highlight overlays (R63); may match `mesh`. */
  displayMesh?: THREE.Object3D | null
  annotations?: Annotation[]
  /** Panel/viewport selection — shows measure labels for line/closed curve. */
  selectedAnnotationId?: string | null
  onSelectAnnotation?: (id: string | null) => void
  onAnnotationAction?: (action: AnnotationAction) => void
  /** Plane/ROI gizmo edit. `commit` true on pointer-up (persist); false while dragging. */
  onExtentEdit?: (
    id: string,
    edit: { points: RasPoint[]; meta: Record<string, unknown> },
    commit: boolean,
  ) => void
  objectId?: string
  status?: string | null
  viewPreset?: ViewPreset | null
  viewPresetNonce?: number
  projection?: ProjectionMode
  crosshairVisible?: boolean
  /** Multiplier on scene lights. 1 = baseline; higher = brighter model. */
  lightingIntensity?: number
  tiltLock?: boolean
  motionMode?: CameraMotionMode
  focusNonce?: number
  resetNonce?: number
  rendererNonce?: number
  onContextStatusChange?: (status: 'ready' | 'lost' | 'restoring') => void
  onCameraChange?: (
    position: [number, number, number],
    target: [number, number, number],
  ) => void
  /** When true, LMB drag paints highlight triangles on displayMesh (R60–R61). */
  paintHighlight?: boolean
  brushRadiusMm?: number
  onPaintTriangles?: (triangleIndices: number[]) => void
  onStaleHighlight?: (id: string) => void
  /**
   * When true (Place mode, non-highlight), a single LMB click raycasts the
   * display mesh and reports the hit as a world/RAS point.
   */
  placePointMode?: boolean
  /** Distance line: place only on double-click (R25). */
  placeRequireDblClick?: boolean
  onPlaceWorldPoint?: (point: [number, number, number]) => void
  /** Finish curve draft without adding a point (Enter / double-click). */
  onPlaceFinish?: () => void
  /** Anatomy extents (mm) for plane rectangle sizing (R47). */
  boundingBoxMm?: number[]
  /** Ephemeral Place draft preview (not yet committed). */
  draftPreview?: {
    type: Annotation['type']
    points: Array<[number, number, number]>
  } | null
}

type Runtime = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  perspective: THREE.PerspectiveCamera
  orthographic: THREE.OrthographicCamera
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  controls: OrbitControls
  content: THREE.Group
  grid: THREE.GridHelper | null
  mount: HTMLDivElement
  objectId?: string
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  key: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  head: THREE.DirectionalLight
}

/** Soft monochrome studio ground — matches app Base, not a black void. */
const BACKGROUND_COLOR = 0xe8eaee
const GRID_CENTER_COLOR = 0x8b94a1
const GRID_LINE_COLOR = 0xb8c0ca
/** Lower = closer camera = larger default subject. Was 3 (subject looked tiny). */
const DEFAULT_DISTANCE = 1.95
const MIN_NEAR = 0.01
const FRAMING_MARGIN = 1.0
// Soft key/fill for light studio; form comes from material contrast + key.
const BASE_AMBIENT = 0.32
const BASE_HEMI = 0.7
const BASE_KEY = 1.25
const BASE_FILL = 0.45
const BASE_HEAD = 0.28
/** Mid-slider default: readable form with visible recesses. */
export const DEFAULT_LIGHTING_INTENSITY = 1

function disposeGrid(grid: THREE.GridHelper | null) {
  if (!grid) return
  grid.parent?.remove(grid)
  grid.geometry.dispose()
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const material of materials) material.dispose()
}

function syncGroundGrid(runtime: Runtime) {
  const box = new THREE.Box3().setFromObject(runtime.content)
  disposeGrid(runtime.grid)
  runtime.grid = null
  if (box.isEmpty()) return

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 1)
  const extent = maxDimension * 4
  const grid = new THREE.GridHelper(extent, 40, GRID_CENTER_COLOR, GRID_LINE_COLOR)
  // Scene is Z-up; GridHelper defaults to XZ (Y-up floor) — rotate onto XY.
  grid.rotation.x = Math.PI / 2
  grid.position.set(center.x, center.y, box.min.z - maxDimension * 0.02)
  grid.renderOrder = -1
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const material of materials) {
    material.transparent = true
    material.opacity = 0.85
    material.depthWrite = false
  }
  runtime.scene.add(grid)
  runtime.grid = grid
}

function applyLighting(runtime: Runtime, intensity: number) {
  const scale = Math.max(0.25, Math.min(intensity, 3))
  runtime.ambient.intensity = BASE_AMBIENT * scale
  runtime.hemi.intensity = BASE_HEMI * scale
  runtime.key.intensity = BASE_KEY * scale
  runtime.fill.intensity = BASE_FILL * scale
  runtime.head.intensity = BASE_HEAD * scale
  runtime.renderer.toneMappingExposure = 0.95 + scale * 0.15
}

function configureOrthographic(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  viewHeight: number,
) {
  const aspect = width / Math.max(height, 1)
  camera.left = (-viewHeight * aspect) / 2
  camera.right = (viewHeight * aspect) / 2
  camera.top = viewHeight / 2
  camera.bottom = -viewHeight / 2
  camera.updateProjectionMatrix()
}

function publish(runtime: Runtime, actionId: string) {
  runtime.camera.updateMatrixWorld()
  runtime.content.updateMatrixWorld(true)
  const object = runtime.content.children[0]
  const objectWorldMatrices: Record<string, Mat4> = {}
  if (object && runtime.objectId) {
    objectWorldMatrices[runtime.objectId] =
      object.matrixWorld.toArray() as unknown as Mat4
  }
  updateCanvasRuntime({
    activeView: 'three-d',
    camera: {
      position: runtime.camera.position.toArray(),
      target: runtime.controls.target.toArray(),
      projection:
        runtime.camera instanceof THREE.OrthographicCamera
          ? 'orthographic'
          : 'perspective',
      near: runtime.camera.near,
      far: runtime.camera.far,
    },
    visibleObjectIds: object && runtime.objectId ? [runtime.objectId] : [],
    objectWorldMatrices,
    webglStatus: runtime.renderer.getContext().isContextLost() ? 'lost' : 'ready',
    lastAction: { id: actionId, result: 'changed' },
  })
}

function frameContent(runtime: Runtime, resetOrientation: boolean) {
  const box = new THREE.Box3().setFromObject(runtime.content)
  if (box.isEmpty()) {
    disposeGrid(runtime.grid)
    runtime.grid = null
    return
  }
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 1)
  const distance = maxDimension * DEFAULT_DISTANCE
  if (resetOrientation) {
    runtime.camera.position.set(center.x, center.y + distance, center.z)
    runtime.camera.up.set(0, 0, 1)
  } else {
    const direction = runtime.camera.position
      .clone()
      .sub(runtime.controls.target)
      .normalize()
    runtime.camera.position.copy(center.clone().addScaledVector(direction, distance))
  }
  runtime.controls.target.copy(center)
  runtime.perspective.near = Math.max(maxDimension / 1000, MIN_NEAR)
  runtime.perspective.far = Math.max(distance * 10, 100)
  runtime.perspective.updateProjectionMatrix()
  runtime.orthographic.near = runtime.perspective.near
  runtime.orthographic.far = runtime.perspective.far
  configureOrthographic(
    runtime.orthographic,
    runtime.mount.clientWidth,
    runtime.mount.clientHeight,
    maxDimension * FRAMING_MARGIN,
  )
  syncGroundGrid(runtime)
  runtime.controls.update()
  publish(runtime, resetOrientation ? 'view.reset' : 'view.center')
}

function applyPreset(runtime: Runtime, preset: ViewPreset) {
  const directions: Record<ViewPreset, THREE.Vector3> = {
    right: new THREE.Vector3(1, 0, 0),
    left: new THREE.Vector3(-1, 0, 0),
    anterior: new THREE.Vector3(0, 1, 0),
    posterior: new THREE.Vector3(0, -1, 0),
    superior: new THREE.Vector3(0, 0, 1),
    inferior: new THREE.Vector3(0, 0, -1),
  }
  const distance = Math.max(
    runtime.camera.position.distanceTo(runtime.controls.target),
    DEFAULT_DISTANCE,
  )
  runtime.camera.position.copy(
    runtime.controls.target.clone().addScaledVector(directions[preset], distance),
  )
  runtime.camera.up.set(
    0,
    preset === 'superior' || preset === 'inferior' ? 1 : 0,
    preset === 'superior' || preset === 'inferior' ? 0 : 1,
  )
  runtime.controls.update()
  publish(runtime, `view.${preset}`)
}

export function Viewport({
  mesh,
  displayMesh = null,
  annotations = [],
  selectedAnnotationId = null,
  onSelectAnnotation,
  onAnnotationAction,
  onExtentEdit,
  objectId,
  status,
  viewPreset,
  viewPresetNonce = 0,
  projection = 'perspective',
  crosshairVisible = false,
  lightingIntensity = DEFAULT_LIGHTING_INTENSITY,
  tiltLock = false,
  motionMode = 'none',
  focusNonce = 0,
  resetNonce = 0,
  rendererNonce = 0,
  onContextStatusChange,
  onCameraChange,
  paintHighlight = false,
  brushRadiusMm = 10,
  onPaintTriangles,
  onStaleHighlight,
  placePointMode = false,
  placeRequireDblClick = false,
  onPlaceWorldPoint,
  onPlaceFinish,
  boundingBoxMm,
  draftPreview = null,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Runtime | null>(null)
  const annotationObjectsRef = useRef(new Map<string, THREE.Object3D[]>())
  const gizmoObjectsRef = useRef<THREE.Object3D[]>([])
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(
    null,
  )
  const [contextMenu, setContextMenu] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const selectRef = useRef({
    onSelectAnnotation,
    onAnnotationAction,
    onExtentEdit,
    placePointMode,
    paintHighlight,
    selectedAnnotationId,
    annotations,
  })
  selectRef.current = {
    onSelectAnnotation,
    onAnnotationAction,
    onExtentEdit,
    placePointMode,
    paintHighlight,
    selectedAnnotationId,
    annotations,
  }
  const cameraChangeRef = useRef(onCameraChange)
  const motionModeRef = useRef(motionMode)
  const paintRef = useRef({
    paintHighlight,
    brushRadiusMm,
    onPaintTriangles,
    displayMesh,
  })
  const placeRef = useRef({
    placePointMode,
    placeRequireDblClick,
    onPlaceWorldPoint,
    onPlaceFinish,
    displayMesh,
    draftPreview,
  })
  placeRef.current = {
    placePointMode,
    placeRequireDblClick,
    onPlaceWorldPoint,
    onPlaceFinish,
    displayMesh,
    draftPreview,
  }
  paintRef.current = {
    paintHighlight,
    brushRadiusMm,
    onPaintTriangles,
    displayMesh,
  }
  const onStaleHighlightRef = useRef(onStaleHighlight)
  onStaleHighlightRef.current = onStaleHighlight
  const contextStatusChangeRef = useRef(onContextStatusChange)
  const [contextStatus, setContextStatus] = useState<'ready' | 'lost' | 'restoring'>(
    'ready',
  )

  useEffect(() => {
    cameraChangeRef.current = onCameraChange
  }, [onCameraChange])

  useEffect(() => {
    contextStatusChangeRef.current = onContextStatusChange
  }, [onContextStatusChange])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(BACKGROUND_COLOR)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BACKGROUND_COLOR)
    const perspective = new THREE.PerspectiveCamera(38, 1, MIN_NEAR, 8000)
    perspective.position.set(0, DEFAULT_DISTANCE, 0)
    perspective.up.set(0, 0, 1)
    const orthographic = new THREE.OrthographicCamera(
      -1,
      1,
      1,
      -1,
      MIN_NEAR,
      8000,
    )
    orthographic.position.copy(perspective.position)
    orthographic.up.copy(perspective.up)
    const camera = projection === 'orthographic' ? orthographic : perspective
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.mouseButtons = getSlicerMouseButtons()
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    const ambient = new THREE.AmbientLight(0xffffff, BASE_AMBIENT)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa1ab, BASE_HEMI)
    const key = new THREE.DirectionalLight(0xffffff, BASE_KEY)
    key.position.set(4, 6, 8)
    const fill = new THREE.DirectionalLight(0xe8ecf2, BASE_FILL)
    fill.position.set(-5, 2, -3)
    const head = new THREE.DirectionalLight(0xffffff, BASE_HEAD)
    head.position.set(0.35, 0.25, 1)
    camera.add(head)
    // Cameras must be in the scene graph for child headlamps to transform.
    scene.add(perspective)
    scene.add(orthographic)
    scene.add(ambient)
    scene.add(hemi)
    scene.add(key)
    scene.add(fill)
    const content = new THREE.Group()
    scene.add(content)

    const runtime: Runtime = {
      renderer,
      scene,
      perspective,
      orthographic,
      camera,
      controls,
      content,
      grid: null,
      mount,
      objectId,
      ambient,
      hemi,
      key,
      fill,
      head,
    }
    applyLighting(runtime, lightingIntensity)
    sceneRef.current = runtime
    setContextStatus('ready')
    contextStatusChangeRef.current?.('ready')

    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      renderer.setSize(width, height, false)
      renderer.setViewport(0, 0, width, height)
      renderer.setScissor(0, 0, width, height)
      renderer.setScissorTest(true)
      perspective.aspect = width / Math.max(height, 1)
      perspective.updateProjectionMatrix()
      configureOrthographic(
        orthographic,
        width,
        height,
        orthographic.top - orthographic.bottom,
      )
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    const onControlEnd = () => {
      publish(runtime, 'view.navigate')
      cameraChangeRef.current?.(
        runtime.camera.position.toArray(),
        runtime.controls.target.toArray(),
      )
    }
    controls.addEventListener('end', onControlEnd)

    let frame = 0
    let rockAngle = 0
    let rockDirection = 1
    const render = () => {
      if (
        motionModeRef.current !== 'none' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        const step = 0.0025
        const offset = runtime.camera.position.clone().sub(runtime.controls.target)
        if (motionModeRef.current === 'spin') {
          offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), step)
        } else {
          if (Math.abs(rockAngle) >= 0.25) rockDirection *= -1
          rockAngle += step * rockDirection
          offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), step * rockDirection)
        }
        runtime.camera.position.copy(runtime.controls.target.clone().add(offset))
      }
      controls.update()
      renderer.render(scene, runtime.camera)
      frame = requestAnimationFrame(render)
    }
    render()

    const canvas = renderer.domElement
    const onContextLost = (event: Event) => {
      event.preventDefault()
      setContextStatus('lost')
      contextStatusChangeRef.current?.('lost')
      updateCanvasRuntime({
        webglStatus: 'lost',
        lastAction: { id: 'renderer.context-lost', result: 'failed' },
      })
    }
    const onContextRestored = () => {
      setContextStatus('restoring')
      contextStatusChangeRef.current?.('restoring')
      renderer.resetState()
      requestAnimationFrame(() => {
        setContextStatus('ready')
        contextStatusChangeRef.current?.('ready')
        publish(runtime, 'renderer.context-restored')
      })
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    let rolling = false
    let previousX = 0
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return
      event.stopPropagation()
      rolling = true
      previousX = event.clientX
      controls.enabled = false
      canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!rolling) return
      event.stopPropagation()
      const direction = new THREE.Vector3()
      runtime.camera.getWorldDirection(direction)
      runtime.camera.up
        .applyAxisAngle(direction, -(event.clientX - previousX) * 0.01)
        .normalize()
      previousX = event.clientX
      controls.update()
    }
    const endRoll = () => {
      if (rolling) publish(runtime, 'view.roll')
      rolling = false
      controls.enabled = true
    }
    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('pointerup', endRoll, true)
    canvas.addEventListener('pointercancel', endRoll, true)
    publish(runtime, 'renderer.ready')

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('end', onControlEnd)
      controls.dispose()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('pointerup', endRoll, true)
      canvas.removeEventListener('pointercancel', endRoll, true)
      disposeGrid(runtime.grid)
      renderer.dispose()
      renderer.forceContextLoss()
      mount.removeChild(canvas)
      sceneRef.current = null
    }
  }, [rendererNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    runtime.objectId = objectId
    runtime.content.clear()
    if (!mesh) {
      disposeGrid(runtime.grid)
      runtime.grid = null
      publish(runtime, 'content.clear')
      return
    }
    prepareViewportMaterials(mesh)
    runtime.content.add(mesh)
    frameContent(runtime, true)
  }, [mesh, objectId])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    const measureLabelIds = new Set<string>()
    if (selectedAnnotationId) measureLabelIds.add(selectedAnnotationId)
    if (hoveredAnnotationId) measureLabelIds.add(hoveredAnnotationId)
    syncAnnotationObjects(
      runtime.scene,
      annotations,
      annotationObjectsRef,
      displayMesh,
      (id) => onStaleHighlightRef.current?.(id),
      draftPreview
        ? { type: draftPreview.type, points: draftPreview.points }
        : null,
      boundingBoxMm,
      measureLabelIds,
    )
    syncGroupEmphasis(
      annotationObjectsRef.current,
      selectedAnnotationId,
      hoveredAnnotationId,
    )
  }, [
    annotations,
    displayMesh,
    rendererNonce,
    mesh,
    objectId,
    boundingBoxMm,
    draftPreview,
    selectedAnnotationId,
    hoveredAnnotationId,
  ])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    const canvas = runtime.renderer.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const pickAnnotationId = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, runtime.camera)
      const hits = raycaster.intersectObjects(
        collectPickables(annotationObjectsRef.current),
        true,
      )
      return annotationIdFromIntersection(hits[0])
    }

    const onMove = (event: PointerEvent) => {
      if (!isCanvasSurfaceTarget(event.target)) {
        setHoveredAnnotationId(null)
        return
      }
      const found = pickAnnotationId(event.clientX, event.clientY)
      setHoveredAnnotationId((prev) => (prev === found ? prev : found))
    }

    const onLeave = () => setHoveredAnnotationId(null)

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return
      const cfg = selectRef.current
      if (cfg.placePointMode || cfg.paintHighlight) return
      if (!isCanvasSurfaceTarget(event.target)) return
      const found = pickAnnotationId(event.clientX, event.clientY)
      if (
        resolveCanvasPointerOwner({
          button: event.button,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          placeActive: cfg.placePointMode,
          highlightActive: cfg.paintHighlight,
          hitHandle: false,
          hitAnatomy: false,
          hitAnnotation: Boolean(found),
        }) !== 'select'
      ) return
      cfg.onSelectAnnotation?.(found)
    }

    const onContextMenu = (event: MouseEvent) => {
      if (!isCanvasSurfaceTarget(event.target)) return
      const found = pickAnnotationId(event.clientX, event.clientY)
      if (!found) return
      event.preventDefault()
      event.stopPropagation()
      selectRef.current.onSelectAnnotation?.(found)
      setContextMenu({ id: found, x: event.clientX, y: event.clientY })
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('contextmenu', onContextMenu)
    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [rendererNonce, annotations])

  // OrientedExtent gizmos for selected plane / ROI (View or Place idle).
  // `gizmoAnnAlive` forces teardown when the selected id is deleted but selection lags.
  const gizmoAnnAlive = Boolean(
    selectedAnnotationId &&
      annotations.some((a) => a.id === selectedAnnotationId),
  )
  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    const disposeGizmos = () => {
      for (const obj of gizmoObjectsRef.current) {
        runtime.scene.remove(obj)
        obj.traverse((c) => {
          if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose()
        })
      }
      gizmoObjectsRef.current = []
    }
    disposeGizmos()

    const selectedId = selectedAnnotationId
    const ann = selectRef.current.annotations.find((a) => a.id === selectedId)
    if (
      !gizmoAnnAlive ||
      !ann ||
      ann.locked ||
      !isOrientedExtentType(ann.type)
    ) {
      return
    }
    const annId = ann.id

    const placeOrigin = (target: Annotation) => {
      const origin = new THREE.Vector3(...(target.points[0] ?? [0, 0, 0]))
      if (target.type === 'roi') {
        const min = (target.meta.min as RasPoint | undefined) ?? target.points[0]
        const max = (target.meta.max as RasPoint | undefined) ?? target.points[1]
        if (min && max) {
          origin.set(
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2,
          )
        }
      }
      return origin
    }

    const origin = placeOrigin(ann)
    // Large hit targets — thin tori are nearly impossible to pick on a skull.
    const bbox = boundingBoxMm
    const extent =
      bbox && bbox.length >= 3
        ? Math.max(...bbox.map((v) => Math.abs(v)), 40)
        : 80
    const ringR = Math.max(extent * 0.12, 18)
    const knobR = Math.max(ringR * 0.22, 5)
    const scaleSize = Math.max(knobR * 1.4, 8)
    const scaleOffset = ringR * 1.45
    const handles: THREE.Object3D[] = []

    const mark = (obj: THREE.Object3D, mode: 'rotate' | 'scale', name: string) => {
      obj.userData.gizmoMode = mode
      obj.userData.annotationId = `gizmo-${annId}`
      obj.renderOrder = 20
      obj.name = name
      handles.push(obj)
    }

    if (ann.type === 'plane') {
      // Visible ring + fat invisible hit torus + 4 sphere knobs.
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x2f6bff,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      })
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, Math.max(ringR * 0.06, 1.5), 12, 48),
        ringMat,
      )
      ring.position.copy(origin)
      mark(ring, 'rotate', `gizmo-rotate-vis-${annId}`)

      const hitRing = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, Math.max(ringR * 0.28, 6), 8, 32),
        new THREE.MeshBasicMaterial({
          visible: false,
          depthTest: false,
        }),
      )
      hitRing.position.copy(origin)
      mark(hitRing, 'rotate', `gizmo-rotate-hit-${annId}`)

      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(knobR, 16, 12),
          new THREE.MeshBasicMaterial({
            color: 0x5b8cff,
            depthTest: false,
          }),
        )
        knob.position.set(
          origin.x + Math.cos(a) * ringR,
          origin.y + Math.sin(a) * ringR,
          origin.z,
        )
        mark(knob, 'rotate', `gizmo-rotate-knob-${annId}-${i}`)
      }
    }

    // Amber scale knobs — for ROI use face centers so it never looks like a plane ring.
    const scaleMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthTest: false,
    })
    if (ann.type === 'roi') {
      const min = (ann.meta.min as RasPoint | undefined) ?? ann.points[0]
      const max = (ann.meta.max as RasPoint | undefined) ?? ann.points[1]
      if (min && max) {
        const cx = (min[0] + max[0]) / 2
        const cy = (min[1] + max[1]) / 2
        const cz = (min[2] + max[2]) / 2
        const faces: RasPoint[] = [
          [max[0], cy, cz],
          [min[0], cy, cz],
          [cx, max[1], cz],
          [cx, min[1], cz],
          [cx, cy, max[2]],
          [cx, cy, min[2]],
        ]
        faces.forEach((p, i) => {
          const knob = new THREE.Mesh(
            new THREE.BoxGeometry(scaleSize, scaleSize, scaleSize),
            scaleMat.clone(),
          )
          knob.position.set(p[0], p[1], p[2])
          mark(knob, 'scale', `gizmo-scale-face-${annId}-${i}`)
        })
      }
    } else {
      const scaleHandle = new THREE.Mesh(
        new THREE.BoxGeometry(scaleSize, scaleSize, scaleSize),
        scaleMat,
      )
      scaleHandle.position.copy(origin).add(new THREE.Vector3(scaleOffset, 0, 0))
      mark(scaleHandle, 'scale', `gizmo-scale-${annId}`)
    }

    for (const h of handles) runtime.scene.add(h)
    gizmoObjectsRef.current = handles

    const canvas = runtime.renderer.domElement
    const raycaster = new THREE.Raycaster()
    // Prefer gizmo knobs over anatomy when both are under the cursor.
    raycaster.params.Points = { threshold: 2 }
    const pointer = new THREE.Vector2()
    let dragging: {
      mode: 'rotate' | 'scale'
      lastX: number
      lastY: number
      snapshot: Annotation
    } | null = null

    const syncHandlePositions = (target: Annotation) => {
      const nextOrigin = placeOrigin(target)
      for (const h of handles) {
        if (String(h.name).includes('rotate-vis') || String(h.name).includes('rotate-hit')) {
          h.position.copy(nextOrigin)
        } else if (String(h.name).includes('rotate-knob')) {
          const idx = Number(String(h.name).split('-').pop())
          if (Number.isFinite(idx)) {
            const a = (idx / 4) * Math.PI * 2
            h.position.set(
              nextOrigin.x + Math.cos(a) * ringR,
              nextOrigin.y + Math.sin(a) * ringR,
              nextOrigin.z,
            )
          }
        } else if (String(h.name).includes('gizmo-scale-') && target.type !== 'roi') {
          h.position.copy(nextOrigin).add(new THREE.Vector3(scaleOffset, 0, 0))
        } else if (String(h.name).includes('scale-face') && target.type === 'roi') {
          const min = (target.meta.min as RasPoint | undefined) ?? target.points[0]
          const max = (target.meta.max as RasPoint | undefined) ?? target.points[1]
          if (!min || !max) continue
          const cx = (min[0] + max[0]) / 2
          const cy = (min[1] + max[1]) / 2
          const cz = (min[2] + max[2]) / 2
          const faces: RasPoint[] = [
            [max[0], cy, cz],
            [min[0], cy, cz],
            [cx, max[1], cz],
            [cx, min[1], cz],
            [cx, cy, max[2]],
            [cx, cy, min[2]],
          ]
          const idx = Number(String(h.name).split('-').pop())
          if (Number.isFinite(idx) && faces[idx]) {
            h.position.set(faces[idx][0], faces[idx][1], faces[idx][2])
          }
        }
      }
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return
      // Gizmos stay active in Place mode so plane/ROI can be edited after drop.
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, runtime.camera)
      const hits = raycaster.intersectObjects(gizmoObjectsRef.current, true)
      if (hits.length === 0) return
      let modeObj: THREE.Object3D | null = hits[0].object
      while (modeObj && !modeObj.userData.gizmoMode) modeObj = modeObj.parent
      const mode = modeObj?.userData.gizmoMode as 'rotate' | 'scale' | undefined
      if (!mode) return
      const live = selectRef.current.annotations.find((a) => a.id === annId)
      if (!live || live.locked) return
      const cfg = selectRef.current
      if (
        resolveCanvasPointerOwner({
          button: event.button,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          placeActive: cfg.placePointMode,
          highlightActive: cfg.paintHighlight,
          hitHandle: true,
          hitAnatomy: false,
          hitAnnotation: false,
        }) !== 'manipulate'
      ) return
      event.stopImmediatePropagation()
      event.preventDefault()
      runtime.controls.enabled = false
      canvas.setPointerCapture(event.pointerId)
      dragging = {
        mode,
        lastX: event.clientX,
        lastY: event.clientY,
        snapshot: live,
      }
    }
    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      event.stopImmediatePropagation()
      const dx = event.clientX - dragging.lastX
      const dy = event.clientY - dragging.lastY
      dragging.lastX = event.clientX
      dragging.lastY = event.clientY
      const edit = applyOrientedExtentDrag(dragging.snapshot, dragging.mode, {
        x: dx,
        y: dy,
      })
      dragging.snapshot = {
        ...dragging.snapshot,
        points: edit.points,
        meta: edit.meta,
      }
      syncHandlePositions(dragging.snapshot)
      selectRef.current.onExtentEdit?.(annId, edit, false)
    }
    const onUp = () => {
      if (!dragging) return
      const final = dragging.snapshot
      dragging = null
      runtime.controls.enabled = true
      selectRef.current.onExtentEdit?.(
        annId,
        { points: final.points, meta: final.meta },
        true,
      )
    }

    canvas.addEventListener('pointerdown', onDown, true)
    canvas.addEventListener('pointermove', onMove, true)
    canvas.addEventListener('pointerup', onUp, true)
    canvas.addEventListener('pointercancel', onUp, true)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('pointermove', onMove, true)
      canvas.removeEventListener('pointerup', onUp, true)
      canvas.removeEventListener('pointercancel', onUp, true)
      runtime.controls.enabled = true
      disposeGizmos()
    }
  }, [selectedAnnotationId, gizmoAnnAlive, rendererNonce, boundingBoxMm])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime || !paintHighlight) return
    const canvas = runtime.renderer.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let painting = false
    const painted = new Set<number>()

    // Hold-drag paint must own LMB for the whole Highlight session.
    const prevRotate = runtime.controls.enableRotate
    const prevPan = runtime.controls.enablePan
    runtime.controls.enableRotate = false
    runtime.controls.enablePan = false

    const sample = (event: PointerEvent) => {
      const cfg = paintRef.current
      const target = cfg.displayMesh
      if (!target || !cfg.onPaintTriangles) return
      target.updateMatrixWorld(true)
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, runtime.camera)
      const hits = raycaster.intersectObject(target, true)
      if (hits.length === 0) return
      const hit = hits[0]
      const tris = accumulateBrushTriangles(
        hit.object,
        hit.point,
        cfg.brushRadiusMm,
      )
      for (const t of tris) {
        if (!painted.has(t)) {
          painted.add(t)
        }
      }
      // Stack/persistence state updates only once per completed stroke.
      // Updating the full overlay for every pointermove can freeze the canvas.
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return
      if (!isCanvasSurfaceTarget(event.target)) return
      if (
        resolveCanvasPointerOwner({
          button: event.button,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          placeActive: placePointMode,
          highlightActive: paintRef.current.paintHighlight,
          hitHandle: false,
          hitAnatomy: true,
          hitAnnotation: false,
        }) !== 'paint'
      ) return
      event.stopImmediatePropagation()
      event.preventDefault()
      painting = true
      painted.clear()
      canvas.setPointerCapture(event.pointerId)
      sample(event)
    }
    const onMove = (event: PointerEvent) => {
      if (!painting) return
      event.stopImmediatePropagation()
      event.preventDefault()
      sample(event)
    }
    const onUp = (event: PointerEvent) => {
      if (!painting) return
      painting = false
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        /* not capturing */
      }
      if (painted.size > 0) {
        paintRef.current.onPaintTriangles?.([...painted])
      }
    }

    canvas.addEventListener('pointerdown', onDown, true)
    canvas.addEventListener('pointermove', onMove, true)
    canvas.addEventListener('pointerup', onUp, true)
    canvas.addEventListener('pointercancel', onUp, true)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('pointermove', onMove, true)
      canvas.removeEventListener('pointerup', onUp, true)
      canvas.removeEventListener('pointercancel', onUp, true)
      runtime.controls.enableRotate = prevRotate
      runtime.controls.enablePan = prevPan
      runtime.controls.enabled = true
    }
  }, [paintHighlight, placePointMode, rendererNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime || !placePointMode) return
    const canvas = runtime.renderer.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downSample: PointerSample | null = null
    // R79: keep orbit enabled; only tap places a draft point.

    const pickWorldPoint = (clientX: number, clientY: number) => {
      const cfg = placeRef.current
      const target = cfg.displayMesh
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, runtime.camera)
      if (target) {
        const hits = raycaster.intersectObject(target, true)
        if (hits.length > 0) return { point: hits[0].point.clone(), hitAnatomy: true }
      }
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        runtime.camera.getWorldDirection(new THREE.Vector3()).negate(),
        runtime.controls.target.clone(),
      )
      const hit = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(plane, hit)) return { point: hit, hitAnatomy: false }
      return null
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return
      if (!isCanvasSurfaceTarget(event.target)) return
      const cfg = placeRef.current
      if (!cfg.placePointMode || !cfg.onPlaceWorldPoint) return
      downSample = {
        type: 'down',
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        altKey: event.altKey,
      }
    }

    let pendingCurveNodeTap: number | null = null
    const DBLCLICK_MS = 350

    const onUp = (event: PointerEvent) => {
      if (!downSample) return
      const upSample: PointerSample = {
        type: 'up',
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        altKey: event.altKey,
      }
      const gesture = classifyPointerGesture({ down: downSample, up: upSample })
      downSample = null
      const cfg = placeRef.current
      if (cfg.placeRequireDblClick) return
      if (gesture.kind !== 'tap') return
      if (!cfg.onPlaceWorldPoint) return

      if (cfg.onPlaceFinish) {
        const picked = pickWorldPoint(gesture.clientX, gesture.clientY)
        if (!picked || !picked.hitAnatomy) return
        if (
          resolveCanvasPointerOwner({
            button: event.button,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            placeActive: cfg.placePointMode,
            highlightActive: paintHighlight,
            hitHandle: false,
            hitAnatomy: picked.hitAnatomy,
            hitAnnotation: false,
          }) !== 'place'
        ) return
        const lastPoint = cfg.draftPreview?.points.at(-1)
        const minimumPoints =
          cfg.draftPreview?.type === 'closed_curve' ? 3 : 2
        const clickedLastPoint = Boolean(
          lastPoint &&
            new THREE.Vector3(...lastPoint).distanceTo(picked.point) <= 5,
        )
        if (
          clickedLastPoint &&
          (cfg.draftPreview?.points.length ?? 0) >= minimumPoints
        ) {
          if (pendingCurveNodeTap != null) {
            window.clearTimeout(pendingCurveNodeTap)
            pendingCurveNodeTap = null
            cfg.onPlaceFinish()
            return
          }
          pendingCurveNodeTap = window.setTimeout(() => {
            pendingCurveNodeTap = null
            cfg.onPlaceWorldPoint?.([
              picked.point.x,
              picked.point.y,
              picked.point.z,
            ])
          }, DBLCLICK_MS)
          return
        }
        cfg.onPlaceWorldPoint([picked.point.x, picked.point.y, picked.point.z])
        return
      }

      const picked = pickWorldPoint(gesture.clientX, gesture.clientY)
      if (!picked || !picked.hitAnatomy) return
      if (
        resolveCanvasPointerOwner({
          button: event.button,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          placeActive: cfg.placePointMode,
          highlightActive: paintHighlight,
          hitHandle: false,
          hitAnatomy: picked.hitAnatomy,
          hitAnnotation: false,
        }) !== 'place'
      ) return
      cfg.onPlaceWorldPoint([picked.point.x, picked.point.y, picked.point.z])
    }

    const onDblClick = (event: MouseEvent) => {
      const cfg = placeRef.current
      if (!cfg.placePointMode) return
      if (!isCanvasSurfaceTarget(event.target)) return
      if (cfg.placeRequireDblClick) {
        if (!cfg.onPlaceWorldPoint) return
        const picked = pickWorldPoint(event.clientX, event.clientY)
        if (!picked || !picked.hitAnatomy) return
        if (
          resolveCanvasPointerOwner({
            button: event.button,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            placeActive: cfg.placePointMode,
            highlightActive: paintHighlight,
            hitHandle: false,
            hitAnatomy: picked.hitAnatomy,
            hitAnnotation: false,
          }) !== 'place'
        ) return
        cfg.onPlaceWorldPoint([picked.point.x, picked.point.y, picked.point.z])
        return
      }
      // Backup if the second-tap finish path did not run (e.g. missed timing).
      if (!cfg.onPlaceFinish) return
      event.preventDefault()
      // Pointer-up owns curve completion. Let it decide whether this is a
      // double-click on the last node so native dblclick cannot finish twice.
      event.preventDefault()
    }

    canvas.addEventListener('pointerdown', onDown, true)
    canvas.addEventListener('pointerup', onUp, true)
    canvas.addEventListener('dblclick', onDblClick, true)
    canvas.addEventListener('pointercancel', () => {
      downSample = null
    }, true)
    return () => {
      if (pendingCurveNodeTap != null) window.clearTimeout(pendingCurveNodeTap)
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('pointerup', onUp, true)
      canvas.removeEventListener('dblclick', onDblClick, true)
    }
  }, [placePointMode, placeRequireDblClick, paintHighlight, draftPreview, rendererNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    const next =
      projection === 'orthographic' ? runtime.orthographic : runtime.perspective
    if (next === runtime.camera) return
    next.position.copy(runtime.camera.position)
    next.quaternion.copy(runtime.camera.quaternion)
    next.up.copy(runtime.camera.up)
    runtime.head.removeFromParent()
    next.add(runtime.head)
    runtime.camera = next
    runtime.controls.object = next
    runtime.controls.update()
    publish(runtime, `view.projection-${projection}`)
  }, [projection])

  useEffect(() => {
    if (viewPreset && sceneRef.current) applyPreset(sceneRef.current, viewPreset)
  }, [viewPreset, viewPresetNonce])

  useEffect(() => {
    if (focusNonce > 0 && sceneRef.current) frameContent(sceneRef.current, false)
  }, [focusNonce])

  useEffect(() => {
    if (resetNonce > 0 && sceneRef.current) frameContent(sceneRef.current, true)
  }, [resetNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime || !tiltLock) return
    runtime.camera.up.set(0, 0, 1)
    runtime.controls.update()
    publish(runtime, 'view.tilt-lock')
  }, [tiltLock])

  useEffect(() => {
    motionModeRef.current = motionMode
    updateCanvasRuntime({
      lastAction: { id: `view.motion-${motionMode}`, result: 'changed' },
    })
  }, [motionMode])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    applyLighting(runtime, lightingIntensity)
    updateCanvasRuntime({
      lastAction: { id: 'view.lighting', result: 'changed' },
    })
  }, [lightingIntensity])

  const menuAnn =
    contextMenu != null
      ? annotations.find((a) => a.id === contextMenu.id) ?? null
      : null

  return (
    <div className="viewport-frame">
      <div
        className="viewport"
        ref={mountRef}
        data-testid="viewport"
        data-canvas-surface="viewport"
      />
      <div className="viewport-orientation-marker" aria-label="RAS orientation marker">
        <span>R</span><span>A</span><span>S</span>
      </div>
      {projection === 'orthographic' && (
        <div className="viewport-ruler" aria-label="View scale">
          <span /><small>scale</small>
        </div>
      )}
      {crosshairVisible && <div className="viewport-crosshair" aria-hidden="true" />}
      {status ? <div className="viewport-status">{status}</div> : null}
      {contextStatus !== 'ready' && (
        <div className="viewport-context-status" role="status">
          {contextStatus === 'lost' ? 'Rendering interrupted' : 'Restoring view'}
        </div>
      )}
      {menuAnn && contextMenu ? (
        <AnnotationViewportActionMenu
          ann={menuAnn}
          open
          x={contextMenu.x}
          y={contextMenu.y}
          onOpenChange={(open) => {
            if (!open) setContextMenu(null)
          }}
          onAnnotationAction={(action) => {
            onAnnotationAction?.(action)
            setContextMenu(null)
          }}
          onRequestDelete={() => {
            onAnnotationAction?.({ type: 'delete', id: menuAnn.id })
            setContextMenu(null)
          }}
        />
      ) : null}
    </div>
  )
}
