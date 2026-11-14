import { useState } from 'react'
import type { VoxelParameters } from '../api/voxelOperations'

type Props = { sizes: number[]; disabledReason?: string; pending: boolean; onExecute: (parameters: VoxelParameters) => void }
export function VoxelControls({ sizes, disabledReason, pending, onExecute }: Props) {
  const [bounds, setBounds] = useState<string[][]>([['0','0','0'], sizes.map((size) => String(Math.min(size - 1, 8)))])
  const [operation, setOperation] = useState('fill')
  const [plane, setPlane] = useState(String((sizes[0] - 1) / 2))
  const parsed = bounds.map((corner) => corner.map((n) => n.trim() ? Number(n) : NaN)) as [number[], number[]]
  const valid = parsed.every((corner, side) => corner.every((value, axis) => Number.isInteger(value) && value >= 0 && value < sizes[axis] && (!side || value >= parsed[0][axis])))
    && (operation !== 'mirror' || plane.trim() !== '' && Number.isFinite(Number(plane)) && Number.isInteger(Number(plane) * 2))
  return <section className="inspector-section" aria-label="Candidate voxel tools">
    <span className="inspector-section__title">Candidate voxel tools · experimental</span>
    <p className="dialog-description">Edit a binary candidate grid. Each operation appends a volume revision; source anatomy remains protected.</p>
    <fieldset disabled={Boolean(disabledReason) || pending} className="voxel-fields">
      <label>Operation<select aria-label="Voxel operation" value={operation} onChange={(event) => setOperation(event.target.value)}>
        <option value="fill">Fill box</option><option value="erase">Erase box</option><option value="mirror">Mirror source into ROI</option>
      </select></label>
      {(['Minimum','Maximum'] as const).map((label, side) => <div key={label} className="voxel-corner">{['I','J','K'].map((axis, index) =>
        <label key={axis}>{label} {axis}<input aria-label={`${label} ${axis}`} type="number" min={0} max={sizes[index] - 1} step={1} value={bounds[side][index]}
          onChange={(event) => setBounds((current) => current.map((corner, c) => corner.map((value, d) => c === side && d === index ? event.target.value : value)))} /></label>)}</div>)}
      {operation === 'mirror' ? <><label>I-plane<input aria-label="Mirror I-plane" type="number" step="0.5" min={0} max={sizes[0] - 1} value={plane} onChange={(event) => setPlane(event.target.value)} /></label>
        <p className="dialog-description">Fill empty ROI voxels from the reflected source index. Choose a one-sided ROI and half-grid I-plane; anatomical midline is not estimated. This is not a validated implant.</p></> : null}
      <button type="button" className="btn btn--secondary btn--xs" disabled={!valid} onClick={() => onExecute(operation === 'mirror'
        ? { operation: 'reconstruct.mirror-roi', bounds: parsed, plane_i: Number(plane) }
        : { operation: 'voxel.box', bounds: parsed, mode: operation as 'fill' | 'erase' })}>Commit voxel revision</button>
    </fieldset>
    {disabledReason ? <p role="status">{disabledReason}</p> : null}
    {pending ? <p role="status">Processing candidate voxels…</p> : null}
  </section>
}
