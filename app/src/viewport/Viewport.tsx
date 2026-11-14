import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

type Props = {
  /** When true, orbit controls enabled (navigate mode). */
  navigate: boolean
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void
  mesh?: THREE.Object3D | null
}

export function Viewport({ navigate, onCameraChange, mesh }: Props) {
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
    scene.background = new THREE.Color(0xf4f5f7)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    camera.position.set(0, 0, 400)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const light = new THREE.DirectionalLight(0xffffff, 1.1)
    light.position.set(2, 3, 4)
    scene.add(light)
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
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
      const c = s.content.children[0]
      s.content.remove(c)
    }
    if (mesh) s.content.add(mesh)
  }, [mesh])

  return <div className="viewport" ref={mountRef} data-testid="viewport" />
}
