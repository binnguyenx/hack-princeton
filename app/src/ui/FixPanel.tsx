import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { FixMetric, FixReport } from '../api/client'

type Props = {
  report: FixReport
  fixVisible: boolean
  busy: boolean
  onThreshold: (threshold: number) => void
  onKeepRegion: (region: number[][]) => void
  onFixVisibleChange: (visible: boolean) => void
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatValue(metric: FixMetric): string {
  const { value, unit } = metric
  if (Array.isArray(value)) return `${value.map(formatNumber).join(' × ')} ${unit}`
  if (typeof value === 'number') return `${formatNumber(value)} ${unit}`
  return String(value)
}

const fixed3 = (n: number) => n.toFixed(3)

export function FixPanel({ report, fixVisible, busy, onThreshold, onKeepRegion, onFixVisibleChange }: Props) {
  const ml = report.mlRecord
  const [threshold, setThreshold] = useState(ml.threshold)
  const [region, setRegion] = useState<string[]>(['', '', '', '', '', ''])
  const regionValues = region.map(Number)
  const regionReady = region.every((v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0)
  const test = ml.heldOut.test

  return (
    <div className="fix-panel">
      <section className="fix-panel-section" aria-label="Fix">
        <header className="fix-panel-head">
          <h3>Predicted fix</h3>
          <button type="button" className="btn btn--secondary btn--xs" onClick={() => onFixVisibleChange(!fixVisible)}>
            {fixVisible ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
            <span>{fixVisible ? 'Hide fix' : 'Show fix'}</span>
          </button>
        </header>
        <p className="fix-panel-note">{report.fix.label}</p>
        <table className="fix-metrics">
          <tbody>
            {report.fix.metrics.map((metric) => (
              <tr key={metric.key} title={metric.method}>
                <th scope="row">{metric.label}</th>
                <td>
                  {metric.status === 'ok' ? formatValue(metric) : (
                    <span className="fix-metric-unavailable">Not available: {metric.reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="fix-panel-section" aria-label="Adjust">
        <h3>Adjust</h3>
        <label className="fix-field">
          <span>Threshold {threshold.toFixed(2)} (higher = tighter)</span>
          <input type="range" min={0.1} max={0.9} step={0.05} value={threshold} aria-label="Fix threshold"
            onChange={(event) => setThreshold(Number(event.target.value))} disabled={busy} />
        </label>
        <button type="button" className="btn btn--secondary btn--xs" disabled={busy}
          onClick={() => onThreshold(threshold)}>Apply threshold</button>
        <fieldset className="fix-region" disabled={busy}>
          <legend>Keep only voxels inside (IJK)</legend>
          {['i from', 'j from', 'k from', 'i to', 'j to', 'k to'].map((label, n) => (
            <label key={label}>
              <span>{label}</span>
              <input type="number" min={0} step={1} value={region[n]} aria-label={label}
                onChange={(event) => setRegion(region.map((v, m) => (m === n ? event.target.value : v)))} />
            </label>
          ))}
        </fieldset>
        <button type="button" className="btn btn--secondary btn--xs" disabled={busy || !regionReady}
          onClick={() => onKeepRegion([regionValues.slice(0, 3), regionValues.slice(3)])}>Keep region</button>
      </section>

      <section className="fix-panel-section" aria-label="How this was made">
        <h3>How this was made</h3>
        <dl className="fix-record">
          <dt>Model</dt><dd>{ml.model.architecture} · {(ml.model.parameters / 1e6).toFixed(1)}M parameters · {ml.model.input}</dd>
          <dt>Training data</dt><dd>{ml.trainingData}</dd>
          <dt>Held-out test</dt>
          <dd>
            Mean Dice {fixed3(test.meanDice)}
            {test.meanDice95Ci ? ` (95% CI ${fixed3(test.meanDice95Ci[0])}–${fixed3(test.meanDice95Ci[1])})` : ''}
            {' · '}median HD95 {test.medianHd95Mm.toFixed(2)} mm · {test.cases} cases, {test.failures} failures
          </dd>
          <dt>Validation</dt><dd>Mean Dice {fixed3(ml.heldOut.validation.meanDice)}</dd>
          <dt>Checkpoint</dt><dd><code>{ml.checkpointHash.replace('sha256:', '').slice(0, 12)}</code> · {ml.runId}</dd>
          <dt>Threshold</dt>
          <dd>
            {ml.threshold}
            {ml.thresholdIsDefault && !ml.region ? ' (evaluated setting)' : (
              <>{' · '}<span className="fix-adjusted">
                {ml.thresholdIsDefault ? 'Trimmed to a region' : ml.region ? 'Adjusted threshold and region' : 'Adjusted threshold'}
                , not the evaluated setting
              </span></>
            )}
          </dd>
          <dt>This run</dt><dd>Model {ml.inferenceSeconds} s · total {ml.totalSeconds} s</dd>
        </dl>
        <p className="fix-limitation">{ml.limitation}</p>
      </section>
    </div>
  )
}
