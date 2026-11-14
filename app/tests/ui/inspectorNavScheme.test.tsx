/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Inspector } from '../../src/ui/Inspector'
import type { EditorState } from '../../src/domain/types'

afterEach(() => cleanup())

function makeState(): EditorState {
  return {
    user: { id: 'u1', displayName: 'User' },
    project: { id: 'p1', ownerUserId: 'u1', name: 'P' },
    cases: [],
    samples: [],
    candidates: [],
    revisions: [],
    view: {
      selectionObjectId: null,
      camera: { position: [0, 0, 1], target: [0, 0, 0] },
      visibility: {},
      inspectionPlane: { enabled: false, axis: 'z', offset: 0 },
      navigationScheme: 'blender-like',
    },
    volumes: new Map(),
    dirty: false,
    openDocuments: [],
    activeDocumentId: null,
  }
}

describe('Inspector scope', () => {
  it('does not expose obsolete navigation-scheme preferences', () => {
    render(
      <Inspector
        state={makeState()}
        activeTool="select"
        onRestoreRevision={() => {}}
      />,
    )

    expect(screen.queryByLabelText(/Navigation scheme/i)).toBeNull()
  })
})
