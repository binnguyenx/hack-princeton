import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Mat4 } from '../domain/types'
import { updateCanvasRuntime } from '../debug/bridge'
import { prepareViewportMaterials } from '../geometry/displayMesh'
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
  if (box.isEmpty()) return
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
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Runtime | null>(null)
  const cameraChangeRef = useRef(onCameraChange)
  const motionModeRef = useRef(motionMode)
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

  return (
    <div className="viewport-frame">
      <div className="viewport" ref={mountRef} data-testid="viewport" />
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
    </div>
  )
}
