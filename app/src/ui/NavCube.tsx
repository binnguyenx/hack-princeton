import type { ViewPreset } from '../viewport/Viewport'

type Props = {
  onSelect: (preset: ViewPreset) => void
}

const PRESETS: Array<{ id: ViewPreset; label: string }> = [
  { id: 'anterior', label: 'A' },
  { id: 'posterior', label: 'P' },
  { id: 'left', label: 'L' },
  { id: 'right', label: 'R' },
  { id: 'superior', label: 'S' },
  { id: 'inferior', label: 'I' },
]

export function NavCube({ onSelect }: Props) {
  return (
    <div className="nav-cube" aria-label="Navigation cube">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="nav-cube__face"
          title={preset.id}
          onClick={() => onSelect(preset.id)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
