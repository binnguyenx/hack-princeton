import {
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const manager = new LoadingManager()
const loader = new GLTFLoader(manager)
const assetCache = new Map<string, Promise<Object3D>>()

function normalizeAssetPath(assetPath: string): string {
  if (!assetPath) return assetPath
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) return assetPath
  if (assetPath.startsWith('/')) return assetPath
  return `/${assetPath}`
}

async function loadRootObject(url: string): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene ?? gltf.scenes?.[0]
        if (!root) {
          reject(new Error(`GLB scene missing: ${url}`))
          return
        }
        resolve(root)
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    )
  })
}

function cloneForRender(source: Object3D): Object3D {
  const cloned = source.clone(true)
  if (cloned.children.length === 0) {
    const wrap = new Group()
    wrap.add(cloned)
    return wrap
  }
  return cloned
}

/**
 * Sample GLBs often ship as fully metallic PBR with no environment map.
 * Without IBL those surfaces render near-black; clamp materials for this viewport.
 */
export function prepareViewportMaterials(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      if (material.metalness > 0.15) material.metalness = 0.04
      if (material.roughness > 0.85) material.roughness = 0.62
      // Slightly off-white so shaded recesses stay readable under wraparound lights.
      if (material.color.getHex() === 0xffffff) material.color.set(0xc2c6d0)
      material.envMapIntensity = 0
      material.needsUpdate = true
    }
  })
}

export async function loadDisplayMeshAsset(assetPath: string): Promise<Object3D> {
  const url = normalizeAssetPath(assetPath)
  if (!url) throw new Error('Display mesh asset path is empty')
  if (!assetCache.has(url)) {
    assetCache.set(url, loadRootObject(url))
  }
  const root = await assetCache.get(url)!
  const cloned = cloneForRender(root)
  prepareViewportMaterials(cloned)
  return cloned
}

