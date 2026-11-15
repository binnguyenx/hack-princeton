import { useEffect, useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Eye, EyeOff, Lock, Unlock, MoreHorizontal, Trash2 } from 'lucide-react'
import type { Annotation } from '../domain/types'
import type { AnnotationAction } from './annotationActions'

export type AnnotationActionMenuTarget = Pick<
  Annotation,
  'id' | 'name' | 'visible' | 'locked'
>

type SharedProps = {
  ann: AnnotationActionMenuTarget
  onAnnotationAction: (action: AnnotationAction) => void
  onRequestDelete: () => void
}

function ActionButtons({
  ann,
  onAnnotationAction,
  onRequestDelete,
  Item = 'button',
}: SharedProps & {
  Item?: 'button' | typeof DropdownMenu.Item
}) {
  if (Item === 'button') {
    return (
      <>
        <button
          type="button"
          className="annotation-row-menu__item"
          onClick={() =>
            onAnnotationAction({
              type: 'setVisible',
              id: ann.id,
              visible: !ann.visible,
            })
          }
        >
          {ann.visible ? <EyeOff size={14} /> : <Eye size={14} />}
          {ann.visible ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          className="annotation-row-menu__item"
          onClick={() =>
            onAnnotationAction({
              type: 'setLocked',
              id: ann.id,
              locked: !ann.locked,
            })
          }
        >
          {ann.locked ? <Unlock size={14} /> : <Lock size={14} />}
          {ann.locked ? 'Unlock' : 'Lock'}
        </button>
        <div className="annotation-row-menu__sep" role="separator" />
        <button
          type="button"
          className="annotation-row-menu__item annotation-row-menu__item--danger"
          onClick={() => onRequestDelete()}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </>
    )
  }
  const MenuItem = Item
  return (
    <>
      <MenuItem
        className="annotation-row-menu__item"
        onSelect={() =>
          onAnnotationAction({
            type: 'setVisible',
            id: ann.id,
            visible: !ann.visible,
          })
        }
      >
        {ann.visible ? <EyeOff size={14} /> : <Eye size={14} />}
        {ann.visible ? 'Hide' : 'Show'}
      </MenuItem>
      <MenuItem
        className="annotation-row-menu__item"
        onSelect={() =>
          onAnnotationAction({
            type: 'setLocked',
            id: ann.id,
            locked: !ann.locked,
          })
        }
      >
        {ann.locked ? <Unlock size={14} /> : <Lock size={14} />}
        {ann.locked ? 'Unlock' : 'Lock'}
      </MenuItem>
      <DropdownMenu.Separator className="annotation-row-menu__sep" />
      <MenuItem
        className="annotation-row-menu__item annotation-row-menu__item--danger"
        onSelect={() => onRequestDelete()}
      >
        <Trash2 size={14} />
        Delete
      </MenuItem>
    </>
  )
}

/** Panel `⋯` trigger + dropdown (Hide / Lock / Delete). */
export function AnnotationRowMoreMenu({
  ann,
  onAnnotationAction,
  onRequestDelete,
}: SharedProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="annotation-row__more"
          aria-label={`Actions for ${ann.name}`}
          title="More actions"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="annotation-row-menu"
          sideOffset={4}
          align="end"
        >
          <ActionButtons
            Item={DropdownMenu.Item}
            ann={ann}
            onAnnotationAction={onAnnotationAction}
            onRequestDelete={onRequestDelete}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

type ViewportMenuProps = SharedProps & {
  open: boolean
  x: number
  y: number
  onOpenChange: (open: boolean) => void
}

/** Viewport RMB floating menu — same actions as panel `⋯`. */
export function AnnotationViewportActionMenu({
  ann,
  open,
  x,
  y,
  onOpenChange,
  onAnnotationAction,
  onRequestDelete,
}: ViewportMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <div
      ref={ref}
      className="annotation-row-menu annotation-viewport-menu"
      role="menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 40 }}
    >
      <ActionButtons
        ann={ann}
        onAnnotationAction={(action) => {
          onAnnotationAction(action)
          onOpenChange(false)
        }}
        onRequestDelete={() => {
          onRequestDelete()
          onOpenChange(false)
        }}
      />
    </div>
  )
}
