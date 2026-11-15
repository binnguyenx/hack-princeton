import { expect, it } from 'vitest'
import type { EditorState } from '../src/domain/types'
import { buildChatContext } from '../src/ai/chatContext'

const state = { project: {id:'p'}, cases:[{id:'case'}], samples:[{id:'sample',caseId:'case',sourceAnatomy:{objectId:'source'}}],
  candidates:[{objectId:'candidate',sampleId:'sample',currentRevisionId:'restored-r0'}],
  revisions:[{id:'restored-r0',candidateId:'candidate'},{id:'newer-r1',candidateId:'candidate'}],activeDocumentId:'sample' } as unknown as EditorState
it('resolves source document ids and source selection to canonical identity', () => {
  expect(buildChatContext(state)).toEqual({project_id:'p',case_id:'case',object_id:'source',expected_revision_id:null})
  expect(buildChatContext(state,'source')).toEqual(buildChatContext(state))
})
it('uses the current restored pointer rather than the maximum revision', () => {
  expect(buildChatContext(state,'candidate')?.expected_revision_id).toBe('restored-r0')
})
it('disables absent/unknown/cross-case or invalid revision context', () => {
  expect(buildChatContext(null)).toBeNull()
  expect(buildChatContext(state,'unknown')).toBeNull()
  expect(buildChatContext({...state,cases:[]},'source')).toBeNull()
  expect(buildChatContext({...state,revisions:[]},'candidate')).toBeNull()
})
