import * as Dialog from '@radix-ui/react-dialog'
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export type SamplePickerRow = {
  id: string
  displayName: string
  caseId: string
  caseName: string
}

export type SamplePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  samples: SamplePickerRow[]
  loading?: boolean
  error?: string | null
  query: string
  onQueryChange: (q: string) => void
  onSelect: (sampleId: string) => void
  openSampleIds?: Set<string>
}

export function SamplePickerDialog({
  open,
  onOpenChange,
  samples,
  loading,
  error,
  query,
  onQueryChange,
  onSelect,
  openSampleIds,
}: SamplePickerDialogProps) {
  const [localQuery, setLocalQuery] = useState(query)

  useEffect(() => {
    if (open) setLocalQuery(query)
  }, [open, query])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--wide" aria-describedby={undefined}>
          <div className="dialog-header">
            <Dialog.Title className="dialog-title">Open sample</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div className="dialog-form">
            <div className="form-field">
              <label htmlFor="sample-picker-search" className="form-label">
                Search
              </label>
              <div className="sample-picker__search">
                <Search size={14} aria-hidden />
                <input
                  id="sample-picker-search"
                  className="form-input"
                  type="search"
                  value={localQuery}
                  placeholder="Filter by sample or case name"
                  aria-label="Search samples"
                  onChange={(e) => {
                    const next = e.target.value
                    setLocalQuery(next)
                    onQueryChange(next)
                  }}
                />
              </div>
            </div>
            {error ? (
              <p className="dialog-description" style={{ color: 'var(--color-signal)' }}>
                {error}
              </p>
            ) : null}
            <div className="sample-picker__list" role="listbox" aria-label="Samples">
              {loading ? (
                <p className="sample-picker__empty">Loading…</p>
              ) : samples.length === 0 ? (
                <p className="sample-picker__empty">No samples match.</p>
              ) : (
                samples.map((row) => {
                  const already = openSampleIds?.has(row.id)
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="option"
                      className="sample-picker__row"
                      aria-selected={false}
                      onClick={() => onSelect(row.id)}
                    >
                      <span className="sample-picker__name">{row.displayName || row.id}</span>
                      <span className="sample-picker__meta">
                        {row.caseName}
                        {already ? ' · open' : ''}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
