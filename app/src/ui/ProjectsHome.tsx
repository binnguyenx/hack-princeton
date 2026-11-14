import { useState } from 'react'
import { Folder, FolderPlus, FolderOpen, ExternalLink, Search } from 'lucide-react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Table,
  Text,
  TextField,
} from '@radix-ui/themes'
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
  const hasResults = filtered.length > 0

  return (
    <section className="projects-home" aria-label="Projects home">
      <Flex justify="between" align="start" gap="4" mb="4">
        <Flex align="start" gap="3">
          <Box className="projects-home__icon-box">
            <Folder size={18} />
          </Box>
          <Box>
            <Heading size="5">Projects</Heading>
            <Text color="gray" size="2">
              Manage reconstruction studies, cases, and prepared anatomy assets.
            </Text>
          </Box>
        </Flex>
        <Flex gap="2">
          {onOpenPackage ? (
            <Button type="button" variant="soft" color="gray" onClick={onOpenPackage}>
              <FolderOpen size={14} />
              Open Package
            </Button>
          ) : null}
          <Button type="button" onClick={() => setDialogOpen(true)}>
            <FolderPlus size={15} />
            New Project
          </Button>
        </Flex>
      </Flex>

      {projects.length > 0 ? (
        <Box mb="3" style={{ maxWidth: 320 }}>
          <TextField.Root
            size="2"
            placeholder="Filter projects by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          >
            <TextField.Slot side="left">
              <Search size={14} />
            </TextField.Slot>
          </TextField.Root>
        </Box>
      ) : null}

      {projects.length === 0 ? (
        <Card className="empty-management-state">
          <FolderOpen size={48} className="empty-icon" />
          <Heading size="4">No projects yet</Heading>
          <Text color="gray" size="2">
            Create a local reconstruction project to start importing patient anatomies and generating cranial implants.
          </Text>
          <Button type="button" onClick={() => setDialogOpen(true)}>
            <FolderPlus size={15} />
            Create a project
          </Button>
        </Card>
      ) : (
        <Card>
          <Table.Root variant="surface" size="2">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Project Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Operator</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Cases</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Last Updated</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {!hasResults ? (
                <Table.Row>
                  <Table.Cell colSpan={5}>
                    <Text size="2" color="gray">No projects match your filter.</Text>
                  </Table.Cell>
                </Table.Row>
              ) : null}
              {filtered.map((p) => (
                <Table.Row key={p.id}>
                  <Table.RowHeaderCell>
                    <button
                      type="button"
                      className="project-name-link"
                      onClick={() => onOpenProject(p.id)}
                    >
                      {p.name}
                    </button>
                  </Table.RowHeaderCell>
                  <Table.Cell>Local Dev</Table.Cell>
                  <Table.Cell>
                    <Badge variant="soft" color="gray">
                      {p.caseCount} {p.caseCount === 1 ? 'case' : 'cases'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" color="gray">
                      {new Date(p.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Flex gap="2" justify="end">
                      <Button type="button" size="1" variant="soft" color="gray" onClick={() => onOpenProject(p.id)}>
                        <ExternalLink size={12} />
                        Open
                      </Button>
                      {onDeleteProject ? (
                        <Button
                          type="button"
                          size="1"
                          variant="soft"
                          color="red"
                          onClick={() => onDeleteProject(p.id)}
                        >
                          Delete Project
                        </Button>
                      ) : null}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={onCreateProject}
      />
    </section>
  )
}
