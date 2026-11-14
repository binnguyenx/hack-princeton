import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'

export type ConfirmLeaveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function ConfirmLeaveDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  onCancel,
}: ConfirmLeaveDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-header">
            <div className="dialog-title-group">
              <AlertTriangle className="dialog-icon dialog-icon--warning" size={20} />
              <Dialog.Title className="dialog-title">Unsaved Project Changes</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close" onClick={onCancel}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div className="dialog-form">
            <p className="dialog-description">
              You have unsaved edits in this workspace. Leaving or switching projects will discard any changes not saved to the project package.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={onDiscard}
              >
                Discard Changes
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={onSave}
              >
                Save & Continue
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
