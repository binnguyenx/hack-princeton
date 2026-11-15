import { useState } from 'react'
import { Box, IconButton, Text, TextField } from '@radix-ui/themes'
import {
  Folder,
  Layers,
  Box as CubeIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
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
  /** Accepted for App compatibility; the sidebar no longer shows a save-status footer. */
  isDirty?: boolean
}

export function Sidebar({
  activeNav,
  onSelectNav,
  currentProject,
  projects,
  onOpenProject,
  onNewProject,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const projectColorMap = ['#2F6BFF', '#1A1D21', '#6B7280', '#3D78FF', '#8B929A']

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      aria-label="Navigation sidebar"
    >
      <div className="sidebar-header">
        <div className="sidebar-org">
          <Box className="sidebar-avatar" title="Cranial Reconstruction Studio">
            CR
          </Box>
          {!collapsed ? (
            <div className="sidebar-org__meta">
              <span className="sidebar-org__name">Cranial Studio</span>
              <span className="sidebar-org__user">Local Dev</span>
            </div>
          ) : null}
        </div>
        <IconButton
          type="button"
          variant="ghost"
          color="gray"
          size="1"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </IconButton>
      </div>

      {!collapsed ? (
        <Box px="3" pt="2">
          <TextField.Root
            size="1"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          >
            <TextField.Slot side="left">
              <Search size={13} />
            </TextField.Slot>
            <TextField.Slot side="right">
              <Text size="1" color="gray">⌘F</Text>
            </TextField.Slot>
          </TextField.Root>
        </Box>
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
            <CubeIcon size={16} />
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

    </aside>
  )
}
