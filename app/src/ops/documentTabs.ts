import type { DocumentKind } from '../domain/types'

export type PendingClose = { kind: DocumentKind; id: string }

/** Decide whether a tab close can proceed immediately or needs a dirty confirm. */
export function beginCloseDocument(dirty: boolean): 'close-now' | 'confirm-dirty' {
  return dirty ? 'confirm-dirty' : 'close-now'
}

/** After a successful close, decide whether to open the sample picker (last tab). */
export function afterCloseOpenDocuments(remainingCount: number): 'open-picker' | 'done' {
  return remainingCount <= 0 ? 'open-picker' : 'done'
}
