import * as THREE from 'three'
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js'
import type { SpatialMeta } from '../domain/types'
import { decodeNrrdVoxels } from './nrrdVoxels'

type VolumeGrid = {
  data: Uint8Array
  x: number
  y: number
  z: number
}

function downsampleBinaryVolume(
  voxels: Uint8Array,
  sx: number,
  sy: number,
  sz: number,
  maxDim = 256,
): VolumeGrid {
  let maxValue = 0
  for (let i = 0; i < voxels.length; i++) {
    if (voxels[i] > maxValue) maxValue = voxels[i]
    if (maxValue >= 2) break
  }
  // SkullBreak masks are often binary 0/1. Data3DTexture with UnsignedByteType
  // normalizes to 0..1 by dividing by 255, so map 1 -> 255 for stable iso thresholding.
  const expandBinary = maxValue <= 1

  const step = Math.max(1, Math.ceil(Math.max(sx, sy, sz) / maxDim))
  if (step === 1) {
    if (!expandBinary) return { data: voxels, x: sx, y: sy, z: sz }
    const normalized = new Uint8Array(voxels.length)
    for (let i = 0; i < voxels.length; i++) normalized[i] = voxels[i] > 0 ? 255 : 0
    return { data: normalized, x: sx, y: sy, z: sz }
  }

  const dx = Math.ceil(sx / step)
  const dy = Math.ceil(sy / step)
  const dz = Math.ceil(sz / step)
  const data = new Uint8Array(dx * dy * dz)
  let i = 0
  for (let z = 0; z < dz; z++) {
    const z0 = Math.min(sz - 1, z * step)
    for (let y = 0; y < dy; y++) {
      const y0 = Math.min(sy - 1, y * step)
      for (let x = 0; x < dx; x++) {
        const x0 = Math.min(sx - 1, x * step)
        const v = voxels[x0 + y0 * sx + z0 * sx * sy]
        data[i++] = expandBinary ? (v > 0 ? 255 : 0) : v
      }
    }
  }
  return { data, x: dx, y: dy, z: dz }
}

export function volumeToIsoMesh(
  volumeBytes: Uint8Array,
  spatial: SpatialMeta,
  options?: { maxTextureDim?: number; isoThreshold?: number },
): THREE.Mesh {
  if (!spatial?.sizes || spatial.sizes.length < 3) {
    throw new Error('spatial.sizes required (got ' + JSON.stringify(spatial) + ')')
  }
  const [sx, sy, sz] = spatial.sizes
  const { voxels } = decodeNrrdVoxels(volumeBytes)
  const expected = sx * sy * sz
  if (voxels.length < expected) {
    throw new Error(`Voxel buffer short: ${voxels.length} < ${expected}`)
  }

  const grid = downsampleBinaryVolume(
    voxels.subarray(0, expected),
    sx,
    sy,
    sz,
    options?.maxTextureDim ?? 256,
  )

  const texture = new THREE.Data3DTexture(grid.data, grid.x, grid.y, grid.z)
  texture.format = THREE.RedFormat
  texture.type = THREE.UnsignedByteType
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.unpackAlignment = 1
  texture.needsUpdate = true

  const shader = VolumeRenderShader1
  const uniforms = THREE.UniformsUtils.clone(shader.uniforms)
  ;(uniforms.u_data.value as THREE.Data3DTexture) = texture
  ;(uniforms.u_size.value as THREE.Vector3).set(grid.x, grid.y, grid.z)
  ;(uniforms.u_clim.value as THREE.Vector2).set(0, 1)
  ;(uniforms.u_renderstyle.value as number) = 1 // ISO
  ;(uniforms.u_renderthreshold.value as number) = options?.isoThreshold ?? 0.42

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    side: THREE.BackSide,
    transparent: false,
  })

  const [spx, spy, spz] = spatial.spacings
  const width = sx * spx
  const height = sy * spy
  const depth = sz * spz
  const geometry = new THREE.BoxGeometry(width, height, depth)

  return new THREE.Mesh(geometry, mat)
}

