import type { ProjectSummary } from '../domain/types'

/** In-memory recent/local project index for listProjects (R26). */
export class ProjectRegistry {
  private items = new Map<string, ProjectSummary>()

  list(): ProjectSummary[] {
    return [...this.items.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
  }

  remember(summary: ProjectSummary): void {
    this.items.set(summary.id, summary)
  }

  updateCaseCount(projectId: string, caseCount: number): void {
    const cur = this.items.get(projectId)
    if (!cur) return
    this.items.set(projectId, {
      ...cur,
      caseCount,
      updatedAt: new Date().toISOString(),
    })
  }
}
