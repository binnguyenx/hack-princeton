import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, Flex, TextField } from '@radix-ui/themes'
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
              <TextField.Root
                id="case-name"
                size="2"
                placeholder="e.g. Case 000: Parietotemporal Reconstruction"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
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
                disabled={!name.trim()}
              >
                Create Case
              </Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
