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
    expect(material.roughness).toBeLessThanOrEqual(0.6)
    expect(material.color.getHex()).not.toBe(0xffffff)
    // Dark enough to separate from the light studio ground (#e8eaee).
    expect(material.color.getHex()).toBe(0x6f7682)
  })

  it('re-tints the previous light bone wash for the soft monochrome studio', () => {
    const material = new MeshStandardMaterial({
      color: 0xc2c6d0,
      metalness: 0.04,
      roughness: 0.62,
    })
    const mesh = new Mesh(undefined, material)
    prepareViewportMaterials(mesh)
    expect(material.color.getHex()).toBe(0x6f7682)
  })
})
