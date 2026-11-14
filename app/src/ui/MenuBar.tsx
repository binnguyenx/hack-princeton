import { useEffect, useRef, useState } from 'react'
import type { CommandDef } from '../commands/registry'

type Props = {
  commands: CommandDef[]
  onRun: (id: CommandDef['id']) => void
}

const MENU_ORDER = ['File', 'Edit', 'Select', 'View', 'Object', 'Window']

export function MenuBar({ commands, onRun }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const onDocClick = (event: MouseEvent) => {
      const root = rootRef.current
      if (!root) return
      const target = event.target as Node
      if (!root.contains(target)) {
        setOpenMenu(null)
      }
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onEscape)
    }
  }, [openMenu])

  const groups = new Map<string, CommandDef[]>()
  for (const cmd of commands) {
    const [top] = cmd.menuPath.split('/')
    if (!top) continue
    const list = groups.get(top) ?? []
    list.push(cmd)
    groups.set(top, list)
  }

  return (
    <div className="canvas-menu-bar" role="menubar" aria-label="Canvas menu" ref={rootRef}>
      {MENU_ORDER.map((top) => (
        <div key={top} className="canvas-menu">
          <button
            type="button"
            className="canvas-menu__trigger"
            aria-expanded={openMenu === top}
            onClick={() => setOpenMenu((curr) => (curr === top ? null : top))}
          >
            {top}
          </button>
          {openMenu === top ? (
            <div className="canvas-menu__items">
              {(groups.get(top) ?? []).map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  className="canvas-menu__item"
                  disabled={!!cmd.disabledReason}
                  title={cmd.disabledReason}
                  onClick={() => {
                    onRun(cmd.id)
                    setOpenMenu(null)
                  }}
                >
                  <span>{cmd.label}</span>
                  {cmd.shortcut ? <kbd>{cmd.shortcut}</kbd> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
