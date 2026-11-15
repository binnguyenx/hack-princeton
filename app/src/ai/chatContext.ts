import type { EditorState } from '../domain/types'

export type ChatContext = {
  project_id: string
  case_id: string
  object_id: string
  expected_revision_id: string | null
}

/** Anchor chat to the visible document; viewport selection remains independent. */
export function buildChatContext(state: EditorState | null): ChatContext | null {
  if (!state) return null
  const id = state.activeDocumentId
  if (!id) return null
  const candidate = state.candidates.find(row => row.objectId === id)
  const sample = state.samples.find(row => candidate ? row.id === candidate.sampleId : row.id === id || row.sourceAnatomy.objectId === id)
  if (!sample || !state.cases.some(row => row.id === sample.caseId)) return null
  if (candidate && !state.revisions.some(row => row.id === candidate.currentRevisionId && row.candidateId === candidate.objectId)) return null
  return { project_id: state.project.id, case_id: sample.caseId,
    object_id: candidate?.objectId ?? sample.sourceAnatomy.objectId,
    expected_revision_id: candidate?.currentRevisionId ?? null }
}

export function chatContextKey(context?: ChatContext | null): string {
  return context ? JSON.stringify([context.project_id, context.case_id, context.object_id, context.expected_revision_id]) : ''
}
