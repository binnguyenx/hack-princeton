import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'

export type ConfirmCloseDocumentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function ConfirmCloseDocumentDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  onCancel,
}: ConfirmCloseDocumentDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-header">
            <div className="dialog-title-group">
              <AlertTriangle className="dialog-icon dialog-icon--warning" size={20} />
              <Dialog.Title className="dialog-title">Unsaved changes</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close" onClick={onCancel}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div className="dialog-form">
            <p className="dialog-description">
              This workspace has unsaved edits. Save before closing the tab, discard them, or
              cancel to keep the tab open.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn--secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn--danger" onClick={onDiscard}>
                Discard
              </button>
              <button type="button" className="btn btn--primary" onClick={onSave}>
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
