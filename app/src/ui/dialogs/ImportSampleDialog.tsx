import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, Flex, Text } from '@radix-ui/themes'
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

  useEffect(() => {
    if (!open) return
    if (catalog.length === 0) return
    if (catalog.some((entry) => entry.id === selectedId)) return
    setSelectedId(catalog[0].id)
  }, [open, catalog, selectedId])

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
                    <Flex className="catalog-card__meta" gap="3">
                      <Text size="1">Volume: <code>{entry.primaryVolume}</code></Text>
                      <Text size="1">License: {entry.license}</Text>
                    </Flex>
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

            <Flex className="dialog-actions" justify="end" gap="2">
              <Button
                type="button"
                variant="soft"
                color="gray"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedId}
              >
                Import Sample
              </Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
