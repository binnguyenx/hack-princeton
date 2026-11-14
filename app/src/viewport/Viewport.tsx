import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

type Props = {
  navigate: boolean
  onCameraChange?: (
    position: [number, number, number],
    target: [number, number, number],
  ) => void
  mesh?: THREE.Object3D | null
  status?: string | null
}

export function Viewport({ navigate, onCameraChange, mesh, status }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    content: THREE.Group
  } | null>(null)

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef0f4)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 8000)
    camera.position.set(180, 140, 220)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 0)

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd0d4e0, 0.85)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 0.95)
    key.position.set(2.2, 3.4, 2.8)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xc9cbe8, 0.35)
    fill.position.set(-2, 0.5, -1)
    scene.add(fill)

    const content = new THREE.Group()
    scene.add(content)
    sceneRef.current = { renderer, scene, camera, controls, content }

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const onEnd = () => {
      onCameraChange?.(
        [camera.position.x, camera.position.y, camera.position.z],
        [controls.target.x, controls.target.y, controls.target.z],
      )
    }
    controls.addEventListener('end', onEnd)

    return () => {
      cancelAnimationFrame(raf)
      controls.removeEventListener('end', onEnd)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [onCameraChange])

  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.controls.enabled = navigate
  }, [navigate])

  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    while (s.content.children.length) {
      s.content.remove(s.content.children[0])
    }
    if (!mesh) return
    s.content.add(mesh)
    const box = new THREE.Box3().setFromObject(mesh)
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      s.controls.target.copy(center)
      const maxDim = Math.max(size.x, size.y, size.z)
      const dist = maxDim * 1.55
      s.camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.7)
      s.camera.near = Math.max(0.1, dist / 100)
      s.camera.far = dist * 20
      s.camera.updateProjectionMatrix()
      s.controls.update()
    }
  }, [mesh])

  return (
    <div className="viewport-frame">
      <div className="viewport" ref={mountRef} data-testid="viewport" />
      {status ? <div className="viewport-status">{status}</div> : null}
      <div className="viewport-hint">
        {navigate ? 'Drag to orbit · scroll to zoom · space+drag to pan' : 'Select Navigate to orbit the case'}
      </div>
    </div>
  )
}
