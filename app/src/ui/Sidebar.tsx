import { useState } from 'react'
import {
  Folder,
  Layers,
  Box,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Activity,
  Code2,
} from 'lucide-react'
import type { ProjectSummary } from '../domain/types'

export type NavItem = 'projects' | 'cases' | 'canvas'

export type SidebarProps = {
  activeNav: NavItem
  onSelectNav: (item: NavItem) => void
  currentProject: { id: string; name: string } | null
  projects: ProjectSummary[]
  onOpenProject: (id: string) => void
  onNewProject: () => void
  isDirty?: boolean
}

export function Sidebar({
  activeNav,
  onSelectNav,
  currentProject,
  projects,
  onOpenProject,
  onNewProject,
  isDirty,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const projectColorMap = ['#0052CC', '#00875A', '#FF991F', '#6554C0', '#36B37E']

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      aria-label="Navigation sidebar"
    >
      <div className="sidebar-header">
        <div className="sidebar-org">
          <div className="sidebar-avatar" title="Cranial Reconstruction Studio">
            CR
          </div>
          {!collapsed ? (
            <div className="sidebar-org__meta">
              <span className="sidebar-org__name">Cranial Studio</span>
              <span className="sidebar-org__user">Local Dev</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!collapsed ? (
        <div className="sidebar-search">
          <Search size={14} className="sidebar-search__icon" />
          <input
            type="text"
            className="sidebar-search__input"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <kbd className="sidebar-search__kbd">⌘F</kbd>
        </div>
      ) : null}

      <div className="sidebar-section">
        {!collapsed ? (
          <span className="sidebar-section__title">Workflow</span>
        ) : null}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav__item ${activeNav === 'projects' ? 'is-active' : ''}`}
            onClick={() => onSelectNav('projects')}
            title="Projects"
          >
            <Folder size={16} />
            {!collapsed ? <span>Projects</span> : null}
          </button>
          <button
            type="button"
            className={`sidebar-nav__item ${activeNav === 'cases' ? 'is-active' : ''}`}
            onClick={() => onSelectNav('cases')}
            disabled={!currentProject}
            title={currentProject ? 'Cases & Anatomy' : 'Open a project first'}
          >
            <Layers size={16} />
            {!collapsed ? <span>Cases & Anatomy</span> : null}
          </button>
          <button
            type="button"
            className={`sidebar-nav__item ${activeNav === 'canvas' ? 'is-active' : ''}`}
            onClick={() => onSelectNav('canvas')}
            disabled={!currentProject}
            title={currentProject ? '3D Studio Canvas' : 'Open a project first'}
          >
            <Box size={16} />
            {!collapsed ? <span>3D Studio Canvas</span> : null}
          </button>
        </nav>
      </div>

      <div className="sidebar-section sidebar-section--grow">
        {!collapsed ? (
          <div className="sidebar-section__header">
            <span className="sidebar-section__title">Projects</span>
            <button
              type="button"
              className="sidebar-icon-btn"
              title="New Project"
              onClick={onNewProject}
            >
              <Plus size={14} />
            </button>
          </div>
        ) : null}
        <ul className="sidebar-project-list">
          {filteredProjects.map((p, idx) => {
            const isCurrent = currentProject?.id === p.id
            const dotColor = projectColorMap[idx % projectColorMap.length]
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`sidebar-project-item ${isCurrent ? 'is-active' : ''}`}
                  onClick={() => onOpenProject(p.id)}
                  title={p.name}
                >
                  <span
                    className="sidebar-project-dot"
                    style={{ backgroundColor: dotColor }}
                  />
                  {!collapsed ? (
                    <span className="sidebar-project-name">{p.name}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="sidebar-footer">
        {!collapsed ? (
          <div className="sidebar-system-info">
            <div className="sidebar-system-row">
              <Activity size={12} />
              <span>{isDirty ? 'Unsaved changes' : 'Session synced'}</span>
            </div>
            <div className="sidebar-system-row sidebar-system-row--muted">
              <Code2 size={12} />
              <span>Debug bridge active</span>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
