/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavCube } from '../../src/ui/NavCube'

afterEach(() => cleanup())

describe('NavCube', () => {
  it('emits selected standard view preset', () => {
    const onSelect = vi.fn()
    render(<NavCube onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'L' }))
    expect(onSelect).toHaveBeenCalledWith('left')
  })
})
