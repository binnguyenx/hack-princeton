import { useEffect, useRef, useState } from 'react'
import { MapPin, Crosshair } from 'lucide-react'
import type { Annotation, AnnotationType } from '../domain/types'
import { defaultAnnotationName } from '../geometry/annotationPlacement'
import {
  angleDegrees,
  closedCurveLength,
  landmarkCoord,
  lineDistance,
  openCurveLength,
  planeArea,
  planeNormal,
  roiVolume,
} from '../geometry/annotationMeasure'
import {
  rotatePlaneNormal,
  scalePlanePad,
} from '../viewport/annotationBehaviors'
import type { AnnotationAction } from './annotationActions'
import { AnnotationRowMoreMenu } from './annotationActionMenu'
import { AnnotationColorSwatches } from './AnnotationColorSwatches'
import { resolveAnnotationColorKey } from '../domain/annotationPalette'

type Props = {
  annotations: Annotation[]
  isCandidateActive: boolean
  onAnnotationAction: (action: AnnotationAction) => void
  staleHighlightIds?: Set<string>
  boundingBoxMm?: number[]
  /** Expand + focus note body after place. */
  focusAnnotationId?: string | null
  onFocusAnnotationConsumed?: () => void
  selectedAnnotationId?: string | null
  onSelectAnnotation?: (id: string | null) => void
}

function primaryMeasurement(ann: Annotation, boundingBoxMm: number[]): string {
  switch (ann.type) {
    case 'landmark':
      return ann.points[0] ? landmarkCoord(ann.points[0]) : '—'
    case 'line':
      return ann.points.length >= 2
        ? `${lineDistance(ann.points[0], ann.points[1]).toFixed(2)} mm`
        : '—'
    case 'closed_curve':
      return ann.points.length >= 3
        ? `${closedCurveLength(ann.points).toFixed(2)} mm`
        : '—'
    case 'open_curve':
      return ann.points.length >= 2
        ? `${openCurveLength(ann.points).toFixed(2)} mm`
        : '—'
    case 'angle':
      return ann.points.length >= 3
        ? `${angleDegrees(ann.points[0], ann.points[1], ann.points[2]).toFixed(1)}°`
        : '—'
    case 'text_note': {
      const body = String(ann.meta.body ?? '')
      return body.length > 28 ? `${body.slice(0, 28)}…` : body || 'Empty note'
    }
    case 'roi': {
      const min = (ann.meta.min as [number, number, number] | undefined) ?? ann.points[0]
      const max = (ann.meta.max as [number, number, number] | undefined) ?? ann.points[1]
      if (!min || !max) return '—'
      return `${roiVolume(min, max).toFixed(1)} mm³`
    }
    case 'highlight': {
      const n = (ann.meta.triangleIndices as number[] | undefined)?.length ?? 0
      return `${n} triangles`
    }
    case 'plane': {
      if (ann.points.length < 1) return '—'
      const area = planeArea(ann.points, boundingBoxMm)
      return `${area.toFixed(2)} mm²`
    }
    default:
      return '—'
  }
}

function hasMeasurement(ann: Annotation, boundingBoxMm: number[]): boolean {
  const m = primaryMeasurement(ann, boundingBoxMm)
  return m !== '—' && m !== 'Empty note'
}

function typeLabel(type: AnnotationType): string {
  return defaultAnnotationName(type)
}

function AnnotationRow({
  ann,
  onAnnotationAction,
  stale,
  boundingBoxMm,
  forceExpand,
  onFocusConsumed,
  selected,
  onSelect,
}: {
  ann: Annotation
  onAnnotationAction: (action: AnnotationAction) => void
  stale?: boolean
  boundingBoxMm: number[]
  forceExpand?: boolean
  onFocusConsumed?: () => void
  selected?: boolean
  onSelect?: (id: string | null) => void
}) {
  const [expanded, setExpanded] = useState(Boolean(forceExpand))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editName, setEditName] = useState(ann.name)
  const [editBody, setEditBody] = useState(String(ann.meta.body ?? ''))
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setEditName(ann.name)
    setEditBody(String(ann.meta.body ?? ''))
  }, [ann.name, ann.meta.body])

  useEffect(() => {
    if (!forceExpand) return
    setExpanded(true)
    onSelect?.(ann.id)
    if (ann.type === 'text_note') {
      requestAnimationFrame(() => bodyRef.current?.focus())
    }
    onFocusConsumed?.()
  }, [forceExpand, ann.id, ann.type, onSelect, onFocusConsumed])

  if (confirmDelete) {
    return (
      <div className="annotation-row annotation-row-confirm" data-testid={`ann-row-${ann.id}`}>
        <span>
          Delete &quot;{ann.name}&quot;? This cannot be undone.
        </span>
        <div className="annotation-row-actions">
          <button
            type="button"
            className="btn btn--secondary btn--xs"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger btn--xs annotation-delete-confirm"
            onClick={() => onAnnotationAction({ type: 'delete', id: ann.id })}
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  const measure = primaryMeasurement(ann, boundingBoxMm)

  return (
    <div
      className={`annotation-row ${expanded ? 'annotation-row--expanded' : ''} ${
        selected ? 'annotation-row--selected' : ''
      }`}
      data-testid={`ann-row-${ann.id}`}
    >
      <div
        className="annotation-row__header"
        onClick={() => {
          setExpanded((v) => !v)
          onSelect?.(ann.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setExpanded((v) => !v)
            onSelect?.(ann.id)
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span className="annotation-row__type">{typeLabel(ann.type)}</span>
        <span className="annotation-row__measure" title={measure}>
          {measure}
        </span>
        <div
          className="annotation-row-actions"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <AnnotationRowMoreMenu
            ann={ann}
            onAnnotationAction={onAnnotationAction}
            onRequestDelete={() => {
              if (hasMeasurement(ann, boundingBoxMm)) setConfirmDelete(true)
              else onAnnotationAction({ type: 'delete', id: ann.id })
            }}
          />
        </div>
      </div>
      {expanded ? (
        <div className="annotation-row__body">
          <label className="annotation-field">
            <span>Name</span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                if (editName.trim() && editName !== ann.name) {
                  onAnnotationAction({
                    type: 'rename',
                    id: ann.id,
                    name: editName.trim(),
                  })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditName(ann.name)
              }}
            />
          </label>
          <div className="annotation-field annotation-color-row">
            <span>Color</span>
            <AnnotationColorSwatches
              value={resolveAnnotationColorKey(ann)}
              disabled={ann.locked}
              onChange={(color) =>
                onAnnotationAction({
                  type: 'updateMeta',
                  id: ann.id,
                  meta: { ...ann.meta, color },
                })
              }
            />
          </div>
          {(ann.type === 'landmark' || ann.type === 'text_note') &&
          ann.points[0] ? (
            <div className="annotation-field">
              <span>Position</span>
              <span>{landmarkCoord(ann.points[0])}</span>
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                onClick={() =>
                  onAnnotationAction({
                    type: 'jumpTo',
                    id: ann.id,
                    point: ann.points[0],
                  })
                }
              >
                <Crosshair size={12} /> Jump to
              </button>
            </div>
          ) : null}
          {ann.type === 'text_note' ? (
            <label className="annotation-field">
              <span>Note</span>
              <textarea
                ref={bodyRef}
                value={editBody}
                placeholder="Type note…"
                rows={3}
                onChange={(e) => setEditBody(e.target.value)}
                onBlur={() =>
                  onAnnotationAction({
                    type: 'updateMeta',
                    id: ann.id,
                    meta: { ...ann.meta, body: editBody },
                  })
                }
              />
            </label>
          ) : null}
          {ann.type === 'highlight' ? (
            <>
              <div className="annotation-field">
                <span>Triangles</span>
                <span>
                  {(ann.meta.triangleIndices as number[] | undefined)?.length ??
                    0}
                </span>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  onClick={() =>
                    onAnnotationAction({
                      type: 'updateMeta',
                      id: ann.id,
                      meta: { ...ann.meta, triangleIndices: [] },
                    })
                  }
                >
                  Clear
                </button>
              </div>
              <label className="annotation-field">
                <span>Brush radius</span>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={1}
                  aria-label="Brush radius"
                  value={Number(ann.meta.brushRadiusMm ?? 10)}
                  onChange={(e) =>
                    onAnnotationAction({
                      type: 'updateMeta',
                      id: ann.id,
                      meta: {
                        ...ann.meta,
                        brushRadiusMm: Number(e.target.value),
                      },
                    })
                  }
                />
                <span>{Number(ann.meta.brushRadiusMm ?? 10)} mm</span>
              </label>
            </>
          ) : null}
          {stale ? (
            <p className="annotation-stale-warning" role="alert">
              Highlight overlay references stale mesh — repaint required
            </p>
          ) : null}
          {ann.type === 'roi' ? (
            <div className="annotation-field">
              <span>Extents (L-R × P-A × I-S)</span>
              <span className="font-mono">
                {(() => {
                  const min =
                    (ann.meta.min as [number, number, number] | undefined) ??
                    ann.points[0]
                  const max =
                    (ann.meta.max as [number, number, number] | undefined) ??
                    ann.points[1]
                  if (!min || !max) return '—'
                  const lr = Math.abs(max[0] - min[0]).toFixed(2)
                  const pa = Math.abs(max[1] - min[1]).toFixed(2)
                  const is = Math.abs(max[2] - min[2]).toFixed(2)
                  return `${lr} × ${pa} × ${is} mm`
                })()}
              </span>
            </div>
          ) : null}
          {ann.type === 'plane' ? (
            <>
              <div className="annotation-field">
                <span>Normal</span>
                <span className="font-mono">
                  {(Array.isArray(ann.meta.normal) &&
                  ann.meta.normal.length >= 3
                    ? (ann.meta.normal as [number, number, number])
                    : planeNormal(ann.points)
                  )
                    .map((n) => n.toFixed(2))
                    .join(', ')}
                </span>
              </div>
              <div className="annotation-field">
                <span>Area</span>
                <span>
                  {planeArea(ann.points, boundingBoxMm).toFixed(2)} mm²
                </span>
              </div>
              <label className="annotation-field">
                <span>Size</span>
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={1}
                  aria-label="Plane size"
                  disabled={ann.locked}
                  value={Number(ann.meta.padMm ?? 10)}
                  onChange={(e) => {
                    const next = scalePlanePad(
                      ann,
                      Number(e.target.value) - Number(ann.meta.padMm ?? 10),
                    )
                    onAnnotationAction({
                      type: 'updateMeta',
                      id: ann.id,
                      meta: next.meta,
                    })
                  }}
                />
                <span>{Number(ann.meta.padMm ?? 10).toFixed(0)} mm pad</span>
              </label>
              <div className="annotation-field" role="group" aria-label="Rotate plane">
                <span>Rotate</span>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  aria-label="Rotate plane counterclockwise"
                  disabled={ann.locked}
                  onClick={() => {
                    const next = rotatePlaneNormal(ann, Math.PI / 12)
                    onAnnotationAction({
                      type: 'updateMeta',
                      id: ann.id,
                      meta: next.meta,
                    })
                  }}
                >
                  ↺ 15°
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  aria-label="Rotate plane clockwise"
                  disabled={ann.locked}
                  onClick={() => {
                    const next = rotatePlaneNormal(ann, -Math.PI / 12)
                    onAnnotationAction({
                      type: 'updateMeta',
                      id: ann.id,
                      meta: next.meta,
                    })
                  }}
                >
                  ↻ 15°
                </button>
              </div>
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                aria-label="Align plane to view"
                disabled={ann.locked}
                onClick={() =>
                  onAnnotationAction({
                    type: 'alignPlaneToView',
                    annotationId: ann.id,
                  })
                }
              >
                Align to view
              </button>
              <label className="annotation-field">
                <span>Show in slice dock</span>
                <input
                  type="checkbox"
                  aria-label="Show in slice dock"
                  checked={Boolean(ann.meta.sliceDockActive)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onAnnotationAction({
                        type: 'showPlaneInDock',
                        annotationId: ann.id,
                      })
                    } else {
                      onAnnotationAction({
                        type: 'updateMeta',
                        id: ann.id,
                        meta: { ...ann.meta, sliceDockActive: false },
                      })
                    }
                  }}
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function AnnotationList({
  annotations,
  isCandidateActive,
  onAnnotationAction,
  staleHighlightIds,
  boundingBoxMm = [40, 40, 40],
  focusAnnotationId = null,
  onFocusAnnotationConsumed,
  selectedAnnotationId = null,
  onSelectAnnotation,
}: Props) {
  return (
    <div className="annotation-list inspector-section" aria-label="Annotations">
      <div className="inspector-section__header">
        <span className="inspector-section__title">
          <MapPin size={14} /> Annotations
          {annotations.length > 0 ? (
            <span className="annotation-count-badge">{annotations.length}</span>
          ) : null}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--xs"
          disabled={!isCandidateActive}
          aria-disabled={!isCandidateActive}
          title={
            isCandidateActive
              ? 'Place annotation'
              : 'Requires active candidate'
          }
          onClick={() =>
            onAnnotationAction({ type: 'place', annotationType: 'text_note' })
          }
        >
          Place annotation
        </button>
      </div>
      {!isCandidateActive ? (
        <p className="muted">Annotations require an active candidate.</p>
      ) : annotations.length === 0 ? (
        <div className="annotation-empty">
          <MapPin size={24} />
          <p>No annotations yet</p>
          <p className="muted">
            Click &quot;Place annotation&quot; to add notes, measure distances,
            or trace boundaries.
          </p>
        </div>
      ) : (
        <div className="annotation-rows">
          {annotations.map((ann) => (
            <AnnotationRow
              key={ann.id}
              ann={ann}
              onAnnotationAction={onAnnotationAction}
              stale={staleHighlightIds?.has(ann.id)}
              boundingBoxMm={boundingBoxMm}
              forceExpand={focusAnnotationId === ann.id}
              onFocusConsumed={onFocusAnnotationConsumed}
              selected={selectedAnnotationId === ann.id}
              onSelect={onSelectAnnotation}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export type { AnnotationType }
