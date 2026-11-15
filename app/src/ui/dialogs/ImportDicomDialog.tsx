import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, Flex, Text, TextField } from '@radix-ui/themes'
import { FolderUp, X } from 'lucide-react'

export type ImportDicomDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCaseName?: string
  onImport: (files: File[], displayName: string) => void
}

export function ImportDicomDialog({
  open,
  onOpenChange,
  selectedCaseName,
  onImport,
}: ImportDicomDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [displayName, setDisplayName] = useState('CT intensity')
  const [busy, setBusy] = useState(false)

  function reset() {
    setFiles([])
    setDisplayName('CT intensity')
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length || busy) return
    setBusy(true)
    onImport(files, displayName.trim() || 'CT intensity')
    handleOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-header">
            <div className="dialog-title-group">
              <FolderUp className="dialog-icon" size={20} />
              <Dialog.Title className="dialog-title">Import CT DICOM Series</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="dialog-form">
            <p className="dialog-description">
              Choose a local folder with one CT series. The server converts it to an intensity
              NRRD Sample under <strong>{selectedCaseName ?? 'the active case'}</strong>.
            </p>

            <div className="form-field">
              <label htmlFor="dicom-display-name" className="form-label">
                Display name
              </label>
              <TextField.Root
                id="dicom-display-name"
                size="2"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="form-field">
              <label htmlFor="dicom-folder" className="form-label">
                DICOM folder
              </label>
              <input
                id="dicom-folder"
                ref={inputRef}
                type="file"
                // Folder picker — one series of instances (plan P1).
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                multiple
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : []
                  setFiles(list)
                }}
              />
              <Text size="1" color="gray">
                {files.length
                  ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
                  : 'Select a directory containing a single CT series'}
              </Text>
            </div>

            <Flex className="dialog-actions" justify="end" gap="2">
              <Button
                type="button"
                variant="soft"
                color="gray"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!files.length || busy}>
                Import CT
              </Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
