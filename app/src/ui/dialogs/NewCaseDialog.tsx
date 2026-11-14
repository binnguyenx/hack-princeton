import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { PlusCircle, X } from 'lucide-react'

export type NewCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
  defaultName?: string
}

export function NewCaseDialog({
  open,
  onOpenChange,
  onCreate,
  defaultName = 'Case 1',
}: NewCaseDialogProps) {
  const [name, setName] = useState(defaultName)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-header">
            <div className="dialog-title-group">
              <PlusCircle className="dialog-icon" size={20} />
              <Dialog.Title className="dialog-title">New Patient Case</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="dialog-form">
            <p className="dialog-description">
              Each case holds defective patient anatomy samples and reconstructed candidate repair implants.
            </p>
            <div className="form-field">
              <label htmlFor="case-name" className="form-label">
                Case Name / Identifier
              </label>
              <input
                id="case-name"
                type="text"
                className="form-input"
                placeholder="e.g. Case 000: Parietotemporal Reconstruction"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
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
                disabled={!name.trim()}
              >
                Create Case
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
