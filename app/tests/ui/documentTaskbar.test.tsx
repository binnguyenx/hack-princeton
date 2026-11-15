/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentTaskbar } from '../../src/ui/DocumentTaskbar'

describe('DocumentTaskbar dirty close affordance', () => {
  it('marks active dirty tab and exposes unsaved close label', () => {
    render(
      <DocumentTaskbar
        documents={[{ kind: 'candidate', id: 'c1' }]}
        activeDocumentId="c1"
        isDirty
        labelFor={() => 'cand-uuid'}
        onActivate={() => {}}
        onClose={vi.fn()}
      />,
    )
    const tab = screen.getByRole('tab')
    expect(tab.className).toContain('is-dirty')
    expect(
      screen.getByRole('button', {
        name: /Unsaved changes — close cand-uuid/,
      }),
    ).toBeTruthy()
  })

  it('uses plain close label when clean', () => {
    render(
      <DocumentTaskbar
        documents={[{ kind: 'candidate', id: 'c1' }]}
        activeDocumentId="c1"
        isDirty={false}
        labelFor={() => 'cand-uuid'}
        onActivate={() => {}}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Close cand-uuid' })).toBeTruthy()
  })
})
