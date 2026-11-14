import type { EditorState, ViewState } from '../domain/types'

export function emptyViewState(): ViewState {
  return {
    selectionObjectId: null,
    camera: { position: [0, 0, 400], target: [0, 0, 0] },
    visibility: {},
    inspectionPlane: { enabled: false, axis: 'z', offset: 0 },
  }
}

/** Mutable session holder for the one open project. */
export class EditorStore {
  private state: EditorState | null = null

  getState(): EditorState | null {
    return this.state
  }

  setState(next: EditorState | null): void {
    this.state = next
  }

  requireState(): EditorState {
    if (!this.state) throw new Error('No project open')
    return this.state
  }

  update(mutator: (s: EditorState) => EditorState): EditorState {
    const next = mutator(this.requireState())
    this.state = next
    return next
  }
}

export const editorStore = new EditorStore()
