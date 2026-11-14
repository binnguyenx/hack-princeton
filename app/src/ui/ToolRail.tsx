import * as Tooltip from '@radix-ui/react-tooltip'
import {
  Rotate3d,
  MousePointer,
  Move3d,
  Undo2,
  Save,
  Check,
  X,
} from 'lucide-react'

export type ToolId =
  | 'select'
  | 'navigate'
  | 'transform'
  | 'restore'
  | 'save'

type Props = {
  active: ToolId
  onSelect: (id: ToolId) => void
  onAction: (id: ToolId) => void
  onApplyTransform: () => void
  onCancelTransform?: () => void
  message?: string | null
  signal?: boolean
  isCandidateActive?: boolean
}

type ToolConfig = {
  id: ToolId
  label: string
  shortcut: string
  description: string
  icon: typeof Rotate3d
  isAction?: boolean
  requiresCandidate?: boolean
}

const TOOLS: ToolConfig[] = [
  {
    id: 'navigate',
    label: 'Orbit / Navigate',
    shortcut: 'Space + Drag',
    description: 'Rotate, pan, and inspect the 3D cranial anatomy.',
    icon: Rotate3d,
  },
  {
    id: 'select',
    label: 'Select Object',
    shortcut: 'V',
    description: 'Select and highlight an anatomical volume or candidate.',
    icon: MousePointer,
  },
  {
    id: 'transform',
    label: 'Transform Implant',
    shortcut: 'T',
    description: 'Position and align the active candidate repair plate over the cranial defect.',
    icon: Move3d,
    requiresCandidate: true,
  },
  {
    id: 'restore',
    label: 'Restore Revision',
    shortcut: '⌘Z',
    description: 'Roll back candidate implant to its previous recorded pose.',
    icon: Undo2,
    isAction: true,
    requiresCandidate: true,
  },
  {
    id: 'save',
    label: 'Save Project',
    shortcut: '⌘S',
    description: 'Persist all cases, candidate poses, and revisions.',
    icon: Save,
    isAction: true,
  },
]

export function ToolRail({
  active,
  onSelect,
  onAction,
  onApplyTransform,
  onCancelTransform,
  message,
  signal,
  isCandidateActive,
}: Props) {
  const isTransforming = active === 'transform'

  return (
    <Tooltip.Provider delayDuration={200}>
      <aside className="studio-tool-rail" aria-label="3D Studio Tools">
        <div className="studio-tool-group">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            const isActive = active === tool.id
            const isDisabled = tool.requiresCandidate && !isCandidateActive

            return (
              <Tooltip.Root key={tool.id}>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className={`studio-tool-btn ${isActive ? 'is-active' : ''}`}
                    disabled={isDisabled}
                    onClick={() => {
                      if (tool.isAction) {
                        onAction(tool.id)
                      } else {
                        onSelect(tool.id)
                      }
                    }}
                    aria-label={tool.label}
                  >
                    <Icon size={18} />
                    <span className="studio-tool-shortcut">{tool.id.slice(0, 5)}</span>
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip-content" side="right" sideOffset={8}>
                    <div className="tooltip-title">
                      <strong>{tool.label}</strong>
                      <span className="tooltip-kbd">{tool.shortcut}</span>
                    </div>
                    <p className="tooltip-desc">{tool.description}</p>
                    {isDisabled ? (
                      <p className="tooltip-hint">Requires an active candidate tab</p>
                    ) : null}
                    <Tooltip.Arrow className="tooltip-arrow" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )
          })}
        </div>

        {isTransforming ? (
          <div className="studio-armed-bar">
            <div className="studio-armed-label">
              <strong>Transform Mode Armed</strong>
              <span>Adjust candidate plate position</span>
            </div>
            <div className="studio-armed-actions">
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                onClick={onCancelTransform}
                title="Cancel Transform (Esc)"
              >
                <X size={12} />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                className="btn btn--primary btn--xs"
                onClick={onApplyTransform}
                title="Commit Transform to Revision"
              >
                <Check size={12} />
                <span>Apply</span>
              </button>
            </div>
          </div>
        ) : null}

        {message ? (
          <div className={`studio-toast ${signal ? 'studio-toast--signal' : ''}`}>
            <span>{message}</span>
          </div>
        ) : null}
      </aside>
    </Tooltip.Provider>
  )
}
