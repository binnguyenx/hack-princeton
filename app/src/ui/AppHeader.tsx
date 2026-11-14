import { ChevronRight, Save, Plus, FileUp, FolderOpen } from 'lucide-react'

export type AppHeaderProps = {
  projectName?: string
  caseName?: string
  isDirty?: boolean
  onSave?: () => void
  onNewCase?: () => void
  onImportSample?: () => void
  onNewProject?: () => void
  onOpenPackage?: () => void
  onNavigateHome?: () => void
}

export function AppHeader({
  projectName,
  caseName,
  isDirty,
  onSave,
  onNewCase,
  onImportSample,
  onNewProject,
  onOpenPackage,
  onNavigateHome,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button
          type="button"
          className="breadcrumb-item breadcrumb-link"
          onClick={onNavigateHome}
        >
          Projects
        </button>
        {projectName ? (
          <>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <span className="breadcrumb-item breadcrumb-current">{projectName}</span>
          </>
        ) : null}
        {caseName ? (
          <>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <span className="breadcrumb-item breadcrumb-sub">{caseName}</span>
          </>
        ) : null}
      </nav>

      <div className="app-header__actions">
        {isDirty ? (
          <span className="badge badge--pill badge--warning" title="Unsaved session state">
            Unsaved Changes
          </span>
        ) : null}

        {onSave && projectName ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onSave}
            title="Save Project (⌘S)"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        ) : null}

        {onImportSample && projectName ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onImportSample}
            title="Import Prepared Sample (NRRD)"
          >
            <FileUp size={14} />
            <span>Import Sample</span>
          </button>
        ) : null}

        {onNewCase && projectName ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onNewCase}
            title="Create Patient Case"
          >
            <Plus size={14} />
            <span>New Case</span>
          </button>
        ) : null}

        {!projectName && onNewProject ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onNewProject}
          >
            <Plus size={14} />
            <span>New Project</span>
          </button>
        ) : null}

        {onOpenPackage ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onOpenPackage}
            title="Open Portable Project Package"
          >
            <FolderOpen size={14} />
            <span>Open Package…</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}
