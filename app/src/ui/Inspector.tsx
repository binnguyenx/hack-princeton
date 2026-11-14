import { useState } from 'react'
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Sliders,
} from 'lucide-react'
import type { Candidate, EditorState, Sample } from '../domain/types'

export type InspectorProps = {
  state: EditorState | null
  activeTool: string
  onRestoreRevision: (candidateId: string, revisionId: string) => void
  restoreDisabled?: boolean
}

export function Inspector({
  state,
  activeTool,
  onRestoreRevision,
  restoreDisabled,
}: InspectorProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (!state) return null

  const activeDocId = state.activeDocumentId
  const activeDoc = state.openDocuments.find((d) => d.id === activeDocId)

  let sample: Sample | undefined
  let candidate: Candidate | undefined

  if (activeDoc?.kind === 'sample') {
    sample = state.samples.find((s) => s.id === activeDoc.id)
  } else if (activeDoc?.kind === 'candidate') {
    candidate = state.candidates.find((c) => c.objectId === activeDoc.id)
    if (candidate) {
      sample = state.samples.find((s) => s.id === candidate!.sampleId)
    }
  }

  const spatial = sample?.sourceAnatomy.spatial
  const candRevisions = candidate
    ? state.revisions
        .filter((r) => r.candidateId === candidate!.objectId)
        .sort((a, b) => a.order - b.order)
    : []

  if (collapsed) {
    return (
      <aside className="inspector-panel inspector-panel--collapsed">
        <button
          type="button"
          className="inspector-expand-btn"
          title="Expand Inspector"
          onClick={() => setCollapsed(false)}
        >
          <ChevronLeft size={16} />
          <span className="inspector-collapsed-label">Inspector</span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="inspector-panel" aria-label="Inspector">
      <div className="inspector-header">
        <div className="inspector-header__title">
          <Sliders size={16} />
          <h3>Inspector</h3>
        </div>
        <button
          type="button"
          className="inspector-collapse-btn"
          title="Collapse Inspector"
          onClick={() => setCollapsed(true)}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="inspector-body">
        {activeDoc ? (
          <>
            <div className="inspector-section">
              <span className="inspector-section__title">Active Target</span>
              <div className="inspector-card">
                <div className="inspector-card__name">
                  <strong>
                    {sample?.displayName ?? candidate?.displayName ?? activeDoc.id}
                  </strong>
                </div>
                <div className="inspector-card__badge-row">
                  {activeDoc.kind === 'candidate' ? (
                    <span className="atlassian-tag atlassian-tag--candidate">
                      <Sparkles size={11} /> Implant Candidate
                    </span>
                  ) : (
                    <span className="atlassian-tag atlassian-tag--sample">
                      Protected Sample
                    </span>
                  )}
                </div>
                <div className="inspector-meta-grid">
                  <div className="meta-pair">
                    <span className="meta-label">ID</span>
                    <span className="meta-value font-mono">{activeDoc.id.slice(0, 14)}…</span>
                  </div>
                  <div className="meta-pair">
                    <span className="meta-label">Active Tool</span>
                    <span className="meta-value capitalize">{activeTool}</span>
                  </div>
                </div>
              </div>
            </div>

            {spatial ? (
              <div className="inspector-section">
                <span className="inspector-section__title">Spatial Dimensions</span>
                <div className="inspector-card">
                  <div className="inspector-meta-grid">
                    <div className="meta-pair">
                      <span className="meta-label">Voxel Grid</span>
                      <span className="meta-value font-mono">
                        {spatial.sizes.join(' × ')}
                      </span>
                    </div>
                    <div className="meta-pair">
                      <span className="meta-label">Spacings</span>
                      <span className="meta-value font-mono">
                        {spatial.spacings.map((s) => s.toFixed(2)).join(' × ')} {spatial.units}
                      </span>
                    </div>
                    <div className="meta-pair">
                      <span className="meta-label">Bounding Box</span>
                      <span className="meta-value font-mono">
                        {spatial.bboxMm.map((b) => Math.round(b)).join(' × ')} mm
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {candidate ? (
              <div className="inspector-section">
                <div className="inspector-section__header">
                  <span className="inspector-section__title">
                    Candidate Version History ({candRevisions.length})
                  </span>
                </div>
                <div className="revision-timeline-card">
                  {candRevisions.map((rev) => {
                    const isCurrent = rev.id === candidate!.currentRevisionId
                    return (
                      <div
                        key={rev.id}
                        className={`revision-row ${isCurrent ? 'is-current' : ''}`}
                      >
                        <div className="revision-badge">R{rev.order}</div>
                        <div className="revision-info">
                          <strong>
                            {rev.order === 0 ? 'Initial Template' : `Transform Pose Applied`}
                          </strong>
                          <span className="revision-hash font-mono">
                            {rev.id.slice(0, 12)}…
                          </span>
                        </div>
                        {!isCurrent ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            title="Restore this revision"
                            disabled={restoreDisabled}
                            onClick={() =>
                              onRestoreRevision(candidate!.objectId, rev.id)
                            }
                          >
                            <RotateCcw size={11} />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <span className="current-badge">Active</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="inspector-empty">
            <p className="muted">
              Select a document tab above or open an anatomy asset from the Cases view to inspect.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
