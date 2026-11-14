import { useState } from 'react'
import type { PlacementDelta } from '../geometry/rigidPlacement'

const fields = [
  ['x', 'Translate X (mm)'], ['y', 'Translate Y (mm)'], ['z', 'Translate Z (mm)'],
  ['rx', 'Rotate X (degrees)'], ['ry', 'Rotate Y (degrees)'], ['rz', 'Rotate Z (degrees)'],
] as const

export function RigidPlacementControls({ onChange, disabled }: {
  onChange: (delta: PlacementDelta) => void; disabled: boolean
}) {
  const [values, setValues] = useState({ x: '0', y: '0', z: '0', rx: '0', ry: '0', rz: '0' })
  return (
    <section className="inspector-section placement-section" aria-label="Manual rigid placement">
      <h4>Manual placement</h4>
      <p className="muted">Editor axes · rotation about candidate origin. Preview only until Apply.</p>
      <fieldset className="placement-grid" disabled={disabled}>
        <legend className="placement-legend">Placement deltas</legend>
        {fields.map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input type="number" step={key.startsWith('r') ? '1' : '0.1'} value={values[key]}
              onChange={(event) => {
                const next = { ...values, [key]: event.target.value }
                setValues(next)
                const number = (value: string) => value.trim() ? Number(value) : NaN
                onChange({ x: number(next.x), y: number(next.y), z: number(next.z),
                  rx: number(next.rx), ry: number(next.ry), rz: number(next.rz) })
              }} />
          </label>
        ))}
      </fieldset>
    </section>
  )
}
