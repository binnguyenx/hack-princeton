import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Object3D } from 'three'
import { installDebugBridge } from './debug/bridge'
import { volumeToDisplayMesh } from './geometry/derivedMesh'
import { sha256Hex } from './domain/hash'
import type { Mat4 } from './domain/types'
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

const DEMO_URL = '/fixtures/demo-project'
const ctx = { store: editorStore }

const nudgePose: Mat4 = [
  1, 0, 0, 8,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

export default function App() {
  const [active, setActive] = useState<ToolId>('navigate')
  const [message, setMessage] = useState<string | null>(null)
  const [signal, setSignal] = useState(false)
  const [mesh, setMesh] = useState<Object3D | null>(null)
  const [viewportStatus, setViewportStatus] = useState<string | null>('Loading case…')
  const [tick, setTick] = useState(0)
  const [pendingOpen, setPendingOpen] = useState(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const state = useMemo(() => editorStore.getState(), [tick])

  useEffect(() => {
    installDebugBridge(ctx)
    void (async () => {
      try {
        await preloadDemo()
        setMessage('Demo case ready — orbit with Navigate')
        setSignal(false)
      } catch (e) {
        setSignal(true)
        setMessage(e instanceof Error ? e.message : String(e))
        setViewportStatus('Could not load volume')
      }
      refresh()
    })()
  }, [refresh])

  async function buildMeshFromState() {
    const st = editorStore.getState()
    if (!st?.samples[0]) {
      setMesh(null)
      setViewportStatus('No sample loaded')
      return
    }
    const sample = st.samples[0]
    const bytes = st.volumes.get(sample.sourceAnatomy.volumeId)
    if (!bytes) {
      setViewportStatus('Volume bytes missing')
      return
    }
    setViewportStatus('Building surface…')
    // Yield so the status paints before heavy work
    await new Promise((r) => setTimeout(r, 16))
    try {
      const m = volumeToDisplayMesh(bytes, sample.sourceAnatomy.spatial, {
        resolution: 72,
      })
      setMesh(m)
      setViewportStatus(null)
    } catch (e) {
      setMesh(null)
      setSignal(true)
      setMessage(e instanceof Error ? e.message : String(e))
      setViewportStatus('Surface failed — check console')
      throw e
    }
  }

  async function preloadDemo() {
    const manifestRes = await fetch(`${DEMO_URL}/manifest.json`)
    if (!manifestRes.ok) throw new Error('Demo fixture missing — restart with npm run dev')
    const manifest = await manifestRes.json()
    const volumes = new Map<string, Uint8Array>()
    for (const s of manifest.samples) {
      const id = s.sourceAnatomy.volumeId
      const res = await fetch(`${DEMO_URL}/volumes/${id}.nrrd`)
      if (!res.ok) throw new Error(`Missing volume ${id}`)
      volumes.set(id, new Uint8Array(await res.arrayBuffer()))
    }
    const samples = []
    for (const s of manifest.samples) {
      const bytes = volumes.get(s.sourceAnatomy.volumeId)!
      const raw = s.sourceAnatomy
      // Support both nested { spatial } and flattened fixture shapes
      const spatial = raw.spatial ?? {
        units: raw.units ?? 'mm',
        space: raw.space,
        sizes: raw.sizes,
        spacings: raw.spacings,
        bboxMm:
          raw.bboxMm ??
          (raw.sizes && raw.spacings
            ? raw.sizes.map((n: number, i: number) => n * raw.spacings[i])
            : []),
      }
      if (!spatial?.sizes?.length) {
        throw new Error('Sample missing spatial.sizes — check fixture manifest')
      }
      samples.push({
        ...s,
        sourceAnatomy: {
          objectId: raw.objectId,
          sampleId: s.id,
          volumeId: raw.volumeId,
          spatial,
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
    await buildMeshFromState()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (!e.metaKey && !e.ctrlKey) return
      }
      if (e.key === 'v' || e.key === 'V') setActive('select')
      if (e.key === 't' || e.key === 'T') {
        setActive('transform')
        void applyTransform()
      }
      if (e.key === 'Escape') {
        setActive('select')
        setMessage('Cancelled')
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
    editorStore.update((s) => ({ ...s, dirty: false }))
    setSignal(false)
    setMessage('Saved session (portable zip export still deferred)')
    refresh()
  }

  async function onRestore() {
    const st = readState(ctx)
    if (!st.ok || !st.value) return
    const cand = st.value.candidates[0]
    if (!cand) {
      setSignal(true)
      setMessage('Create a candidate first')
      return
    }
    const revs = st.value.revisions
      .filter((r) => r.candidateId === cand.objectId)
      .sort((a, b) => a.order - b.order)
    if (revs.length < 2) {
      setMessage('No earlier revision yet')
      return
    }
    const prev = revs[revs.length - 2]
    const r = restoreRevision(ctx, {
      candidateId: cand.objectId,
      revisionId: prev.id,
    })
    setSignal(!r.ok)
    setMessage(r.ok ? `Restored earlier revision` : r.error)
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
      setMessage(r.ok ? 'Candidate created from source anatomy' : r.error)
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
      setMessage('Create a candidate first, then Transform')
      return
    }
    const r = await transformCandidate(ctx, {
      candidateId: cand.objectId,
      pose: nudgePose,
      apply: true,
    })
    setSignal(!r.ok)
    setMessage(r.ok ? 'Transform applied (new revision)' : r.error)
    refresh()
  }

  return (
    <div className="editor-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <strong>Workspace</strong>
          <span>Cranial case editor · product name undecided</span>
        </div>
        <div className="topbar-meta">
          <span className="chip">{state?.project.name ?? '…'}</span>
          <span className="chip soft">
            {state ? `${state.samples.length} samples` : 'loading'}
          </span>
          {state?.dirty ? <span className="chip">Unsaved</span> : null}
        </div>
      </header>

      <div className="workspace">
        <ToolRail
          active={active}
          onSelect={setActive}
          onAction={onAction}
          onApplyTransform={() => void applyTransform()}
          message={message}
          signal={signal}
        />
        <Viewport
          navigate={active === 'navigate'}
          mesh={mesh}
          status={viewportStatus}
          onCameraChange={(position, target) => {
            navigateCamera(ctx, { position, target })
          }}
        />
        <aside className="inspector" aria-label="Inspector">
          <h2>Case</h2>
          <p className="muted">Source protected · candidates editable</p>
          {state ? (
            <dl>
              <dt>Project</dt>
              <dd>{state.project.id}</dd>
              <dt>Samples</dt>
              <dd>{state.samples.length}</dd>
              <dt>Candidates</dt>
              <dd>{state.candidates.length}</dd>
              <dt>Revisions</dt>
              <dd>{state.revisions.length}</dd>
              <dt>Tool</dt>
              <dd>{active}</dd>
              <dt>Selection</dt>
              <dd>{state.view.selectionObjectId ?? '—'}</dd>
            </dl>
          ) : (
            <p className="muted">Loading project…</p>
          )}
        </aside>
      </div>

      {pendingOpen ? (
        <div className="modal" role="dialog" aria-modal="true">
          <p>Unsaved changes.</p>
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
