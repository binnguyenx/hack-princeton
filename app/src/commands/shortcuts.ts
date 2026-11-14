import type { CommandId } from './registry'

type Key = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing' | 'defaultPrevented'>
export function resolveShortcut(event: Key, context: { canvas: boolean; editable: boolean; dialog: boolean; threeD: boolean }): CommandId | null {
  if (event.isComposing || event.defaultPrevented || context.dialog || event.altKey) return null
  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()
  if (mod && key === 's' && !event.shiftKey) return 'file.saveProject'
  if (context.editable || !context.canvas) return null
  if (mod) {
    if (key === 'z') return event.shiftKey ? 'edit.redo' : 'edit.undo'
    if (event.shiftKey) return null
    if (key === 'backspace') return 'object.restoreRevision'
    if (key === 'k') return 'window.commandSearch'
    if (key === 'b' && context.threeD) return 'view.toggleTiltLock'
    return null
  }
  if (key === 'escape') return 'object.cancelDraft'
  if (key === 'enter') return 'object.applyDraft'
  if (!event.shiftKey) {
    const command = ({ n: 'tool.navigate', v: 'tool.select', t: 'tool.transform', f: 'view.focus', h: 'view.toggleVisibility' } as const)[key as 'n']
    if (command && context.threeD) return command
  }
  if (!context.threeD) return null
  if (event.code === 'Numpad0' || key === 'insert') return 'view.reset'
  if (event.code === 'Numpad1' || key === 'end' || key === '1') return event.shiftKey ? 'view.standardPosterior' : 'view.standardAnterior'
  if (event.code === 'Numpad3' || key === 'pagedown' || key === '3') return event.shiftKey ? 'view.standardRight' : 'view.standardLeft'
  if (event.code === 'Numpad7' || key === 'home' || key === '7') return event.shiftKey ? 'view.standardInferior' : 'view.standardSuperior'
  return null
}
