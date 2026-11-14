import { useState } from 'react'
import { Folder, FolderPlus, FolderOpen, ExternalLink, Search } from 'lucide-react'
import type { ProjectSummary } from '../domain/types'
import { NewProjectDialog } from './dialogs/NewProjectDialog'

export type ProjectsHomeProps = {
  projects: ProjectSummary[]
  onCreateProject: (name: string) => void
  onOpenProject: (projectId: string) => void
  onDeleteProject?: (projectId: string) => void
  onOpenPackage?: () => void
}

export function ProjectsHome({
  projects,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onOpenPackage,
}: ProjectsHomeProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <section className="projects-home" aria-label="Projects home">
      <header className="projects-home__header">
        <div className="projects-home__title-cluster">
          <Folder className="projects-home__icon" size={24} />
          <div>
            <h1 className="projects-home__title">Reconstruction Projects</h1>
            <p className="projects-home__subtitle">
              Manage cranial reconstruction studies, patient cases, and anatomical repair models.
            </p>
          </div>
        </div>
        <div className="projects-home__actions">
          {onOpenPackage ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onOpenPackage}
            >
              <FolderOpen size={15} />
              <span>Open Package…</span>
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDialogOpen(true)}
          >
            <FolderPlus size={15} />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {projects.length > 0 ? (
        <div className="projects-home__toolbar">
          <div className="table-search">
            <Search size={14} className="table-search__icon" />
            <input
              type="text"
              className="table-search__input"
              placeholder="Filter projects by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <div className="empty-management-state">
          <FolderOpen size={48} className="empty-icon" />
          <h3>No projects yet</h3>
          <p>
            Create a local reconstruction project to start importing patient anatomies and generating cranial implants.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDialogOpen(true)}
          >
            <FolderPlus size={15} />
            <span>Create a project</span>
          </button>
        </div>
      ) : (
        <div className="case-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '35%' }}>Project Name</th>
                <th scope="col" style={{ width: '20%' }}>Operator</th>
                <th scope="col" style={{ width: '15%' }}>Cases</th>
                <th scope="col" style={{ width: '20%' }}>Last Updated</th>
                <th scope="col" style={{ width: '20%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="enterprise-table__row">
                  <td className="asset-name-cell">
                    <button
                      type="button"
                      className="project-name-link"
                      onClick={() => onOpenProject(p.id)}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td>
                    <div className="avatar-stack">
                      <span className="avatar-circle" title="Local Dev">LD</span>
                      <span className="avatar-label">Local Dev</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge--pill badge--neutral">
                      {p.caseCount} {p.caseCount === 1 ? 'case' : 'cases'}
                    </span>
                  </td>
                  <td>
                    <span className="timestamp-text">
                      {new Date(p.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-action-cluster" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--xs"
                        onClick={() => onOpenProject(p.id)}
                      >
                        <ExternalLink size={12} />
                        <span>Open</span>
                      </button>
                      {onDeleteProject ? (
                        <button
                          type="button"
                          className="btn btn--secondary btn--xs"
                          onClick={() => onDeleteProject(p.id)}
                        >
                          <span>Delete Project</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={onCreateProject}
      />
    </section>
  )
}
