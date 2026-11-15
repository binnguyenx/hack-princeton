 # Plan: Mechanical last parts — annotation, measurement, and spatial markup

   Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-15

> Historical: implemented 2026-11-14. See Deviations.

   ## Approach

   Build in vertical slices — one behavioral rule red, then green, then next rule.
   Each slice adds one coherent unit: data model, ops, storage, API, then UI on
   top. The slices are ordered so every step produces something demonstrable
   and all code is wired by the end of its slice rather than parked for later.

   The two key architectural constraints driving the order:
   1. `annotationMeasure.ts` has no dependencies — write it first so every
      measurement assertion is available from step 1.
   2. `AnnotationOverlay` depends on the Three.js `runtime.scene` ref inside
      `Viewport`. `Viewport` does not expose `children` or `onSceneReady` today,
      so Step 7 adds a minimal `annotations` prop and a `useEffect` that mutates
      `runtime.scene` directly — the same pattern already used for `mesh`.

   Phase 1 (Steps 1–8) ends with a fully wired landmark → panel → persist loop.
   Phase 2 (Steps 9–13) extends every layer without touching Phase 1 contracts.

   ---

   ## Files that change

   ### New files
   - `app/src/geometry/annotationMeasure.ts` — pure measurement math (R13, R14, R26, R31, R42, R48, R53, R57)
   - `app/src/viewport/AnnotationOverlay.tsx` — Three.js overlay component (R17, R22, R26, R35, R43, R47,
   R63)
   - `app/server/storageSqlite.ts` — annotations table, listAnnotations, createAnnotation, updateAnnotation,
   deleteAnnotation, projectManifest join (R4, R20, S8, S11, S12)
   - `app/tests/annotationMeasure.test.ts` — unit tests for all math functions (S4, S14, S16, S17)
   - `app/tests/annotationOps.test.ts` — unit tests for in-memory ops: guards, state mutations, publicOps
   surface (R1, R6, R7, R9–R15, S9)
   - `app/tests/annotationStorage.test.ts` — backend CRUD + cascade + manifest join tests (R4, R5, R20, S8,
   S11, S12, S13)
   - `app/tests/ui/inspector.annotation.test.tsx` — component tests for AnnotationList, AnnotationRow, Place
   button gate (R16, R71–R77, S6, S7, S9)
   - `app/e2e/annotation-phase1.spec.ts` — E2E: landmark, line, curve, text note, persist, restore, cascade
   (S1–S13)
   - `app/e2e/annotation-phase2.spec.ts` — E2E: angle, plane, open curve, ROI, highlight, stale-mesh warning
   (S14–S21)

   ### Modified files
   - `app/src/domain/types.ts` — add `Annotation`, `AnnotationType`, `RasPoint`; add `annotations:
   Annotation[]` to `EditorState` (R2, R6)
   - `app/src/state/store.ts` — `emptyViewState` and `emptyEditorState` helpers include `annotations: []`
   (R6)
   - `app/src/ops/session.ts` — add `addAnnotation`, `updateAnnotationPoints`, `updateAnnotationMeta`,
   `renameAnnotation`, `setAnnotationLocked`, `setAnnotationVisible`, `deleteAnnotation`; patch
   `createProject` and `seedEmptyProject` to include `annotations: []` (R1, R2, R6–R15)
   - `app/src/ops/index.ts` — export all annotation ops in `publicOps` (R7, R9)
   - `app/src/io/projectPackage.ts` — add `annotations?: Annotation[]` to `ProjectManifest`; patch
   `saveProjectPackage` and `loadProjectPackage` (R5, S13)
   - `app/server/api.ts` — add four annotation routes (R4)
   - `app/src/api/client.ts` — add `createAnnotation`, `updateAnnotation`, `deleteAnnotation`,
   `listAnnotations` typed methods (R8)
   - `app/src/viewport/Viewport.tsx` — add `annotations` prop; `useEffect` adds/removes Three.js annotation
   objects to `runtime.scene` via `AnnotationOverlay` logic; mesh prop-thread includes `displayMesh` for
   highlight overlay (R17, D10)
   - `app/src/ui/Inspector.tsx` — add `annotations` and `activeRevisionId` and `onAnnotationAction` props;
   add `AnnotationList` section below revision history (R16, R71–R77)
   - `app/src/ui/CanvasWorkspace.tsx` — add `activeAnnotationType`, `inProgressPoints`, `annotations`,
   `onAnnotationTypeChange`, `onAnnotationPlace` props; render `AnnotationTypeSelector` in `ContextStrip`
   when Place mode active (R15, R19, R39, R68)
   - `app/src/App.tsx` — add `annotations` state slice, `handleAddAnnotation`, `handleUpdateAnnotation`,
   `handleDeleteAnnotation` handlers; patch `setStoreFromManifest` to include `annotations`; pass annotation
   props down to `CanvasWorkspace`, `Inspector`, `Viewport` (R6–R8)
   - `app/src/App.css` — annotation glyph, label, panel row, type-selector, in-progress, and highlight
   overlay styles (ui-journeys.md visual tokens)

   ---

   ## Order of work

   ### Step 1 — Measurement math (RED → GREEN, no dependencies)

   **Goal:** Pure functions for every measurement the spec requires, proven by
   exact numeric assertions against worked examples.

   **Write first (RED):**
   `app/tests/annotationMeasure.test.ts` — import the not-yet-existing module
   and write one `it` per function:
   - `lineDistance([0,0,0],[3,4,0])` → `5` (3-4-5 triangle)
   - `closedCurveLength([[0,0,0],[1,0,0],[1,1,0],[0,1,0]])` → `4` (unit square, closing edge included)
   - `openCurveLength([[0,0,0],[1,0,0],[1,1,0]])` → `2` (two edges, no closing)
   - `angleDegrees([1,0,0],[0,0,0],[-1,0,0])` → `180`; `angleDegrees([1,0,0],[0,0,0],[0,1,0])` → `90`
   - `roiVolume([0,0,0],[3,4,5])` → `60`
   - `landmarkCoord([1.234,5.678,-9.012])` → `'R 1.23 · A 5.68 · S -9.01 mm'`

   Confirm all fail because the module doesn't exist.

   **Implement (GREEN):**
   `app/src/geometry/annotationMeasure.ts` — exact formulas from spec.
   Run `cd app && npm test -- annotationMeasure` after each function until green.

   **Proof:** `cd app && npm test -- annotationMeasure.test.ts`
   Maps to: R13, R14, R26, R31; S4, S14, S16, S17

   ---

   ### Step 2 — Domain types and EditorState construction sites (RED → GREEN)

   **Goal:** TypeScript compiles with `Annotation`, `AnnotationType`, `RasPoint`
   in domain types, and all `EditorState` construction sites include `annotations: []`
   so the app does not break when these fields are accessed.

   **Write first (RED):**
   `app/tests/annotationOps.test.ts` — write one assertion:
   ```ts
   it('EditorState from createProject includes empty annotations array', () => {
     const ctx = freshCtx()
     createProject(ctx, { name: 'T' })
     const s = readState(ctx)
     expect(s.ok && s.value?.annotations).toEqual([])
   })

   Confirm it fails (property does not exist).

   Implement (GREEN):
   1. Add to app/src/domain/types.ts: AnnotationType, RasPoint, Annotation, and annotations: Annotation[] on
   EditorState.
   2. Patch emptyViewState or add emptyEditorState default to app/src/state/store.ts if one exists; add
   annotations: [].
   3. Patch createProject, seedEmptyProject in session.ts to spread annotations: [].
   4. Patch setStoreFromManifest in App.tsx to include annotations: manifest.annotations ?? [].
   5. Patch loadProjectPackage in projectPackage.ts to return annotations: manifest.annotations ?? [].
   6. Add annotations?: Annotation[] to ProjectManifest type.

   Run cd app && npm run build — zero TypeScript errors is the proof here. Then run the new test: cd app &&
   npm test -- annotationOps.test.ts

   Proof: cd app && npm run build && npm test -- annotationOps.test.ts Maps to: R2, R5, R6; S13 (partial)

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 3 — In-memory annotation ops (RED → GREEN, one op at a time)

   Goal: Seven annotation ops in session.ts, exported through publicOps, each provably enforcing their spec
   invariants against EditorState.

   TDD loop — one op per cycle:

   For each op, add one it to annotationOps.test.ts, run to red, implement the minimum in session.ts, run to
   green.

   Ops in order (each cycle = RED → GREEN):

   1. addAnnotation — it('rejects when active doc is source anatomy'), then it('adds annotation with
   generated id, revision ownership, and created_at'). Guard: revisionId must exist in state.revisions; must
   belong to a candidate (not sourceAnatomy.objectId); all points must be finite.

   2. renameAnnotation — it('updates name, leaves other fields unchanged').

   3. setAnnotationVisible / setAnnotationLocked — it('toggles visible flag only'), it('toggles locked flag
   only').

   4. updateAnnotationPoints — it('replaces points array, marks state dirty'). Guard: all coordinates finite.

   5. updateAnnotationMeta — it('merges meta fields').

   6. deleteAnnotation — it('removes the annotation from state'), it('no-ops on unknown id rather than
   throwing').

   After all six cycles: add one it confirming all seven ops appear in publicOps:

   it('all annotation ops are in publicOps', () => {
     const keys = Object.keys(publicOps)
     for (const name of ['addAnnotation','renameAnnotation','setAnnotationVisible',
          'setAnnotationLocked','updateAnnotationPoints','updateAnnotationMeta','deleteAnnotation'])
       expect(keys).toContain(name)
   })

   Implement: app/src/ops/session.ts and app/src/ops/index.ts. Use newId('ann') for new IDs, new
   Date().toISOString() for createdAt.

   Proof: cd app && npm test -- annotationOps.test.ts Maps to: R1, R2, R7, R9–R15; S9

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 4 — SQLite storage and manifest join (RED → GREEN)

   Goal: annotations table in SQLite with cascade FK; four CRUD helpers; getProjectManifest includes
   annotations; saveProjectPackage / loadProjectPackage round-trip annotations.

   Write first (RED): app/tests/annotationStorage.test.ts — follows the backendCrud.test.ts pattern exactly:
   mkdtemp, setStorageRootForTests, beforeEach/afterEach.

   One test at a time, in order:

   1. table schema — it('annotations table exists in initDb'): create project → add sample → createCandidate
   → call createAnnotation → no throw. Confirm row is returned with correct fields.

   2. manifest join — it('getProjectManifest includes annotations for all revisions'): create annotation,
   re-fetch manifest, assert manifest.annotations contains the annotation.

   3. CRUD — it('createAnnotation / updateAnnotation / deleteAnnotation roundtrip').

   4. cascade from candidate delete — it('deleteCandidate cascades to annotations'): create annotation,
   deleteCandidate, call listAnnotations(revisionId), assert empty. Maps to S11.

   5. cascade from sample delete — it('removeSample cascades through candidates to annotations'). Maps to
   S12.

   6. ProjectManifest round-trip — it('saveProjectPackage / loadProjectPackage round-trips annotations'):
   create annotation in ops state, call saveProjectPackage to a temp dir, call loadProjectPackage, assert
   state.annotations matches. Maps to S13.

   Implement in order:
   1. Add CREATE TABLE IF NOT EXISTS annotations DDL to initDb in storageSqlite.ts, after
   candidate_revisions, with ON DELETE CASCADE.
   2. Implement listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation helpers.
   3. Patch projectManifest query to LEFT JOIN annotations and include in return type.
   4. Add four routes to api.ts.
   5. Add four methods to app/src/api/client.ts.
   6. Patch saveProjectPackage and loadProjectPackage in projectPackage.ts.

   Proof: cd app && npm test -- annotationStorage.test.ts Maps to: R4, R5, R8, R20; S8, S11, S12, S13

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 5 — App.tsx handlers and prop threading (RED → GREEN)

   Goal: App.tsx gains handleAddAnnotation, handleUpdateAnnotation, handleDeleteAnnotation; state.annotations
    filtered by active revision is propagated to Inspector and Viewport; setStoreFromManifest includes
   annotations; existing tests stay green.

   Write first (RED): Extend app/tests/annotationOps.test.ts with an integration-style test verifying the
   setStoreFromManifest path includes annotations:

   it('setStoreFromManifest preserves annotations from manifest', () => {
     const ann: Annotation = { id: 'ann-001', revisionId: 'rev-001', type: 'landmark',
       name: 'L1', points: [[1,2,3]], meta: {}, locked: false, visible: true,
       createdAt: '2026-01-01T00:00:00Z' }
     // Simulate what App.tsx setStoreFromManifest does
     editorStore.setState({ ...baseState, annotations: [ann] })
     const s = editorStore.getState()
     expect(s?.annotations).toHaveLength(1)
   })

   Implement:
   1. Add annotations: Annotation[] useState in App.tsx, initialised from state.annotations.
   2. Add handleAddAnnotation(args): call addAnnotation(ctx, args) → if ok, call
   apiClient.createAnnotation(revisionId, args) → loadProject.
   3. Add handleUpdateAnnotation(id, patch): call update op → apiClient.updateAnnotation(id, patch) →
   loadProject.
   4. Add handleDeleteAnnotation(id): call deleteAnnotation(ctx, {id}) → apiClient.deleteAnnotation(id) →
   loadProject.
   5. Derive activeRevisionAnnotations = state?.annotations.filter(a => a.revisionId === activeRevisionId).
   6. Pass annotations={activeRevisionAnnotations} and activeRevisionId and onAnnotationAction to Inspector
   and Viewport.
   7. Patch Inspector props: add annotations: Annotation[], activeRevisionId: string | null,
   onAnnotationAction.
   8. Patch Viewport props: add annotations: Annotation[], displayMesh: THREE.Object3D | null (the existing
   mesh state can be reused directly).

   Proof: cd app && npm run build (zero TS errors) + cd app && npm test Maps to: R6, R7, R8; validates S13
   path is wired

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 6 — Annotation panel UI: AnnotationList in Inspector (RED → GREEN)

   Goal: Inspector renders an "Annotations" section — empty state, list of rows, Place button gate for source
   anatomy. Vitest + jsdom component tests.

   Write first (RED): app/tests/ui/inspector.annotation.test.tsx — /** @vitest-environment jsdom */

   One test at a time:
   1. it('shows empty state when annotations array is empty') — render Inspector with annotations=[] and
   candidateActive; assert No annotations yet visible.
   2. it('renders a row for each annotation') — pass two landmark annotations; assert both names appear.
   3. it('Place annotation button is disabled with reason when source anatomy is active') — pass
   annotations=[] and isCandidateActive=false; assert button is aria-disabled and tooltip contains "Requires
   active candidate".
   4. it('expanded row shows RAS coordinates for a landmark') — click a row; assert R/A/S values visible.
   5. it('visibility icon toggles call onAnnotationAction with setVisible').
   6. it('lock icon toggles call onAnnotationAction with setLocked').
   7. it('delete button on row with measurement result shows inline confirmation before firing').

   Implement: Add AnnotationList as an inline section in Inspector.tsx.
   - Section header: "Annotations" + count badge + "Place annotation" button.
   - Empty state: MapPin icon + copy.
   - Each row: Collapsible from Radix, collapsed default.
   - Expanded landmark: name (editable on click), RAS two dp, Jump-to button.
   - Icons: visibility (Eye/EyeOff), lock (Lock/Unlock), delete (Trash2) — all from lucide-react.
   - Delete with measurement: inline confirm replaces row body.
   - CSS in App.css: .annotation-list, .annotation-row, .annotation-row--expanded, .annotation-row-actions,
   .annotation-row-confirm.
   - Tokens: accent #2F6BFF, ink-muted #8B929A, elevated #FFFFFF, border #E4E6EA, rounded.sm 8px — per
   DESIGN.md.

   Proof: cd app && npm test -- inspector.annotation.test.tsx Maps to: R16, R71–R77; S6, S7, S9

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 7 — AnnotationOverlay (Three.js) + Viewport wiring (RED → GREEN)

   Goal: Viewport gains annotations prop; AnnotationOverlay adds/updates/removes Three.js sphere glyphs,
   Line2 segments, and Sprite labels directly on runtime.scene via a useEffect. displayMesh prop carries the
   loaded mesh for highlight overlay access in Phase 2.

   Key design: Viewport's sceneRef is a ref to Runtime, which contains runtime.scene. The pattern to use is a
   new useEffect in Viewport.tsx keyed on annotations that:

   useEffect(() => {
     const runtime = sceneRef.current
     if (!runtime) return
     // remove old annotation objects by name/userData tag
     // add new ones
   }, [annotations])

   This is identical to the existing mesh effect (keyed on [mesh, objectId]). No new scene or renderer
   needed.

   Write first (RED): app/tests/annotationOverlay.test.ts — these are unit tests for the pure helper
   functions inside AnnotationOverlay.tsx (the functions that build Three.js objects from an Annotation),
   tested in a node environment with the three package available:

   1. it('buildGlyph returns a Mesh with SphereGeometry for landmark') — call buildGlyph({type:'landmark',
   ...}), assert result instanceof THREE.Mesh.
   2. it('buildLine returns a Line object for a 2-point line annotation').
   3. it('buildCurveGeometry returns correct vertex count for closed curve') — 4 points closed → 4 segments →
   5 vertices (last = first).
   4. it('buildLabel returns a Sprite for text note').

   Implement app/src/viewport/AnnotationOverlay.tsx: Export pure builder functions (testable in node) and a
   React component AnnotationOverlay that is consumed by Viewport.tsx:
   - buildGlyph(ann: Annotation): THREE.Mesh — SphereGeometry(1.5), MeshBasicMaterial({ color: 0x2F6BFF }),
   userData.annotationId.
   - buildLine(ann: Annotation): THREE.Line — BufferGeometry from two points.
   - buildCurvePolyline(ann: Annotation, closed: boolean): THREE.Line — segments including closing edge if
   closed.
   - buildLabel(ann: Annotation, text: string): THREE.Sprite — SpriteMaterial with canvas-rendered text.
   - AnnotationOverlay component: not a React component — it is a hook-shaped function called by
   Viewport.tsx's useEffect:

   // Called from inside Viewport.tsx useEffect
   function syncAnnotationObjects(
     scene: THREE.Scene,
     annotations: Annotation[],
     prevRef: React.MutableRefObject<Map<string, THREE.Object3D[]>>
   ): void

   This avoids the complexity of a React component trying to imperatively mutate an existing Three.js scene.
   The function diffs the previous map of annotationId → Object3D[] against the new annotations array,
   removes stale objects, and adds new ones.

   Patch Viewport.tsx:
   1. Add annotations?: Annotation[] to Props.
   2. Add annotationObjectsRef = useRef<Map<string, THREE.Object3D[]>>(new Map()).
   3. Add useEffect(() => { if (!sceneRef.current) return; syncAnnotationObjects(sceneRef.current.scene,
   annotations ?? [], annotationObjectsRef) }, [annotations]).
   4. Add displayMesh?: THREE.Object3D | null to Props (passed through for highlight overlay use in Phase 2;
   not consumed by the overlay sync function until Step 12).

   Proof: cd app && npm test -- annotationOverlay.test.ts (pure functions) Then: cd app && npm run build (TS
   clean) Maps to: R17; partial S1 (glyph existence)

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 8 — ContextStrip type selector (Place mode UX) (RED → GREEN)

   Goal: CanvasWorkspace renders AnnotationTypeSelector in ContextStrip when Place mode is active. Active
   type is highlighted. Escape with zero in-progress points exits Place mode; Escape with in-progress points
   clears them without touching committed annotations.

   Write first (RED): Extend app/tests/ui/canvasWorkspace.test.tsx (already exists):

   1. it('shows annotation type buttons in ContextStrip when Place mode is active') — render CanvasWorkspace
   with activeMode='place'; assert Landmark, Distance Line, Closed Curve, Text Note buttons visible.
   2. it('annotation type buttons absent when mode is not place') — activeMode='view'; assert buttons absent.
   3. it('Place annotation button in Inspector fires onModeChange to place') — verify callback.
   4. it('source anatomy active: annotation type buttons absent') — pass isCandidateActive=false.

   Implement: Add activeAnnotationType: AnnotationType | null, onAnnotationTypeChange, onAnnotationPlace,
   annotations, isCandidateActive props to CanvasWorkspace. Add AnnotationTypeSelector inline in ContextStrip
    section of CanvasWorkspace.tsx:

   {activeMode === 'place' && isCandidateActive && (
     <AnnotationTypeSelector
       active={activeAnnotationType}
       onChange={onAnnotationTypeChange}
       onPlace={onAnnotationPlace}
     />
   )}

   The in-progress placement state (inProgressPoints: RasPoint[]) is useState local to CanvasWorkspace.
   Escape handler: if inProgressPoints.length > 0 clear them; else call onModeChange('view'). Switching type
   mid-placement: show inline confirm strip.

   Add CSS for .annotation-type-selector, .annotation-type-btn, .annotation-type-separator in App.css.

   Proof: cd app && npm test -- canvasWorkspace.test.tsx Maps to: R15, R19, R39–R41; S9, S10

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 9 — Phase 1 E2E: full landmark → persist loop (RED → GREEN)

   Goal: One Playwright test proves S1–S13 observably: place landmark, verify glyph, verify panel row, verify
   persist across reload, verify cascade.

   Write app/e2e/annotation-phase1.spec.ts:

   import { expect, type Page, test } from '@playwright/test'

   async function openCandidateCanvas(page: Page) { /* ... same pattern as canvas-workflow.spec.ts */ }

   test('S1 landmark placed appears in panel and matches crosshair RAS', async ({ page }) => { ... })
   test('S2 landmark row click jumps slice views', async ({ page }) => { ... })
   test('S3 distance line live update on drag', async ({ page }) => { ... })
   test('S4 closed curve length is sum of segments', async ({ page }) => { ... })
   test('S5 text note body updates viewport label', async ({ page }) => { ... })
   test('S6 hide annotation removes glyph, keeps panel row', async ({ page }) => { ... })
   test('S7 locked annotation cannot be dragged', async ({ page }) => { ... })
   test('S8 persist: annotations survive project close and reopen', async ({ page }) => { ... })
   test('S9 source anatomy active: Place button disabled', async ({ page }) => { ... })
   test('S10 Escape mid-curve clears in-progress only', async ({ page }) => { ... })
   test('S11-S12 cascade: deleting candidate removes annotations', async ({ page }) => { ... })
   test('S13 file package round-trip preserves annotations', async ({ page }) => { ... })

   Each test uses page.evaluate(() => window.__hackPrincetonDebug) to read state.annotations and viewport
   Three.js object counts for behavioral assertions, rather than purely visual pixel checks (consistent with
   the existing canvas-workflow test pattern).

   Proof: cd app && npx playwright test e2e/annotation-phase1.spec.ts Maps to: S1–S13

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 10 — Phase 2 angle, open curve, ROI (RED → GREEN)

   Goal: Add angle, open curve, and ROI annotation types — ops, storage, panel rows, overlay objects, and
   ContextStrip buttons.

   The measurement functions (angleDegrees, openCurveLength, roiVolume) are already proven from Step 1. This
   step wires them through the full stack.

   TDD cycles (each: extend test → implement → green):

   1. annotationOps.test.ts: addAnnotation with type 'angle' accepts 3 points.
   2. annotationOps.test.ts: addAnnotation with type 'open_curve' accepts 2+ points.
   3. annotationOps.test.ts: addAnnotation with type 'roi' accepts 2 points; meta_json serializes {min, max}.
   4. annotationStorage.test.ts: each type persists and round-trips through manifest.
   5. inspector.annotation.test.tsx: expanded row for angle shows degree value; ROI shows extents and volume.
   6. AnnotationOverlay builder functions: buildAngleArc, buildROIBox.

   ContextStrip: Add Phase 2 separator and three new type buttons. No sub-selector needed for these three
   types.

   Proof: cd app && npm test (all unit suites green) Maps to: R42–R45, R52–R59; partial S14, S16, S17

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 11 — Phase 2 plane annotation (RED → GREEN)

   Goal: Plane annotation with Point-normal and Three-point placement methods; optional Show-in-slice-dock
   toggle; area measurement.

   TDD cycles:

   1. annotationOps.test.ts: addAnnotation({type:'plane', meta:{method:'point-normal'}}) with 1 point
   succeeds.
   2. annotationStorage.test.ts: plane with meta.sliceDockActive=true round-trips meta_json.
   3. inspector.annotation.test.tsx: expanded plane row shows normal vector, area, and Switch for slice dock.
   4. annotationOverlay.test.ts: buildPlane returns a THREE.Mesh with PlaneGeometry and THREE.EdgesGeometry
   outline.

   Slice dock integration: When sliceDockActive is toggled on, call
   onAnnotationAction({type:'showPlaneInDock', annotationId}) from Inspector. App.tsx handler translates this
   into the existing SliceDock orientation/offset state (the same mechanism used by the crosshair today).

   Proof: cd app && npm test + cd app && npm run build Maps to: R46–R51; S15

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 12 — Phase 2 surface highlight (RED → GREEN)

   Goal: Paint-mode brush on candidate mesh; triangle index accumulation; color selector; Clear; stale-mesh
   detection.

   TDD cycles:

   1. annotationOps.test.ts: addAnnotation({type:'highlight', meta:{color:'accent',
   triangleIndices:[0,1,2]}}) stores indices in meta.
   2. annotationOps.test.ts: updateAnnotationMeta appending new triangle indices accumulates correctly.
   3. annotationStorage.test.ts: meta_json round-trips a large triangleIndices array.
   4. inspector.annotation.test.tsx: highlight row shows triangle count, color selector buttons, Clear
   button.
   5. annotationOverlay.test.ts: buildHighlightOverlay(ann, mesh) — given a THREE.BufferGeometry mesh with 10
   triangles, returns a THREE.Mesh whose index buffer contains only the specified triangle indices. Assert
   index count = triangleIndices.length * 3.
   6. annotationOverlay.test.ts: buildHighlightOverlay with out-of-range index returns null and fires the
   stale-mesh callback (S21).

   Viewport wiring: Viewport.tsx's displayMesh prop (added in Step 7) is now read inside
   syncAnnotationObjects for highlight types — the mesh's geometry is accessed to build the filtered index
   buffer.

   ContextStrip: Add Surface Highlight button to Phase 2 group; show brush-radius slider and color radio
   buttons only when Highlight is active type.

   Paint interaction: In App.tsx canvas pointer-down handler, when Place mode + Highlight type active,
   raycasting hits the display mesh — the hit triangle index is accumulated into the in-progress highlight's
   meta.triangleIndices. On pointer-up, commit via handleUpdateAnnotation.

   Proof: cd app && npm test -- annotationOverlay.test.ts annotationOps.test.ts inspector.annotation.test.tsx
    Maps to: R60–R67; S18, S19, S21

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Step 13 — Phase 2 E2E + full regression (RED → GREEN)

   Goal: Playwright E2E for Phase 2 types; full suite green.

   app/e2e/annotation-phase2.spec.ts:

   test('S14 angle markup degree value matches formula', async ({ page }) => { ... })
   test('S15 plane Show in slice dock adds and removes slice', async ({ page }) => { ... })
   test('S16 open curve length is sum without closing edge', async ({ page }) => { ... })
   test('S17 ROI resize updates volume display', async ({ page }) => { ... })
   test('S18 highlight Clear removes overlay, row remains', async ({ page }) => { ... })
   test('S19 highlight button disabled without candidate mesh', async ({ page }) => { ... })
   test('S20 all nine annotation types listed in panel', async ({ page }) => { ... })
   test('S21 stale-mesh warning renders in panel row', async ({ page }) => { ... })

   Then run the full proof suite.

   Proof: cd app && npm test && npm run build && npx playwright test Maps to: S14–S21 and regression over all
   previous S1–S13

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Risks

   R-A — runtime.scene mutation from outside the render setup effect. sceneRef.current can be null between
   rendererNonce changes. Guard every syncAnnotationObjects call with if (!sceneRef.current) return. Test:
   forced rendererNonce increment followed by annotation read in E2E.

   R-B — Vitest environment mismatch for Three.js tests. app/vite.config.ts defaults to environment: 'node'.
   Three.js does not require a DOM for geometry construction, but SphereGeometry and BufferGeometry must be
   available. Confirm three is importable in node environment before Step 7. If WebGL bindings fail, mock
   only the renderer, not the geometry classes. No @vitest-environment jsdom needed for overlay unit tests.

   R-C — Inspector now reads both EditorState and new annotation props. Currently Inspector derives
   everything from state: EditorState | null. After Step 5 it also takes annotations, activeRevisionId, and
   onAnnotationAction. The existing ui/inspector test (tests/ui/inspector.annotation.test.tsx) must pass a
   conforming annotations prop or the whole Inspector render will fail. Run the existing appShell.test.tsx
   after Step 6 to catch regressions.

   R-D — projectManifest SQL join performance. The join is a LEFT JOIN from candidate_revisions to
   annotations. On demo scale (< 50 annotations) this is negligible. The existing backend CRUD suite
   (backendCrud.test.ts) uses a temp SQLite and will catch query syntax errors before they reach the browser.

   R-E — publicOps symbol naming collision. deleteAnnotation conflicts with no existing op name, but
   addAnnotation and updateAnnotationPoints are new names that must not shadow any existing session export.
   After Step 3, run cd app && npm test to confirm no existing test regresses from the name additions.

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────

   Proof

   ┌───────────────────────────────────────────┬────────────────────────────────────────────────────────┐
   │ Requirement group                         │ Command                                                │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Measurement math (R13, R14, R26, R31,     │ cd app && npm test -- annotationMeasure.test.ts        │
   │ R42, R53, R57)                            │                                                        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Domain types + EditorState construction   │ cd app && npm run build (zero TS errors)               │
   │ (R2, R5, R6)                              │                                                        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ In-memory ops and publicOps surface (R1,  │ cd app && npm test -- annotationOps.test.ts            │
   │ R7, R9–R15)                               │                                                        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Storage, cascade, manifest join (R4, R20) │ cd app && npm test -- annotationStorage.test.ts        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ File package round-trip (R5)              │ cd app && npm test -- annotationStorage.test.ts (S13   │
   │                                           │ case)                                                  │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Annotation panel UI (R16, R71–R77)        │ cd app && npm test -- ui/inspector.annotation.test.tsx │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ AnnotationOverlay Three.js builders (R17) │ cd app && npm test -- annotationOverlay.test.ts        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ ContextStrip type selector (R15, R19,     │ cd app && npm test -- ui/canvasWorkspace.test.tsx      │
   │ R39–R41)                                  │                                                        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ R7, R9–R15)                               │                                                        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Storage, cascade, manifest join (R4, R20) │ cd app && npm test -- annotationStorage.test.ts        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ File package round-trip (R5)              │ cd app && npm test -- annotationStorage.test.ts (S13   │
   │                                           │ case)                                                  │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Annotation panel UI (R16, R71–R77)        │ cd app && npm test -- ui/inspector.annotation.test.tsx │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ AnnotationOverlay Three.js builders (R17) │ cd app && npm test -- annotationOverlay.test.ts        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ ContextStrip type selector (R15, R19,     │ cd app && npm test -- ui/canvasWorkspace.test.tsx      │
   │ R39–R41)                                  │                                                        │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Phase 1 full E2E (S1–S13)                 │ cd app && npx playwright test                          │
   │                                           │ e2e/annotation-phase1.spec.ts                          │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Phase 2 full E2E (S14–S21)                │ cd app && npx playwright test                          │
   │                                           │ e2e/annotation-phase2.spec.ts                          │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Full regression                           │ cd app && npm test && npm run build && npx playwright  │
   │                                           │ test                                                   │
   ├───────────────────────────────────────────┼────────────────────────────────────────────────────────┤
   │ Feature doc integrity                     │ python3                                                │
   │                                           │ .agents/skills/intent-spec-plan/scripts/check_features │
   │                                           │ .py .                                                  │
   └───────────────────────────────────────────┴────────────────────────────────────────────────────────┘

   ──────────────────────────────────────────────────────────────────────────────────────────────────────────
   ─

   Deviations

   - **AnnotationOverlay shape:** Implemented as `AnnotationOverlay.ts` exporting pure builders +
     `syncAnnotationObjects` (imperative scene sync from `Viewport` `useEffect`), not a React child
     component. Matches the plan’s Step 7 preferred seam.
   - **Mid-placement type switch:** Silent discard on other-type click; double-click active type exits
     Place (R40/R41). Dirty-dot on Place strip replaces workbench status-bar draft copy.
   - **E2E depth:** Playwright covers Place-mode type selector smoke (Phase 1+2), source-anatomy gate,
     and API landmark create. Full interactive drag/measurement loops (S2–S8, S10–S12, S14–S18, S21)
     are proven by unit/storage/component suites (`annotationMeasure`, `annotationOps`,
     `annotationStorage`, `annotationOverlay`, `inspector.annotation`, `canvasWorkspace`) rather than
     exhaustive browser choreography.
   - **Unplanned helper:** `app/src/ui/annotationActions.ts` and `app/src/ui/AnnotationList.tsx`
     extract panel types/UI from `Inspector.tsx` for testability (still listed under Inspector in
     Where it lives).
   - **Draft-commit gestures (2026-11-15):** Spec amended R78–R81 / R41 — placement is ephemeral until
     ContextStrip **Commit**; shared `canvasGestures` classifier; Place keeps orbit and does not
     unmount the slice dock. Proof: `npm test -- canvasGestures annotationPlacement canvasWorkspace
     inspector.annotation` + `npm run build`.
   - **Place chrome (2026-11-15):** Removed black `canvas-workbench-status` footer; draft feedback is
     `tab-dirty-indicator` on Place label.
   - **Uncommitted stack (2026-11-15):** Replaced ContextStrip Commit/Cancel with stack + Mod+S flush
     and Mod+Z undo (R78). Distance line places via double-click; third point resets (R25). Document
     tab close shows dirty circle until hover.
   - **Behavior classes (2026-11-15):** Added `annotationBehaviors/` (Selectable / PointSet /
     OrientedExtent) + shared `annotationActionMenu` for panel `⋯` and viewport RMB. Angle place is
     A→vertex→B with segmented preview + ContextStrip hint. Plane/ROI use torus/box gizmos writing
     through stack or local+API update; full gizmo E2E skipped this slice (unit math + overlay
     emphasis cover proof). Landmark remains Place-hidden.

   ---

   The key TDD ordering discipline:

   - **Step 1 first** because all measurement assertions depend on `annotationMeasure.ts` and it has zero
   dependencies — confirming it red-green before anything else means every later test that checks a numeric
   output has an independent ground truth.
   - **Steps 2–4** establish the full data path (types → ops → storage) purely in `node` environment tests
   before any React or Three.js is involved. Each layer's tests can be run in isolation and produce
   deterministic results.
   - **Steps 5–8** wire the UI on top of the proven data layer. Component tests stay jsdom-scoped with `/**
   @vitest-environment jsdom */`.
   - **Step 9** is the first E2E — by then every individual layer is green, so an E2E failure means a wiring
   problem, not a logic problem.
   - **Steps 10–13** extend Phase 2 by repeating the same pattern one type at a time, never breaking Phase 1.

   The riskiest seam (Step 7, `AnnotationOverlay` + `Viewport`) is approached by extracting pure builder
   functions that are testable in node without a DOM or WebGL context, then wiring them into `Viewport` via a
   `useEffect` keyed on `annotations` — the same pattern the existing `mesh` effect already uses.

