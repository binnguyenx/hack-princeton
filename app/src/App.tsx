import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Object3D } from 'three'
import { installDebugBridge } from './debug/bridge'
import { volumeToDisplayMesh } from './geometry/derivedMesh'
import {
  createCandidate,
  navigateCamera,
  readState,
  restoreRevision,
  transformCandidate,
} from './ops/session'
import { editorStore } from './state/store'
import { ToolRail, type ToolId } from './ui/ToolRail'
import { Viewport } from './viewport/Viewport'
import type { Mat4 } from './domain/types'

const DEMO_URL = '/fixtures/demo-project'
const ctx = { store: editorStore }

const nudgePose: Mat4 = [
  1, 0, 0, 5,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export default function App() {
  const [active, setActive] = useState<ToolId>('navigate')
  const [message, setMessage] = useState<string | null>(null)
  const [signal, setSignal] = useState(false)
  const [mesh, setMesh] = useState<Object3D | null>(null)
  const [tick, setTick] = useState(0)
  const [pendingOpen, setPendingOpen] = useState(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    installDebugBridge(ctx)
    void (async () => {
      try {
        await preloadDemo()
        setMessage('Demo project loaded')
        setSignal(false)
      } catch (e) {
        setSignal(true)
        setMessage(e instanceof Error ? e.message : String(e))
      }
      refresh()
    })()
  }, [refresh])

  async function preloadDemo() {
    // Dynamically import node-free browser loader using fetch of volumes
    const manifest = await (await fetch(`${DEMO_URL}/manifest.json`)).json()
    const volumes = new Map<string, Uint8Array>()
    for (const s of manifest.samples) {
      const id = s.sourceAnatomy.volumeId
      const buf = await (await fetch(`${DEMO_URL}/volumes/${id}.nrrd`)).arrayBuffer()
      volumes.set(id, new Uint8Array(buf))
    }
    const { sha256Hex } = await import('./domain/hash')
    const samples = []
    for (const s of manifest.samples) {
      const bytes = volumes.get(s.sourceAnatomy.volumeId)!
      samples.push({
        ...s,
        sourceAnatomy: {
          ...s.sourceAnatomy,
          volumeHash: await sha256Hex(bytes),
        },
      })
    }
    editorStore.setState({
      user: manifest.user,
      project: manifest.project,
      cases: manifest.cases,
      samples,
      candidates: [],
      revisions: [],
      view: manifest.viewState,
      volumes,
      dirty: false,
    })
    const first = samples[0]
    if (first) {
      try {
        const m = volumeToDisplayMesh(
          volumes.get(first.sourceAnatomy.volumeId)!,
          first.sourceAnatomy.spatial,
          { resolution: 40 },
        )
        setMesh(m)
      } catch (e) {
        setSignal(true)
        setMessage(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const state = useMemo(() => editorStore.getState(), [tick])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (!e.metaKey && !e.ctrlKey) return
      }
      if (e.key === 'v' || e.key === 'V') setActive('select')
      if (e.key === 't' || e.key === 'T') setActive('transform')
      if (e.key === 'Escape') {
        setActive('select')
        setMessage('Cancelled in-progress edit')
        setSignal(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void onSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void onRestore()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function onSave() {
    try {
      // Browser: download is deferred; mark clean for demo shell
      editorStore.update((s) => ({ ...s, dirty: false }))
      setSignal(false)
      setMessage('Saved (session dirty cleared; portable zip export deferred in browser shell)')
      refresh()
    } catch (e) {
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRestore() {
    const st = readState(ctx)
    if (!st.ok || !st.value) return
    const cand = st.value.candidates[0]
    if (!cand) {
      setSignal(true)
      setMessage('No candidate to restore')
      return
    }
    const revs = st.value.revisions
      .filter((r) => r.candidateId === cand.objectId)
      .sort((a, b) => a.order - b.order)
    if (revs.length < 2) {
      setMessage('No earlier revision')
      return
    }
    const prev = revs[revs.length - 2]
    const r = restoreRevision(ctx, {
      candidateId: cand.objectId,
      revisionId: prev.id,
    })
    setSignal(!r.ok)
    setMessage(r.ok ? `Restored ${prev.id}` : r.error)
    refresh()
  }

  async function onAction(id: ToolId) {
    if (id === 'createCandidate') {
      const st = readState(ctx)
      const sampleId = st.ok && st.value?.samples[0]?.id
      if (!sampleId) {
        setSignal(true)
        setMessage('No sample loaded')
        return
      }
      const r = await createCandidate(ctx, sampleId)
      setSignal(!r.ok)
      setMessage(r.ok ? `Created ${r.value.candidateId}` : r.error)
      refresh()
      return
    }
    if (id === 'restore') {
      await onRestore()
      return
    }
    if (id === 'save') {
      await onSave()
      return
    }
    if (id === 'open') {
      const st = editorStore.getState()
      if (st?.dirty) {
        setPendingOpen(true)
        return
      }
      await preloadDemo()
      setMessage('Opened demo project')
      refresh()
    }
  }

  async function applyTransform() {
    const st = readState(ctx)
    const cand = st.ok && st.value?.candidates[0]
    if (!cand) {
      setSignal(true)
      setMessage('Create a candidate first')
      return
    }
    const r = await transformCandidate(ctx, {
      candidateId: cand.objectId,
      pose: nudgePose,
      apply: true,
    })
    setSignal(!r.ok)
    setMessage(r.ok ? `Applied transform ${r.value.revisionId}` : r.error)
    refresh()
  }

  return (
    <div className="editor-shell">
      <ToolRail
        active={active}
        onSelect={(id) => {
          setActive(id)
          if (id === 'transform') void applyTransform()
        }}
        onAction={onAction}
        message={message}
        signal={signal}
      />
      <main className="main">
        <Viewport
          navigate={active === 'navigate'}
          mesh={mesh}
          onCameraChange={(position, target) => {
            navigateCamera(ctx, { position, target })
          }}
        />
        <aside className="inspector" aria-label="Inspector">
          <h1 className="product-title">Workspace</h1>
          <p className="muted">Product name undecided</p>
          {state ? (
            <ul>
              <li>Project: {state.project.id}</li>
              <li>Samples: {state.samples.length}</li>
              <li>Candidates: {state.candidates.length}</li>
              <li>Revisions: {state.revisions.length}</li>
              <li>Dirty: {String(state.dirty)}</li>
              <li>Selection: {state.view.selectionObjectId ?? '—'}</li>
            </ul>
          ) : (
            <p>Loading…</p>
          )}
        </aside>
      </main>
      {pendingOpen ? (
        <div className="modal" role="dialog" aria-modal="true">
          <p>Unsaved changes. Save, discard, or cancel?</p>
          <button
            type="button"
            onClick={async () => {
              await onSave()
              setPendingOpen(false)
              await preloadDemo()
              refresh()
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={async () => {
              setPendingOpen(false)
              await preloadDemo()
              refresh()
            }}
          >
            Discard
          </button>
          <button type="button" onClick={() => setPendingOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  )
}
