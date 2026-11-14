type Props = {
  isDraftActive: boolean
  canRestore: boolean
  isCandidateActive: boolean
  onApply: () => void
  onCancel: () => void
  onRestore: () => void
  onSave: () => void
  onFocus: () => void
  onToggleVisibility: () => void
}

export function OptionsBar({
  isDraftActive,
  canRestore,
  isCandidateActive,
  onApply,
  onCancel,
  onRestore,
  onSave,
  onFocus,
  onToggleVisibility,
}: Props) {
  return (
    <div className="canvas-options-bar" aria-label="Canvas options">
      <button
        type="button"
        className="btn btn--primary btn--xs"
        disabled={!isDraftActive}
        title={isDraftActive ? 'Apply current draft' : 'Start transform mode to enable Apply'}
        onClick={onApply}
      >
        Apply
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--xs"
        disabled={!isDraftActive}
        title={isDraftActive ? 'Cancel current draft' : 'No draft is active'}
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--xs"
        disabled={!canRestore}
        title={
          canRestore
            ? 'Restore previous revision'
            : isCandidateActive
              ? 'No earlier revision recorded yet'
              : 'Open a candidate tab to restore'
        }
        onClick={onRestore}
      >
        Restore
      </button>
      <div className="canvas-options-bar__divider" />
      <button type="button" className="btn btn--secondary btn--xs" onClick={onFocus}>
        Focus
      </button>
      <button type="button" className="btn btn--secondary btn--xs" onClick={onToggleVisibility}>
        Visibility
      </button>
      <button type="button" className="btn btn--secondary btn--xs" onClick={onSave}>
        Save
      </button>
    </div>
  )
}
