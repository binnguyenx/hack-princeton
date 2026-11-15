import { Sparkles } from 'lucide-react'
import type { FixRun } from './fixRun'

/** Fixed stage list (cranial-reconstruction-candidate R10). Server stages plus the client's mesh build. */
export const FIX_STAGES = [
  'Checking skull',
  'Uploading skull',
  'Waking model',
  'Predicting missing bone',
  'Mapping fix onto skull',
  'Building mesh',
  'Saving candidate',
] as const

type ButtonProps = {
  disabledReason: string | null
  running: boolean
  onGenerate: () => void
}

export function GenerateFixButton({ disabledReason, running, onGenerate }: ButtonProps) {
  const reason = running ? 'A fix is already being generated for this skull' : disabledReason
  return (
    <button
      type="button"
      className="btn btn--primary btn--xs fix-generate-btn"
      disabled={reason !== null}
      title={reason ?? 'Predict the missing bone with the cranial model'}
      onClick={onGenerate}
    >
      <Sparkles size={14} aria-hidden />
      <span>{running ? 'Generating…' : 'Generate fix'}</span>
    </button>
  )
}

export function FixProgressCard({ run }: { run: FixRun }) {
  if (run.status === 'failed') {
    return (
      <div className="fix-progress-card fix-progress-card--failed" role="alert">
        <strong>Fix not generated</strong>
        <span>{run.error?.message ?? 'Generating the fix failed. Nothing was saved.'}</span>
      </div>
    )
  }
  const index = Math.max(0, FIX_STAGES.indexOf(run.stage as (typeof FIX_STAGES)[number]))
  const percent = run.status === 'succeeded' ? 100 : Math.round(((index + 1) / (FIX_STAGES.length + 1)) * 100)
  return (
    <div className="fix-progress-card" aria-live="polite">
      <div className="fix-progress-head">
        <strong>{run.status === 'succeeded' ? 'Fix ready' : 'Generating fix'}</strong>
        <span className="fix-progress-time">{Math.round(run.elapsedS)} s</span>
      </div>
      <div className="fix-progress-track" role="progressbar" aria-label="Fix generation progress"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="fix-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="fix-progress-stage">{run.stage}</span>
    </div>
  )
}
