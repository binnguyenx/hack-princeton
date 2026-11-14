import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export type FeatureHintSide = 'top' | 'right' | 'bottom' | 'left'

export type FeatureHintProps = {
  /** Short feature name shown bold in the popup. */
  label: string
  /** One or two sentences explaining what the control does. */
  description: string
  /** Optional keyboard / mouse gesture shown as a chip. */
  shortcut?: string
  /** Why the control is currently unavailable (amber line). */
  disabledReason?: string
  side?: FeatureHintSide
  sideOffset?: number
  /** Force open — useful in tests and guided demos. */
  open?: boolean
  children: ReactNode
}

/** App-wide hover delay for canvas / chrome feature hints. */
export function FeatureHintProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={280} skipDelayDuration={120}>
      {children}
    </Tooltip.Provider>
  )
}

/**
 * Reusable hover description for buttons and controls.
 * Wraps a single focusable child (button, input, etc.) via Radix Tooltip.
 */
export function FeatureHint({
  label,
  description,
  shortcut,
  disabledReason,
  side = 'top',
  sideOffset = 8,
  open,
  children,
}: FeatureHintProps) {
  // Self-contained Provider so isolated controls (and unit tests) work without
  // a tree-level wrapper. Nested Providers under FeatureHintProvider are fine.
  return (
    <Tooltip.Provider delayDuration={280} skipDelayDuration={120}>
      <Tooltip.Root open={open}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="tooltip-content feature-hint"
            side={side}
            sideOffset={sideOffset}
            collisionPadding={12}
          >
            <div className="tooltip-title">
              <strong>{label}</strong>
              {shortcut ? <span className="tooltip-kbd">{shortcut}</span> : null}
            </div>
            <p className="tooltip-desc">{description}</p>
            {disabledReason ? <p className="tooltip-hint">{disabledReason}</p> : null}
            <Tooltip.Arrow className="tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
