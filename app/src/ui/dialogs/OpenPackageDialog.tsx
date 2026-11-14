import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, Flex } from '@radix-ui/themes'
import { FolderOpen, X } from 'lucide-react'
import { MAX_PACKAGE_BYTES } from '../../api/packages'

export function OpenPackageDialog({ onClose, onImport, busy }: {
  onClose: () => void; onImport: (file: File) => Promise<void>; busy: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const close = () => { if (!busy && !submitting.current) onClose() }
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy && !submitting.current) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby="package-description">
          <div className="dialog-header">
            <div className="dialog-title-group"><FolderOpen size={20} /><Dialog.Title>Open Project Package</Dialog.Title></div>
            <button type="button" className="dialog-close" aria-label="Close" disabled={busy} onClick={close}><X size={16} /></button>
          </div>
          <form className="dialog-form" onSubmit={async (event) => {
            event.preventDefault()
            if (!file || busy || submitting.current) return
            if (file.size > MAX_PACKAGE_BYTES) { setError('Choose a package 64 MiB or smaller.'); return }
            submitting.current = true
            setError(null)
            try { await onImport(file) }
            catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
            finally { submitting.current = false }
          }}>
            <p id="package-description" className="dialog-description">Import a ZIP package as a new project copy. Existing projects remain unchanged.</p>
            <div className="form-field"><label htmlFor="package-file">Project package (.zip)</label>
              <input id="package-file" type="file" accept=".zip,application/zip" disabled={busy}
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null) }} /></div>
            {error ? <p role="alert" className="package-error">{error}</p> : null}
            {busy ? <p role="status">Importing package…</p> : null}
            <Flex className="dialog-actions" justify="end" gap="2">
              <Button type="button" variant="soft" color="gray" disabled={busy} onClick={close}>Cancel</Button>
              <Button type="submit" disabled={!file || busy}>Import as new project</Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
