/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SamplePickerDialog } from '../../src/ui/dialogs/SamplePickerDialog'

afterEach(() => cleanup())

describe('SamplePickerDialog (R3, R4, R9)', () => {
  it('selects a sample from search results', () => {
    const onSelect = vi.fn()
    const onQueryChange = vi.fn()
    render(
      <SamplePickerDialog
        open
        onOpenChange={() => {}}
        query=""
        onQueryChange={onQueryChange}
        onSelect={onSelect}
        samples={[
          {
            id: 's1',
            displayName: 'skullbreak-000',
            caseId: 'c1',
            caseName: 'Parietal',
          },
        ]}
      />,
    )
    fireEvent.change(screen.getByRole('searchbox', { name: /Search samples/i }), {
      target: { value: 'skull' },
    })
    expect(onQueryChange).toHaveBeenCalledWith('skull')
    fireEvent.click(screen.getByRole('option', { name: /skullbreak-000/i }))
    expect(onSelect).toHaveBeenCalledWith('s1')
  })

  it('shows empty state when no matches', () => {
    render(
      <SamplePickerDialog
        open
        onOpenChange={() => {}}
        query="zzz"
        onQueryChange={() => {}}
        onSelect={() => {}}
        samples={[]}
      />,
    )
    expect(screen.getByText('No samples match.')).toBeTruthy()
  })
})
