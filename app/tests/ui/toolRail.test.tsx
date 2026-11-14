/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolRail } from '../../src/ui/ToolRail'

afterEach(() => cleanup())

describe('ToolRail interaction guards', () => {
  it('disables Apply while transform mode is active but no candidate tab is active', () => {
    render(
      <ToolRail
        active="transform"
        onSelect={() => {}}
        onApplyTransform={vi.fn()}
        onCancelTransform={vi.fn()}
        isCandidateActive={false}
      />,
    )

    const apply = screen.getByRole('button', { name: /^Apply$/i }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
  })

  it('disables restore/apply actions while a mutation is pending', () => {
    render(
      <ToolRail
        active="transform"
        onSelect={() => {}}
        onApplyTransform={vi.fn()}
        onCancelTransform={vi.fn()}
        isCandidateActive={true}
        isActionPending={true}
      />,
    )

    const apply = screen.getByRole('button', { name: /^Apply$/i }) as HTMLButtonElement
    const transform = screen.getByRole('button', {
      name: /Transform Implant/i,
    }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    expect(transform.disabled).toBe(true)
  })
})
