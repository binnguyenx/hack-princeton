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

type Props = {
  active: ToolId
  onSelect: (id: ToolId) => void
  onAction: (id: ToolId) => void
  onApplyTransform: () => void
  message?: string | null
  signal?: boolean
}

const VIEW: { id: ToolId; label: string; hint: string }[] = [
  { id: 'navigate', label: 'Orbit', hint: 'Inspect' },
  { id: 'select', label: 'Select', hint: 'V' },
  { id: 'visibility', label: 'Visibility', hint: 'Show / hide' },
  { id: 'inspection', label: 'Clip plane', hint: 'Inspect' },
]

const EDIT: { id: ToolId; label: string; hint: string }[] = [
  { id: 'createCandidate', label: 'New candidate', hint: 'Copy source' },
  { id: 'transform', label: 'Transform', hint: 'T · Apply' },
  { id: 'restore', label: 'Restore', hint: '⌘Z' },
]

const FILE: { id: ToolId; label: string; hint: string }[] = [
  { id: 'save', label: 'Save', hint: '⌘S' },
  { id: 'open', label: 'Open', hint: 'Project' },
]

function Section({
  title,
  items,
  active,
  onSelect,
  onAction,
  onApplyTransform,
}: {
  title: string
  items: { id: ToolId; label: string; hint: string }[]
  active: ToolId
  onSelect: (id: ToolId) => void
  onAction: (id: ToolId) => void
  onApplyTransform: () => void
}) {
  return (
    <div className="rail-section">
      <p className="rail-label">{title}</p>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className={active === t.id ? 'tool active' : 'tool'}
          onClick={() => {
            if (t.id === 'transform') {
              onSelect(t.id)
              onApplyTransform()
              return
            }
            if (
              t.id === 'save' ||
              t.id === 'open' ||
              t.id === 'createCandidate' ||
              t.id === 'restore'
            ) {
              onAction(t.id)
            } else {
              onSelect(t.id)
            }
          }}
        >
          <span className="tool-label">{t.label}</span>
          <span className="tool-hint">{t.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function ToolRail({
  active,
  onSelect,
  onAction,
  onApplyTransform,
  message,
  signal,
}: Props) {
  return (
    <aside className="tool-rail" aria-label="Editor tools">
      <Section
        title="View"
        items={VIEW}
        active={active}
        onSelect={onSelect}
        onAction={onAction}
        onApplyTransform={onApplyTransform}
      />
      <Section
        title="Edit"
        items={EDIT}
        active={active}
        onSelect={onSelect}
        onAction={onAction}
        onApplyTransform={onApplyTransform}
      />
      <Section
        title="File"
        items={FILE}
        active={active}
        onSelect={onSelect}
        onAction={onAction}
        onApplyTransform={onApplyTransform}
      />
      {message ? (
        <p className={signal ? 'msg signal' : 'msg'} role="status">
          {message}
        </p>
      ) : null}
    </aside>
  )
}

export type { ToolId }
