import { expect, it } from 'vitest'
import { resolveShortcut } from '../src/commands/shortcuts'

const key = (name: string, patch = {}) => ({ key: name, code: '', ctrlKey: false, metaKey: false,
  shiftKey: false, altKey: false, isComposing: false, defaultPrevented: false, ...patch })
const context = { canvas: true, editable: false, dialog: false, threeD: true }
it('distinguishes redo, restore and platform standard directions without modifier fallthrough', () => {
  expect(resolveShortcut(key('z', { metaKey: true, shiftKey: true }), context)).toBe('edit.redo')
  expect(resolveShortcut(key('Backspace', { ctrlKey: true }), context)).toBe('object.restoreRevision')
  expect(resolveShortcut(key('End'), context)).toBe('view.standardAnterior')
  expect(resolveShortcut(key('Home', { shiftKey: true }), context)).toBe('view.standardInferior')
  expect(resolveShortcut(key('3', { code: 'Numpad3', shiftKey: true }), context)).toBe('view.standardRight')
  expect(resolveShortcut(key('0', { code: 'Numpad0' }), context)).toBe('view.reset')
  expect(resolveShortcut(key('h', { metaKey: true }), context)).toBeNull()
})
it('protects text editing, composition, dialogs and inactive view ownership', () => {
  expect(resolveShortcut(key('z', { ctrlKey: true }), { ...context, editable: true })).toBeNull()
  expect(resolveShortcut(key('t'), { ...context, editable: true })).toBeNull()
  expect(resolveShortcut(key('s', { ctrlKey: true }), { ...context, editable: true })).toBe('file.saveProject')
  expect(resolveShortcut(key('h', { isComposing: true }), context)).toBeNull()
  expect(resolveShortcut(key('h'), { ...context, dialog: true })).toBeNull()
  expect(resolveShortcut(key('End'), { ...context, threeD: false })).toBeNull()
  expect(resolveShortcut(key('z', { ctrlKey: true }), { ...context, canvas: false })).toBeNull()
})
