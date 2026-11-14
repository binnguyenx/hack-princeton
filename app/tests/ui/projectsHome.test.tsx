/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProject,
  listProjects,
  readState,
} from '../../src/ops'
import { ProjectRegistry } from '../../src/ops/projectRegistry'
import { ProjectsHome } from '../../src/ui/ProjectsHome'
import { freshCtx } from '../helpers'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('R26 / R25 Projects home UI', () => {
  it('empty state CTA creates a project through createProject', () => {
    const registry = new ProjectRegistry()
    const ctx = { ...freshCtx(), registry }
    vi.stubGlobal('prompt', () => 'From UI')

    const view = () => {
      const listed = listProjects(ctx)
      const projects = listed.ok ? listed.value : []
      return (
        <ProjectsHome
          projects={projects}
          onCreateProject={(name) => {
            createProject(ctx, { name })
            rerender()
          }}
          onOpenProject={() => {}}
        />
      )
    }

    const { rerender } = render(view())
    expect(screen.getByText(/No projects yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Create a project/i }))

    // Dialog opens (R36 / R41)
    const input = screen.getByLabelText(/Project Name/i)
    fireEvent.change(input, { target: { value: 'From UI' } })
    fireEvent.click(screen.getByRole('button', { name: /^Create Project$/i }))

    const st = readState(ctx)
    expect(st.ok && st.value?.project.name).toBe('From UI')
    expect(st.ok && st.value?.cases).toEqual([])
    rerender(view())
    expect(screen.getByRole('button', { name: 'From UI' })).toBeTruthy()
  })

  it('project row delete action fires callback with project id', () => {
    const onDeleteProject = vi.fn()
    render(
      <ProjectsHome
        projects={[
          { id: 'p1', name: 'Project One', caseCount: 0, updatedAt: new Date().toISOString() },
        ]}
        onCreateProject={() => {}}
        onOpenProject={() => {}}
        onDeleteProject={onDeleteProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Delete Project$/i }))
    expect(onDeleteProject).toHaveBeenCalledWith('p1')
  })
})
