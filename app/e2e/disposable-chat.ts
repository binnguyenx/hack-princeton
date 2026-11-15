/** Fail closed before mutating test fixtures can reach any application server. */
import { lstatSync, realpathSync, readdirSync } from 'node:fs'
import path from 'node:path'

function assertPrivateTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name)
    let stat
    try { stat = lstatSync(item) } catch (error) {
      // SQLite may remove a transient journal between directory listing and stat.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) {
      throw new Error('Chat test storage cannot contain linked or external files')
    }
    if (stat.isDirectory()) assertPrivateTree(item)
  }
}

export function disposableChatRoot(value: unknown): string {
  if (typeof value !== 'string' || !/^\/private\/tmp\/hp-chat-e2e-[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Use a fresh /private/tmp/hp-chat-e2e-* directory for chat tests')
  }
  const root = path.resolve(value)
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) throw new Error('Chat test root must be a real temporary directory')
  // A safe-looking parent must not contain a storage symlink into another store.
  const storage = path.join(root, 'storage')
  try {
    const stat = lstatSync(storage)
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(storage) !== storage) throw new Error('Chat test storage must remain inside its temporary root')
    assertPrivateTree(storage)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return root
}

export function assertDisposableChatProfile(metadata: Record<string, unknown>, baseURL: unknown): void {
  if (metadata.disposableChatProfile !== 1 || typeof metadata.chatBuilt !== 'boolean') throw new Error('Chat tests require the dedicated disposable profile')
  disposableChatRoot(metadata.chatRoot)
  const expected = metadata.chatBuilt ? 'http://127.0.0.1:18583' : 'http://127.0.0.1:18573'
  if (baseURL !== expected) throw new Error('Chat tests refuse a non-profile server URL')
}
