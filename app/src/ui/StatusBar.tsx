type Props = {
  activeTool: string
  selectionCount: number
  isPending: boolean
  navigationHint: string
}

export function StatusBar({ activeTool, selectionCount, isPending, navigationHint }: Props) {
  return (
    <div className="canvas-status-bar" role="status" aria-live="polite">
      <span>Tool: {activeTool}</span>
      <span>Selection: {selectionCount}</span>
      <span>{isPending ? 'Pending changes' : 'Ready'}</span>
      <span>{navigationHint}</span>
    </div>
  )
}
