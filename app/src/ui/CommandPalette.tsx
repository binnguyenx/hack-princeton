import { useEffect, useMemo, useRef, useState } from 'react'
import { matchesCommand, type CommandDef } from '../commands/registry'

type Props = {
  open: boolean
  commands: CommandDef[]
  onClose: () => void
  onRun: (id: CommandDef['id']) => void
}

export function CommandPalette({ open, commands, onClose, onRun }: Props) {
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => commands.filter((cmd) => matchesCommand(cmd, query)),
    [commands, query],
  )

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        setQuery('')
      }
    }
    const onMouseDown = (event: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return
      if (!panel.contains(event.target as Node)) {
        onClose()
        setQuery('')
      }
    }
    window.addEventListener('keydown', onEscape)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onEscape)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="command-palette" role="dialog" aria-label="Command search">
      <div className="command-palette__panel" ref={panelRef}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands..."
          aria-label="Search commands"
        />
        <div className="command-palette__list">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              className="command-palette__item"
              disabled={!!cmd.disabledReason}
              title={cmd.disabledReason}
              onClick={() => {
                onRun(cmd.id)
                onClose()
                setQuery('')
              }}
            >
              <span>{cmd.label}</span>
              <small>{cmd.menuPath}</small>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--secondary btn--xs" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
