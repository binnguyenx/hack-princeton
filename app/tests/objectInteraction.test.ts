import { expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, OrthographicCamera } from 'three'
import { hitTestObject, SelectionGesture } from '../src/viewport/objectInteraction'

const bounds = { left: 20, top: 40, width: 200, height: 100 }
const center = { clientX: 120, clientY: 90 }

it('raycasts actual visible mesh geometry with perspective and orthographic cameras', () => {
  const root = new Group()
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
  root.add(mesh)
  const perspective = new PerspectiveCamera(45, 2, .1, 100)
  const orthographic = new OrthographicCamera(-4, 4, 2, -2, .1, 100)
  for (const camera of [perspective, orthographic]) {
    camera.position.z = 5
    camera.lookAt(0, 0, 0)
    expect(hitTestObject(camera, root, center, bounds)).toBe(true)
    expect(hitTestObject(camera, root, { clientX: 21, clientY: 41 }, bounds)).toBe(false)
    root.visible = false
    expect(hitTestObject(camera, root, center, bounds)).toBe(false)
    root.visible = true
    mesh.visible = false
    expect(hitTestObject(camera, root, center, bounds)).toBe(false)
    mesh.visible = true
  }
})

it('accepts only unmodified clicks on the same loaded object, excluding drags and cancellations', () => {
  const root = new Group()
  const gesture = new SelectionGesture()
  const down = { pointerId: 1, button: 0, clientX: 50, clientY: 50 }
  gesture.begin(down, root, 'object', true)
  expect(gesture.finish(down, root, 'object', true)).toBe(true)
  gesture.begin(down, root, 'object', true)
  gesture.move({ ...down, clientX: 70 })
  expect(gesture.finish(down, root, 'object', true)).toBe(false)
  gesture.begin({ ...down, ctrlKey: true }, root, 'object', true)
  expect(gesture.finish(down, root, 'object', true)).toBe(false)
  gesture.begin(down, root, 'object', true)
  expect(gesture.finish(down, new Group(), 'object', true)).toBe(false)
  gesture.begin(down, root, 'object', true)
  expect(gesture.finish(down, root, 'other-object', true)).toBe(false)
  gesture.begin(down, root, 'object', true)
  gesture.cancel()
  expect(gesture.finish(down, root, 'object', true)).toBe(false)
  gesture.begin(down, root, 'object', false)
  expect(gesture.finish(down, root, 'object', true)).toBe(false)
})
