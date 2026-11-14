import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
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
              <input
                id="project-name"
                type="text"
                className="form-input"
                placeholder="e.g. SkullBreak Reconstruction Study 01"
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
                Create Project
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
