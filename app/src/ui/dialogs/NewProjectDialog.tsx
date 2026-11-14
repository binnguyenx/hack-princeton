import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, Flex, TextField } from '@radix-ui/themes'
import { FolderPlus, X } from 'lucide-react'

export type NewProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: NewProjectDialogProps) {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-header">
            <div className="dialog-title-group">
              <FolderPlus className="dialog-icon" size={20} />
              <Dialog.Title className="dialog-title">Create New Project</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="dialog-form">
            <p className="dialog-description">
              Organize reconstruction patient cases, anatomy samples, and implant candidates in a dedicated project.
            </p>
            <div className="form-field">
              <label htmlFor="project-name" className="form-label">
                Project Name
              </label>
              <TextField.Root
                id="project-name"
                size="2"
                placeholder="e.g. Reconstruction Study 01"
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
                Create Project
              </Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
