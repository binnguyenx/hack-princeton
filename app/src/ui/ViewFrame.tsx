import type { ReactNode } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { CANVAS_HINTS } from './canvasFeatureHints'
import { FeatureHint } from './FeatureHint'

type Props = {
  label: string
  title: string
  meta?: string
  active?: boolean
  controls?: ReactNode
  maximized?: boolean
  onMaximizeChange?: (maximized: boolean) => void
  children: ReactNode
}

export function ViewFrame({
  label,
  title,
  meta,
  active = false,
  controls,
  maximized = false,
  onMaximizeChange,
  children,
}: Props) {
  const maximizeHint = maximized ? CANVAS_HINTS.restoreView : CANVAS_HINTS.maximizeView

  return (
    <section
      className={`canvas-view-frame ${active ? 'is-active' : ''}`}
      role="region"
      aria-label={label}
      onDoubleClick={() => onMaximizeChange?.(!maximized)}
    >
      <header className="canvas-view-frame__header">
        <span className="canvas-view-frame__title">{title}</span>
        {meta ? <span className="canvas-view-frame__meta">{meta}</span> : null}
        <div className="canvas-view-frame__controls">
          {controls}
          {onMaximizeChange ? (
            <FeatureHint {...maximizeHint} side="bottom">
              <button
                type="button"
                className="canvas-icon-button"
                aria-label={`${maximized ? 'Restore' : 'Maximize'} ${title} view`}
                onClick={(event) => {
                  event.stopPropagation()
                  onMaximizeChange(!maximized)
                }}
              >
                {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </FeatureHint>
          ) : null}
        </div>
      </header>
      <div className="canvas-view-frame__body">{children}</div>
    </section>
  )
}
