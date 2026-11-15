/** Browser-safe ops only. Node package IO lives in `./persistence` (do not re-export here). */
export * from './session'
export * from './projectRegistry'
export * from './importPrepared'

import {
  addAnnotation,
  clearDirty,
  closeDocument,
  createCandidate,
  createCase,
  createProject,
  deleteAnnotation,
  listProjects,
  navigateCamera,
  openDocument,
  readState,
  renameAnnotation,
  restoreRevision,
  selectObject,
  setActiveDocument,
  setAnnotationLocked,
  setAnnotationVisible,
  setInspectionPlane,
  setVisibility,
  transformCandidate,
  updateAnnotationMeta,
  updateAnnotationPoints,
} from './session'
import { importPreparedSample } from './importPrepared'

export const publicOps = {
  readState,
  listProjects,
  navigateCamera,
  setVisibility,
  setInspectionPlane,
  selectObject,
  createProject,
  createCase,
  importPreparedSample,
  createCandidate,
  openDocument,
  closeDocument,
  setActiveDocument,
  clearDirty,
  transformCandidate,
  restoreRevision,
  addAnnotation,
  renameAnnotation,
  setAnnotationVisible,
  setAnnotationLocked,
  updateAnnotationPoints,
  updateAnnotationMeta,
  deleteAnnotation,
}
