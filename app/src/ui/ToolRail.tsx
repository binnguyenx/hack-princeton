type ToolId =
  | 'select'
  | 'navigate'
  | 'visibility'
  | 'inspection'
  | 'createCandidate'
  | 'transform'
  | 'restore'
  | 'save'
  | 'open'

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select (V)' },
  { id: 'navigate', label: 'Navigate' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'inspection', label: 'Inspection plane' },
  { id: 'createCandidate', label: 'Create candidate' },
  { id: 'transform', label: 'Transform (T)' },
  { id: 'restore', label: 'Restore revision' },
  { id: 'save', label: 'Save' },
  { id: 'open', label: 'Open' },
]

type Props = {
  active: ToolId
  onSelect: (id: ToolId) => void
  onAction: (id: ToolId) => void
  message?: string | null
  signal?: boolean
}

export function ToolRail({ active, onSelect, onAction, message, signal }: Props) {
  return (
    <aside className="tool-rail" aria-label="Editor tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={active === t.id ? 'tool active' : 'tool'}
          onClick={() => {
            if (t.id === 'save' || t.id === 'open' || t.id === 'createCandidate' || t.id === 'restore') {
              onAction(t.id)
            } else {
              onSelect(t.id)
            }
          }}
        >
          {t.label}
        </button>
      ))}
      {message ? (
        <p className={signal ? 'msg signal' : 'msg'} role="status">
          {message}
        </p>
      ) : null}
    </aside>
  )
}

export type { ToolId }
