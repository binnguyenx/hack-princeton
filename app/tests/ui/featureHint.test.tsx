/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { FeatureHint, FeatureHintProvider } from '../../src/ui/FeatureHint'

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
})

afterEach(() => cleanup())

describe('FeatureHint', () => {
  it('shows label, description, shortcut, and disabled reason when open', () => {
    render(
      <FeatureHintProvider>
        <FeatureHint
          open
          label="Window / Level"
          description="Adjust brightness mapping on slices."
          shortcut="Drag"
          disabledReason="Requires volume intensity data"
        >
          <button type="button">Window / Level mode</button>
        </FeatureHint>
      </FeatureHintProvider>,
    )

    expect(screen.getByText('Window / Level')).toBeTruthy()
    expect(screen.getByText('Adjust brightness mapping on slices.')).toBeTruthy()
    expect(screen.getByText('Drag')).toBeTruthy()
    expect(screen.getByText('Requires volume intensity data')).toBeTruthy()
  })
})
