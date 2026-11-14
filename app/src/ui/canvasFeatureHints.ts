/** Shared hover-copy for Cross-reference Workbench controls (demo + tester UX). */

export const CANVAS_HINTS = {
  modeView: {
    label: 'View mode',
    description:
      'Navigate and inspect. Left-drag rotates the 3D camera; middle-drag pans; right-drag zooms. Slice clicks move the shared crosshair. Does not edit anatomy.',
    shortcut: 'LMB · MMB · RMB',
  },
  modeWindowLevel: {
    label: 'Window / Level',
    description:
      'Adjust how voxel brightness is mapped to the slice images (display only). Drag horizontally for brightness (level), vertically for contrast (window). Does not change the stored volume data.',
    shortcut: 'Drag on slice',
  },
  modePlace: {
    label: 'Place',
    description:
      'Click a slice to pick a point in the volume grid (IJK). Updates the shared crosshair, announces the index, then returns to View. Does not modify mesh or voxels.',
    shortcut: 'Click slice',
  },
  centerView: {
    label: 'Center 3D view',
    description:
      'Move the camera so the model fills the frame, keeping the current viewing direction. Camera only — mesh stays put.',
  },
  resetView: {
    label: 'Reset 3D view',
    description:
      'Return to the default framing and upright orientation for the loaded model. Camera only — anatomy bytes unchanged.',
  },
  viewAnterior: {
    label: 'Anterior view',
    description:
      'Look at the model from the front of the patient (camera along +Y / anterior). Standard clinical “face-on” direction.',
    shortcut: 'A',
  },
  viewPosterior: {
    label: 'Posterior view',
    description:
      'Look at the model from the back of the head (camera along −Y / posterior).',
    shortcut: 'P',
  },
  viewLeft: {
    label: 'Left view',
    description: 'Look from the patient’s left side (camera along −X).',
    shortcut: 'L',
  },
  viewRight: {
    label: 'Right view',
    description: 'Look from the patient’s right side (camera along +X).',
    shortcut: 'R',
  },
  viewSuperior: {
    label: 'Superior view',
    description: 'Look down from above the head (camera along +Z / superior).',
    shortcut: 'S',
  },
  viewInferior: {
    label: 'Inferior view',
    description: 'Look up from below (camera along −Z / inferior).',
    shortcut: 'I',
  },
  projection: {
    label: 'Projection',
    description:
      'Toggle perspective (depth foreshortening) vs orthographic (parallel rays, better for comparing sizes). Same camera pose, different projection math.',
  },
  crosshairOverlay: {
    label: '3D crosshair overlay',
    description:
      'Show or hide fixed center lines on the 3D panel. Separate from the RAS crosshair that links the slice dock.',
  },
  lighting: {
    label: 'Scene lighting',
    description:
      'Brighten or dim the virtual lights on the 3D model (ambient + fill + key). Display only — does not change anatomy data. Drag right for brighter.',
    shortcut: '0.4–1.8×',
  },
  tiltLock: {
    label: 'Tilt lock',
    description:
      'Keep the camera’s “up” direction aligned with patient superior (Z). Reduces accidental barrel-roll while orbiting.',
  },
  spin: {
    label: 'Spin',
    description:
      'Automatically yaw the camera around the model for a continuous turntable preview. Pauses when the OS asks for reduced motion.',
  },
  rock: {
    label: 'Rock',
    description:
      'Gently oscillate the camera left/right for a short review motion. Pauses when the OS asks for reduced motion.',
  },
  rebuild: {
    label: 'Rebuild view',
    description:
      'Tear down and recreate the WebGL renderer after a graphics context loss. Use when you see “Rendering interrupted”.',
  },
  applyDraft: {
    label: 'Apply transform',
    description:
      'Commit the current candidate transform draft into a new revision. This is a domain write — unlike camera tools.',
  },
  cancelDraft: {
    label: 'Cancel transform',
    description: 'Discard the in-progress candidate transform draft without writing a revision.',
  },
  linkedViews: {
    label: 'Linked views',
    description:
      'Status only — not a button. The three planes share one RAS crosshair, so moving a slice or clicking anatomy updates all three together. Independent (unlinked) planes are not available yet.',
  },
  collapseDock: {
    label: 'Collapse slice dock',
    description:
      'Hide the Axial / Sagittal / Coronal panels to give the 3D view more space. Link state is unchanged.',
  },
  expandDock: {
    label: 'Expand slice dock',
    description: 'Show the three linked cross-section panels again under the 3D view.',
  },
  maximizeView: {
    label: 'Maximize view',
    description:
      'Expand this panel to fill the work area. Double-click the panel header also toggles maximize/restore.',
  },
  restoreView: {
    label: 'Restore view',
    description: 'Return from maximized layout to the normal 3D + linked slice dock arrangement.',
  },
  sliceOffset: {
    label: 'Slice offset',
    description:
      'Move which layer of the volume this plane shows. Updates the shared crosshair so the other two planes stay locked to the same 3D point.',
  },
  axialSlice: {
    label: 'Axial slice',
    description:
      'Horizontal cut through the volume (looking along superior). Click to move the shared crosshair; slider steps through stack index k.',
  },
  sagittalSlice: {
    label: 'Sagittal slice',
    description:
      'Side cut through the volume (separating left/right). Click to move the shared crosshair; slider steps through index i.',
  },
  coronalSlice: {
    label: 'Coronal slice',
    description:
      'Front-facing cut through the volume (separating front/back). Click to move the shared crosshair; slider steps through index j.',
  },
} as const

export type CanvasHintKey = keyof typeof CANVAS_HINTS
