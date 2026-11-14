import { describe, expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial, Group } from 'three'
import { prepareViewportMaterials } from '../src/geometry/displayMesh'

describe('prepareViewportMaterials', () => {
  it('clamps fully metallic sample materials so they are visible without an environment map', () => {
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 1,
    })
    const mesh = new Mesh(undefined, material)
    const root = new Group()
    root.add(mesh)

    prepareViewportMaterials(root)

    expect(material.metalness).toBeLessThanOrEqual(0.05)
    expect(material.roughness).toBeLessThanOrEqual(0.65)
    expect(material.color.getHex()).not.toBe(0xffffff)
  })
})
