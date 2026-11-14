import { useState } from 'react'
import type { SourceLandmark } from '../domain/types'
import { landmarkDistance } from '../geometry/landmarks'

type Props = {
  points: SourceLandmark[]; pending: boolean; persistent: boolean
  onPersistentChange: (value: boolean) => void; onDelete: (id: string) => void
  onLocate: (point: SourceLandmark) => void
}
export function LandmarkControls({ points, pending, persistent, onPersistentChange, onDelete, onLocate }: Props) {
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const a = points.find((p) => p.id === first), b = points.find((p) => p.id === second)
  let measurement = 'Select two distinct points'
  if (a && b) {
    try { measurement = `${landmarkDistance(a, b).toFixed(2)} mm` }
    catch (error) { measurement = String(error instanceof Error ? error.message : error) }
  }
  return <section className="inspector-section" aria-label="Source landmarks">
    <span className="inspector-section__title">Source landmarks · RAS mm</span>
    <p className="dialog-description">Place on a source slice to save a point. These points do not follow candidate transforms.</p>
    <label><input type="checkbox" checked={persistent} disabled={pending} onChange={(event) => onPersistentChange(event.target.checked)} />Keep placing points</label>
    {pending ? <p role="status">Saving source landmark…</p> : null}
    <ul className="landmark-list">{points.map((point) => <li key={point.id}>
      <button type="button" aria-label={`Locate ${point.label}`} onClick={() => onLocate(point)}>{point.label}: {point.ras.map((n) => n.toFixed(2)).join(', ')}</button>
      <button type="button" disabled={pending} aria-label={`Delete ${point.label}`} onClick={() => onDelete(point.id)}>Delete</button>
    </li>)}</ul>
    <label className="form-label">First landmark<select aria-label="First landmark" value={a ? first : ''} onChange={(event) => setFirst(event.target.value)}>
      <option value="">Choose point</option>{points.map((p) => <option value={p.id} key={p.id}>{p.label}</option>)}</select></label>
    <label className="form-label">Second landmark<select aria-label="Second landmark" value={b ? second : ''} onChange={(event) => setSecond(event.target.value)}>
      <option value="">Choose point</option>{points.map((p) => <option value={p.id} key={p.id}>{p.label}</option>)}</select></label>
    <output aria-label="Landmark distance">{measurement}</output>
    <p className="dialog-description">Straight-line distance on the source, not surface distance or implant thickness.</p>
  </section>
}
