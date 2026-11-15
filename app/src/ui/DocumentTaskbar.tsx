import { Plus, Shield, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { DocumentKind, OpenDocument } from '../domain/types'

export type DocumentTaskbarProps = {
  documents: OpenDocument[]
  activeDocumentId: string | null
  isDirty?: boolean
  labelFor: (doc: OpenDocument) => string
  onActivate: (kind: DocumentKind, id: string) => void
  onClose: (kind: DocumentKind, id: string) => void
  onAdd?: () => void
  addDisabled?: boolean
}

export function DocumentTaskbar({
  documents,
  activeDocumentId,
  isDirty,
  labelFor,
  onActivate,
  onClose,
  onAdd,
  addDisabled,
}: DocumentTaskbarProps) {
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = activeRef.current
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [activeDocumentId, documents.length])

  return (
    <div className="document-taskbar" role="tablist" aria-label="Open documents">
      {documents.length === 0 ? (
        <span className="document-taskbar__placeholder">
          No documents open — use + to open a sample, or open one from Cases & Anatomy.
        </span>
      ) : (
        documents.map((doc) => {
          const selected = doc.id === activeDocumentId
          const isCandidate = doc.kind === 'candidate'
          const showDirty = selected && isDirty

          return (
            <div
              key={`${doc.kind}:${doc.id}`}
              ref={selected ? activeRef : undefined}
              className={`document-taskbar__tab ${selected ? 'is-active' : ''} ${
                showDirty ? 'is-dirty' : ''
              }`}
              role="tab"
              aria-selected={selected}
            >
              <button
                type="button"
                className="document-taskbar__label"
                aria-label={labelFor(doc)}
                onClick={() => onActivate(doc.kind, doc.id)}
              >
                {isCandidate ? (
                  <Sparkles size={12} className="tab-kind-icon tab-kind-icon--candidate" />
                ) : (
                  <Shield size={12} className="tab-kind-icon tab-kind-icon--sample" />
                )}
                <span className="document-taskbar__text">{labelFor(doc)}</span>
              </button>
              <button
                type="button"
                className="document-taskbar__close"
                aria-label={
                  showDirty
                    ? `Unsaved changes — close ${labelFor(doc)}`
                    : `Close ${labelFor(doc)}`
                }
                title={showDirty ? 'Unsaved changes (⌘S to save)' : `Close ${labelFor(doc)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(doc.kind, doc.id)
                }}
              >
                <span className="document-taskbar__dirty-circle" aria-hidden />
                <X size={12} className="document-taskbar__close-icon" />
              </button>
            </div>
          )
        })
      )}
      {onAdd ? (
        <button
          type="button"
          className="document-taskbar__add"
          aria-label="Open sample"
          title="Open sample"
          disabled={addDisabled}
          onClick={onAdd}
        >
          <Plus size={14} />
        </button>
      ) : null}
    </div>
  )
}
