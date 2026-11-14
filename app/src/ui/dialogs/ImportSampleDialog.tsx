import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileUp, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import type { SampleCatalogEntry } from '../../ops/importPrepared'

export type ImportSampleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: SampleCatalogEntry[]
  selectedCaseName?: string
  onImport: (catalogId: string) => void
}

export function ImportSampleDialog({
  open,
  onOpenChange,
  catalog,
  selectedCaseName,
  onImport,
}: ImportSampleDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(catalog[0]?.id ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return
    onImport(selectedId)
    onOpenChange(false)
  }

  const selectedEntry = catalog.find((c) => c.id === selectedId)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--wide" aria-describedby={undefined}>
          <div className="dialog-header">
            <div className="dialog-title-group">
              <FileUp className="dialog-icon" size={20} />
              <Dialog.Title className="dialog-title">Import Prepared Anatomy Sample</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="dialog-form">
            <p className="dialog-description">
              Import a verified defective cranial volume (NRRD) into{' '}
              <strong>{selectedCaseName ?? 'the active case'}</strong>. Source anatomy remains protected and read-only.
            </p>

            <div className="catalog-selection-list">
              {catalog.map((entry) => {
                const isSelected = entry.id === selectedId
                return (
                  <div
                    key={entry.id}
                    className={`catalog-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(entry.id)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        setSelectedId(entry.id)
                      }
                    }}
                  >
                    <div className="catalog-card__header">
                      <div className="catalog-card__title">
                        {isSelected ? (
                          <CheckCircle2 size={16} className="catalog-card__check" />
                        ) : (
                          <div className="catalog-card__circle" />
                        )}
                        <strong>{entry.label}</strong>
                      </div>
                      <span className="badge badge--pill badge--success">
                        <ShieldCheck size={12} /> NRRD Verified
                      </span>
                    </div>
                    <div className="catalog-card__meta">
                      <span>Volume: <code>{entry.primaryVolume}</code></span>
                      <span>License: {entry.license}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedEntry ? (
              <div className="dialog-notice">
                <p>
                  Volume <code>{selectedEntry.primaryVolume}</code> will be spatially verified against clinical <code>metadata.json</code> before candidate creation is permitted.
                </p>
              </div>
            ) : null}

            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!selectedId}
              >
                Import Sample
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
