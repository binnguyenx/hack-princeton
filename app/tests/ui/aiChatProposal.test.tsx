/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiChatPanel } from '../../src/ui/AiChatPanel'
import { ndjsonResponse } from '../chatStreamMock'

const panelContext = { projectId: 'project', caseId: 'case', objectId: 'cand', revisionId: 'rev-1' }
const proposal = { proposal_id: 'p-1', kind: 'rigid_pose', status: 'pending', summary: 'Shift the candidate 5 mm along x',
  project_id: 'project', case_id: 'case', candidate_id: 'cand', base_revision_id: 'rev-1', conversation_id: 'c',
  payload: { pose: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, created_at: 1, resolved_revision_id: null }

function stubBackend(acceptStatus = 200) {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('/accept')) {
      return new Response(JSON.stringify(acceptStatus === 200
        ? { proposal: { ...proposal, status: 'accepted', resolved_revision_id: 'rev-2' } }
        : { error: 'Candidate revision changed; reload before placement.', code: 'stale-revision' }), { status: acceptStatus })
    }
    if (url.endsWith('/discard')) return new Response(JSON.stringify({ proposal: { ...proposal, status: 'discarded' } }))
    const request = JSON.parse(String(options.body))
    return ndjsonResponse({ request_id: request.request_id, conversation_id: request.conversation_id, mode: 'gemini-read-only',
      outcome: { status: 'completed', explanation: 'I staged a shift for your review.',
        context: { project_id: 'project', case_id: 'case', selected_object_id: 'cand', revision_id: 'rev-1' },
        observation: { scope: 'application-read' } }, staged_proposal: proposal })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function ask(onWorkspaceChanged = vi.fn()) {
  render(<AiChatPanel chatContext={panelContext} open={true} onOpenChange={vi.fn()} onWorkspaceChanged={onWorkspaceChanged} />)
  const input = await waitFor(() => {
    const box = screen.getByLabelText('Message for AI assistant') as HTMLTextAreaElement
    expect(box.disabled).toBe(false)
    return box
  })
  fireEvent.change(input, { target: { value: 'Shift it 5 mm' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message to AI assistant' }))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Proposed change' })).toBeTruthy())
  return onWorkspaceChanged
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('staged proposal review card', () => {
  it('requires an explicit Accept, echoes the proposal identity, then reloads the workspace', async () => {
    const fetch = stubBackend()
    const reload = await ask()
    expect(screen.getByText('Shift the candidate 5 mm along x')).toBeTruthy()
    expect(screen.getByText('Review required')).toBeTruthy()
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/proposals/'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal' }))
    await waitFor(() => expect(screen.getByText('Applied')).toBeTruthy())
    const [url, options] = fetch.mock.calls.find(([target]) => String(target).endsWith('/accept'))!
    expect(url).toBe('/api/ai/proposals/p-1/accept')
    expect(JSON.parse(String(options.body))).toEqual({ project_id: 'project', case_id: 'case', candidate_id: 'cand', base_revision_id: 'rev-1' })
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Accept proposal' })).toBeNull()
  })

  it('discards without writing or reloading', async () => {
    stubBackend()
    const reload = await ask()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.getByText('Discarded')).toBeTruthy())
    expect(reload).not.toHaveBeenCalled()
  })

  it('surfaces a stale-revision rejection and keeps the card unapplied', async () => {
    stubBackend(409)
    const reload = await ask()
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('reload before placement'))
    expect(screen.getByText('Review required')).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
  })
})
