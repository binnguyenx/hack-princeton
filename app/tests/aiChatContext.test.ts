import { expect, it } from 'vitest'
import type { EditorState } from '../src/domain/types'
import { buildChatContext } from '../src/ai/chatContext'

const state = { project: {id:'p'}, cases:[{id:'case'}], samples:[{id:'sample',caseId:'case',sourceAnatomy:{objectId:'source'}}],
  candidates:[{objectId:'candidate',sampleId:'sample',currentRevisionId:'restored-r0'}],
  revisions:[{id:'restored-r0',candidateId:'candidate'},{id:'newer-r1',candidateId:'candidate'}],activeDocumentId:'sample' } as unknown as EditorState
it('resolves active source document ids to canonical identity', () => {
  expect(buildChatContext(state)).toEqual({project_id:'p',case_id:'case',object_id:'source',expected_revision_id:null})
})
it('uses the current restored pointer rather than the maximum revision', () => {
  expect(buildChatContext({...state,activeDocumentId:'candidate'})?.expected_revision_id).toBe('restored-r0')
})
it('disables absent/unknown/cross-case or invalid revision context', () => {
  expect(buildChatContext(null)).toBeNull()
  expect(buildChatContext({...state,activeDocumentId:null})).toBeNull()
  expect(buildChatContext({...state,activeDocumentId:'unknown'})).toBeNull()
  expect(buildChatContext({...state,cases:[]})).toBeNull()
  expect(buildChatContext({...state,revisions:[],activeDocumentId:'candidate'})).toBeNull()
})

it('uses the newly active document even when the viewport retains another object selection', () => {
  const two = {...state,view:{selectionObjectId:'source'},samples:[...state.samples,
    {id:'sample-B',caseId:'case',sourceAnatomy:{objectId:'source-B'}}],activeDocumentId:'sample-B'} as unknown as EditorState
  // App passes only the current document as chat authority after the repair.
  expect(buildChatContext(two)).toEqual({project_id:'p',case_id:'case',object_id:'source-B',expected_revision_id:null})
  expect(two.view.selectionObjectId).toBe('source')
})
