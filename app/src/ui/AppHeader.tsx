import { ChevronRight, Save, Plus, FileUp, FolderOpen } from 'lucide-react'
import { Badge, Button, Flex } from '@radix-ui/themes'

export type AppHeaderProps = {
  projectName?: string
  caseName?: string
  isDirty?: boolean
  packageDisabledReason?: string
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
  packageDisabledReason,
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

      <Flex align="center" gap="2">
        {isDirty ? (
          <Badge color="amber" variant="soft" title="Unsaved session state">
            Unsaved Changes
          </Badge>
        ) : null}

        {onSave && projectName ? (
          <Button
            type="button"
            variant="soft"
            color="gray"
            size="1"
            onClick={onSave}
            title={packageDisabledReason ?? "Download project package (Ctrl/Cmd+S)"}
            disabled={Boolean(packageDisabledReason)}
          >
            <Save size={14} />
            Save
          </Button>
        ) : null}

        {onImportSample && projectName ? (
          <Button
            type="button"
            variant="soft"
            color="gray"
            size="1"
            onClick={onImportSample}
            title="Import Prepared Sample (NRRD)"
          >
            <FileUp size={14} />
            Import Sample
          </Button>
        ) : null}

        {onNewCase && projectName ? (
          <Button
            type="button"
            size="1"
            onClick={onNewCase}
            title="Create Patient Case"
          >
            <Plus size={14} />
            New Case
          </Button>
        ) : null}

        {!projectName && onNewProject ? (
          <Button
            type="button"
            size="1"
            onClick={onNewProject}
          >
            <Plus size={14} />
            New Project
          </Button>
        ) : null}

        {onOpenPackage ? (
          <Button
            type="button"
            variant="soft"
            color="gray"
            size="1"
            onClick={onOpenPackage}
            title={packageDisabledReason ?? "Open Portable Project Package"}
            disabled={Boolean(packageDisabledReason)}
          >
            <FolderOpen size={14} />
            Open Package
          </Button>
        ) : null}
      </Flex>
    </header>
  )
}
