/** Browser-safe ops only. Node package IO lives in `./persistence` (do not re-export here). */
export * from './session'
export * from './projectRegistry'
export * from './importPrepared'

import {
  closeDocument,
  createCandidate,
  createCase,
  createProject,
  listProjects,
  navigateCamera,
  openDocument,
  readState,
  restoreRevision,
  selectObject,
  setActiveDocument,
  setInspectionPlane,
  setVisibility,
  transformCandidate,
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
  transformCandidate,
  restoreRevision,
}
