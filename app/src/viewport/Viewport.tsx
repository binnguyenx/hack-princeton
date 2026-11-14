import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Mat4 } from '../domain/types'
import { updateCanvasRuntime, type CanvasRuntimeSnapshot } from '../debug/bridge'
import { prepareViewportMaterials } from '../geometry/displayMesh'
import { getSlicerMouseButtons } from './navigationPolicy'
import { rulerScale, perspectiveDistance, perspectiveViewHeight } from './cameraMetrics'
import { hitTestObject, SelectionGesture } from './objectInteraction'

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
  diagnosticsEnabled?: boolean
  calibratedMm?: boolean
  mesh?: THREE.Object3D | null
  objectId?: string
  visible?: boolean
  selectedObjectId?: string | null
  selectionEnabled?: boolean
  onSelectObject?: (objectId: string | null) => void
  onShowObject?: () => void
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
}

type Runtime = {
  renderer: THREE.WebGLRenderer
  perspective: THREE.PerspectiveCamera
  orthographic: THREE.OrthographicCamera
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  controls: OrbitControls
  content: THREE.Group
  mount: HTMLDivElement
  objectId?: string
  selectedObjectId: string | null
  selectionOutline?: THREE.BoxHelper
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  key: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  head: THREE.DirectionalLight
}

const BACKGROUND_COLOR = 0x111318
const DEFAULT_DISTANCE = 3
const MIN_NEAR = 0.01
const FRAMING_MARGIN = 1.3
// Keep wraparound lights, but stay well below overexposure at slider mid.
const BASE_AMBIENT = 0.28
const BASE_HEMI = 0.75
const BASE_KEY = 1.15
const BASE_FILL = 0.4
const BASE_HEAD = 0.3
/** Mid-slider default: readable form with visible recesses. */
export const DEFAULT_LIGHTING_INTENSITY = 1

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

function cameraSnapshot(runtime: Runtime): CanvasRuntimeSnapshot['camera'] {
  return {
    position: runtime.camera.position.toArray(), target: runtime.controls.target.toArray(),
    projection: runtime.camera instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective',
    near: runtime.camera.near, far: runtime.camera.far,
    quaternion: runtime.camera.quaternion.toArray(), zoom: runtime.camera.zoom,
    viewportHeight: runtime.mount.clientHeight,
    viewHeight: runtime.camera instanceof THREE.OrthographicCamera
      ? (runtime.camera.top - runtime.camera.bottom) / runtime.camera.zoom
      : perspectiveViewHeight(runtime.camera.position.distanceTo(runtime.controls.target), runtime.perspective.fov, runtime.camera.zoom),
  }
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
    camera: cameraSnapshot(runtime),
    visibleObjectIds: object?.visible && runtime.objectId ? [runtime.objectId] : [],
    selectedObjectId: runtime.selectedObjectId,
    highlightedObjectIds: runtime.selectionOutline && object?.visible && runtime.objectId ? [runtime.objectId] : [],
    objectWorldMatrices,
    webglStatus: runtime.renderer.getContext().isContextLost() ? 'lost' : 'ready',
    lastAction: { id: actionId, result: 'changed' },
  })
}

function clearOutline(runtime: Runtime) {
  runtime.selectionOutline?.removeFromParent()
  runtime.selectionOutline?.dispose()
  runtime.selectionOutline = undefined
}

function presentObject(runtime: Runtime, visible: boolean, selectedObjectId: string | null) {
  clearOutline(runtime)
  const object = runtime.content.children[0]
  if (object) object.visible = visible
  runtime.selectedObjectId = object?.visible && selectedObjectId === runtime.objectId ? selectedObjectId : null
  if (object && runtime.selectedObjectId) {
    object.updateWorldMatrix(true, true)
    // DESIGN accent. A separate helper preserves cached geometry and materials.
    runtime.selectionOutline = new THREE.BoxHelper(object, 0x0052cc)
    runtime.content.parent?.add(runtime.selectionOutline)
  }
}

function frameContent(runtime: Runtime, resetOrientation: boolean) {
  const box = new THREE.Box3().setFromObject(runtime.content)
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 1)
  const distance = resetOrientation ? maxDimension * DEFAULT_DISTANCE
    : runtime.camera.position.distanceTo(runtime.controls.target)
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
  if (resetOrientation) {
    runtime.orthographic.zoom = 1
    configureOrthographic(
    runtime.orthographic,
    runtime.mount.clientWidth,
    runtime.mount.clientHeight,
    maxDimension * FRAMING_MARGIN,
    )
  }
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
  diagnosticsEnabled = false,
  calibratedMm = false,
  mesh,
  objectId,
  visible = true,
  selectedObjectId = null,
  selectionEnabled = false,
  onSelectObject,
  onShowObject,
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
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const diagnosticsRef = useRef<HTMLDivElement>(null)
  const diagnosticsEnabledRef = useRef(diagnosticsEnabled)
  diagnosticsEnabledRef.current = diagnosticsEnabled
  const calibratedRef = useRef(calibratedMm)
  const tiltLockRef = useRef(tiltLock)
  calibratedRef.current = calibratedMm
  tiltLockRef.current = tiltLock
  const sceneRef = useRef<Runtime | null>(null)
  const selectionRef = useRef({ enabled: selectionEnabled, callback: onSelectObject })
  const presentationRef = useRef({ visible, selectedObjectId })
  const cameraChangeRef = useRef(onCameraChange)
  const motionModeRef = useRef(motionMode)
  const contextStatusChangeRef = useRef(onContextStatusChange)
  const [contextStatus, setContextStatus] = useState<'ready' | 'lost' | 'restoring'>(
    'ready',
  )

  useEffect(() => {
    selectionRef.current = { enabled: selectionEnabled, callback: onSelectObject }
    presentationRef.current = { visible, selectedObjectId }
  }, [selectionEnabled, onSelectObject, visible, selectedObjectId])

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
    renderer.toneMappingExposure = 1.2
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const perspective = new THREE.PerspectiveCamera(45, 1, MIN_NEAR, 8000)
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
    const hemi = new THREE.HemisphereLight(0xf5f7fb, 0x4a5568, BASE_HEMI)
    const key = new THREE.DirectionalLight(0xffffff, BASE_KEY)
    key.position.set(4, 6, 8)
    const fill = new THREE.DirectionalLight(0xd7e3ff, BASE_FILL)
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
      perspective,
      orthographic,
      camera,
      controls,
      content,
      mount,
      objectId,
      selectedObjectId: null,
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
      renderer.setSize(width, height)
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
    let diagnosticStart = performance.now(), diagnosticFrames = 0
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
      if (tiltLockRef.current) runtime.camera.up.set(0, 0, 1)
      controls.update()
      const scale = calibratedRef.current && runtime.camera instanceof THREE.OrthographicCamera
        ? rulerScale(runtime.camera.top - runtime.camera.bottom, runtime.camera.zoom, mount.clientHeight) : null
      const ruler = rulerRef.current
      if (ruler) {
        ruler.style.display = scale ? 'block' : 'none'
        if (scale) {
          ruler.style.width = `${scale.pixels}px`
          ruler.dataset.millimetres = String(scale.millimetres)
          ruler.dataset.pixelsPerMm = String(scale.pixelsPerMm)
          ruler.querySelector('small')!.textContent = `${Number(scale.millimetres.toPrecision(5))} mm`
        }
      }
      updateCanvasRuntime({ camera: cameraSnapshot(runtime), ruler: scale })
      renderer.render(scene, runtime.camera)
      diagnosticFrames++
      const now = performance.now()
      if (now - diagnosticStart >= 500) {
        const diagnostics = { loopFps: diagnosticFrames * 1000 / (now - diagnosticStart),
          drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
        updateCanvasRuntime({ diagnostics })
        if (diagnosticsRef.current) diagnosticsRef.current.textContent = `Render loop ${diagnostics.loopFps.toFixed(1)} fps · ${diagnostics.drawCalls} draws · ${diagnostics.triangles} triangles`
        diagnosticStart = now; diagnosticFrames = 0
      }
      if (diagnosticsRef.current) diagnosticsRef.current.hidden = !diagnosticsEnabledRef.current
      frame = requestAnimationFrame(render)
    }
    render()

    const canvas = renderer.domElement
    canvas.tabIndex = 0
    const activate = () => { canvas.focus({ preventScroll: true }); updateCanvasRuntime({ activeView: 'three-d' }) }
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      const sign = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1
      const offset = runtime.camera.position.clone().sub(runtime.controls.target)
      const axis = new THREE.Vector3(horizontal ? 1 : 0, horizontal ? 0 : 1, 0).applyQuaternion(runtime.camera.quaternion)
      if (event.shiftKey) {
        const delta = axis.multiplyScalar(offset.length() * .03 * sign)
        runtime.camera.position.add(delta); runtime.controls.target.add(delta)
      } else {
        const rotationAxis = horizontal ? new THREE.Vector3(0,0,1) : new THREE.Vector3(1,0,0).applyQuaternion(runtime.camera.quaternion)
        offset.applyAxisAngle(rotationAxis, sign * Math.PI / 36)
        runtime.camera.position.copy(runtime.controls.target).add(offset)
      }
      runtime.controls.update(); publish(runtime, event.shiftKey ? 'view.keyboard-pan' : 'view.keyboard-rotate')
      cameraChangeRef.current?.(runtime.camera.position.toArray(), runtime.controls.target.toArray())
    }
    canvas.addEventListener('pointerdown', activate, true)
    canvas.addEventListener('keydown', keyboard)
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
      if (!rolling || tiltLockRef.current) return
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
    const gesture = new SelectionGesture()
    const selectionDown = (event: PointerEvent) => {
      gesture.begin(event, runtime.content.children[0], runtime.objectId,
        selectionRef.current.enabled && !renderer.getContext().isContextLost())
    }
    const selectionMove = (event: PointerEvent) => gesture.move(event)
    const selectionUp = (event: PointerEvent) => {
      const root = runtime.content.children[0]
      if (!gesture.finish(event, root, runtime.objectId,
        selectionRef.current.enabled && !renderer.getContext().isContextLost()) || !root) return
      const bounds = canvas.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return
      const hit = hitTestObject(runtime.camera, root, event, bounds)
      selectionRef.current.callback?.(hit ? runtime.objectId ?? null : null)
    }
    const selectionCancel = () => gesture.cancel()
    canvas.addEventListener('pointerdown', selectionDown, true)
    canvas.addEventListener('pointermove', selectionMove, true)
    canvas.addEventListener('pointerup', selectionUp, true)
    canvas.addEventListener('pointercancel', selectionCancel, true)
    canvas.addEventListener('lostpointercapture', selectionCancel, true)
    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('pointermove', onPointerMove, true)
    canvas.addEventListener('pointerup', endRoll, true)
    canvas.addEventListener('pointercancel', endRoll, true)
    publish(runtime, 'renderer.ready')

    return () => {
      gesture.cancel()
      clearOutline(runtime)
      canvas.removeEventListener('pointerdown', selectionDown, true)
      canvas.removeEventListener('pointermove', selectionMove, true)
      canvas.removeEventListener('pointerup', selectionUp, true)
      canvas.removeEventListener('pointercancel', selectionCancel, true)
      canvas.removeEventListener('lostpointercapture', selectionCancel, true)
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('end', onControlEnd)
      controls.dispose()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      canvas.removeEventListener('pointerdown', activate, true)
      canvas.removeEventListener('keydown', keyboard)
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('pointermove', onPointerMove, true)
      canvas.removeEventListener('pointerup', endRoll, true)
      canvas.removeEventListener('pointercancel', endRoll, true)
      renderer.dispose()
      renderer.forceContextLoss()
      mount.removeChild(canvas)
      sceneRef.current = null
    }
  }, [rendererNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    const keepCamera = runtime.objectId === objectId && runtime.content.children.length > 0
    runtime.objectId = objectId
    clearOutline(runtime)
    runtime.selectedObjectId = null
    runtime.content.clear()
    if (!mesh) {
      publish(runtime, 'content.clear')
      return
    }
    prepareViewportMaterials(mesh)
    runtime.content.add(mesh)
    presentObject(runtime, presentationRef.current.visible, presentationRef.current.selectedObjectId)
    if (keepCamera) publish(runtime, 'content.update')
    else frameContent(runtime, true)
  }, [mesh, objectId, rendererNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    presentObject(runtime, visible, selectedObjectId)
    publish(runtime, 'view.presentation')
  }, [visible, selectedObjectId, rendererNonce])

  useEffect(() => {
    const runtime = sceneRef.current
    if (!runtime) return
    const next =
      projection === 'orthographic' ? runtime.orthographic : runtime.perspective
    if (next === runtime.camera) return
    const current = runtime.camera
    const distance = current.position.distanceTo(runtime.controls.target)
    if (next instanceof THREE.OrthographicCamera) {
      next.zoom = 1
      configureOrthographic(next, runtime.mount.clientWidth, runtime.mount.clientHeight,
        perspectiveViewHeight(distance, runtime.perspective.fov, current.zoom))
      next.position.copy(current.position)
    } else {
      const height = (runtime.orthographic.top - runtime.orthographic.bottom) / current.zoom
      const nextDistance = perspectiveDistance(height, next.fov, next.zoom)
      const direction = current.position.clone().sub(runtime.controls.target).normalize()
      next.position.copy(runtime.controls.target).addScaledVector(direction, nextDistance)
    }
    next.quaternion.copy(runtime.camera.quaternion)
    next.up.copy(runtime.camera.up)
    runtime.head.removeFromParent()
    next.add(runtime.head)
    runtime.camera = next
    runtime.controls.object = next
    updateCanvasRuntime({ ruler: null })
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

  return (
    <div className="viewport-frame">
      <div className="viewport" ref={mountRef} data-testid="viewport" onPointerDown={() => updateCanvasRuntime({ activeView: 'three-d' })} />
      <div className="viewport-orientation-marker" aria-label="RAS orientation marker">
        <span>R</span><span>A</span><span>S</span>
      </div>
      <div ref={diagnosticsRef} className="viewport-diagnostics" aria-label="Rendering diagnostics" hidden={!diagnosticsEnabled}>Measuring render loop…</div>
      <div ref={rulerRef} className="viewport-ruler" aria-label="Orthographic ruler in millimetres" style={{ display: 'none' }}>
        <span /><small />
      </div>
      {crosshairVisible && <div className="viewport-crosshair" aria-hidden="true" />}
      {mesh && !visible ? (
        <div className="viewport-hidden-state" role="status">
          <span>Object hidden</span>
          <button type="button" className="btn btn--secondary btn--xs" onClick={onShowObject}>Show object</button>
        </div>
      ) : null}
      {status ? <div className="viewport-status">{status}</div> : null}
      {contextStatus !== 'ready' && (
        <div className="viewport-context-status" role="status">
          {contextStatus === 'lost' ? 'Rendering interrupted' : 'Restoring view'}
        </div>
      )}
    </div>
  )
}
