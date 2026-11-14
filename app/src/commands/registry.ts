export type CommandTier = 'P0' | 'P1' | 'P2'

export type CommandId =
  | 'file.saveProject'
  | 'edit.undo'
  | 'edit.redo'
  | 'select.clear'
  | 'view.focus'
  | 'view.toggleVisibility'
  | 'view.standardAnterior'
  | 'view.standardPosterior'
  | 'view.standardLeft'
  | 'view.standardRight'
  | 'view.standardSuperior'
  | 'view.standardInferior'
  | 'window.commandSearch'
  | 'tool.navigate'
  | 'tool.select'
  | 'tool.transform'
  | 'object.applyDraft'
  | 'object.cancelDraft'
  | 'object.restoreRevision'

export type CommandDef = {
  id: CommandId
  label: string
  menuPath: string
  shortcut?: string
  aliases?: string[]
  tier: CommandTier
  disabledReason?: string
}

export type CommandContext = {
  hasProject: boolean
  hasActiveDocument: boolean
  isCandidateActive: boolean
  isDraftActive: boolean
  canRestore: boolean
  hasSelection: boolean
}

const CATALOG: Omit<CommandDef, 'disabledReason'>[] = [
  { id: 'file.saveProject', label: 'Save Project', menuPath: 'File/Save Project', shortcut: 'Mod+S', aliases: ['save'], tier: 'P0' },
  { id: 'edit.undo', label: 'Undo', menuPath: 'Edit/Undo', shortcut: 'Mod+Z', aliases: ['undo'], tier: 'P0' },
  { id: 'edit.redo', label: 'Redo', menuPath: 'Edit/Redo', shortcut: 'Mod+Shift+Z', aliases: ['redo'], tier: 'P0' },
  { id: 'select.clear', label: 'Select None', menuPath: 'Select/Select None', shortcut: 'Esc', aliases: ['clear selection'], tier: 'P0' },
  { id: 'view.focus', label: 'Focus Selection', menuPath: 'View/Focus Selection', shortcut: 'F', aliases: ['focus'], tier: 'P0' },
  { id: 'view.toggleVisibility', label: 'Toggle Visibility', menuPath: 'View/Visibility/Toggle', shortcut: 'H', aliases: ['hide', 'show'], tier: 'P0' },
  { id: 'view.standardAnterior', label: 'Anterior View', menuPath: 'View/Standard Views/Anterior', shortcut: '1', aliases: ['front'], tier: 'P0' },
  { id: 'view.standardPosterior', label: 'Posterior View', menuPath: 'View/Standard Views/Posterior', shortcut: 'Ctrl+1', aliases: ['back'], tier: 'P0' },
  { id: 'view.standardLeft', label: 'Left View', menuPath: 'View/Standard Views/Left', shortcut: '3', aliases: ['left side'], tier: 'P0' },
  { id: 'view.standardRight', label: 'Right View', menuPath: 'View/Standard Views/Right', shortcut: 'Ctrl+3', aliases: ['right side'], tier: 'P0' },
  { id: 'view.standardSuperior', label: 'Superior View', menuPath: 'View/Standard Views/Superior', shortcut: '7', aliases: ['top'], tier: 'P0' },
  { id: 'view.standardInferior', label: 'Inferior View', menuPath: 'View/Standard Views/Inferior', shortcut: 'Ctrl+7', aliases: ['bottom'], tier: 'P0' },
  { id: 'window.commandSearch', label: 'Command Search', menuPath: 'Window/Command Search', shortcut: 'Mod+K', aliases: ['palette'], tier: 'P0' },
  { id: 'tool.navigate', label: 'Navigate Tool', menuPath: 'Object/Tools/Navigate', shortcut: 'N', aliases: ['orbit tool'], tier: 'P0' },
  { id: 'tool.select', label: 'Select Tool', menuPath: 'Object/Tools/Select', shortcut: 'V', aliases: ['pointer'], tier: 'P0' },
  { id: 'tool.transform', label: 'Transform Tool', menuPath: 'Object/Tools/Transform', shortcut: 'T', aliases: ['move', 'rotate'], tier: 'P0' },
  { id: 'object.applyDraft', label: 'Apply Draft', menuPath: 'Object/Apply Draft', shortcut: 'Enter', aliases: ['apply'], tier: 'P0' },
  { id: 'object.cancelDraft', label: 'Cancel Draft', menuPath: 'Object/Cancel Draft', shortcut: 'Esc', aliases: ['cancel'], tier: 'P0' },
  { id: 'object.restoreRevision', label: 'Restore Revision', menuPath: 'Object/Restore Revision', shortcut: 'Mod+Backspace', aliases: ['restore'], tier: 'P0' },
]

export function buildCanvasCommands(ctx: CommandContext): CommandDef[] {
  return CATALOG.map((cmd) => {
    switch (cmd.id) {
      case 'file.saveProject':
        return { ...cmd, disabledReason: ctx.hasProject ? undefined : 'Open a project first' }
      case 'tool.transform':
        return { ...cmd, disabledReason: ctx.isCandidateActive ? undefined : 'Open a candidate tab to transform' }
      case 'object.applyDraft':
      case 'object.cancelDraft':
        return { ...cmd, disabledReason: ctx.isDraftActive ? undefined : 'Start a transform draft first' }
      case 'object.restoreRevision':
        return { ...cmd, disabledReason: ctx.canRestore ? undefined : 'No earlier revision recorded yet' }
      case 'view.focus':
      case 'view.toggleVisibility':
        return { ...cmd, disabledReason: ctx.hasActiveDocument ? undefined : 'Open a sample or candidate first' }
      case 'select.clear':
        return { ...cmd, disabledReason: ctx.hasSelection ? undefined : 'Nothing is currently selected' }
      default:
        return { ...cmd }
    }
  })
}

export function matchesCommand(command: CommandDef, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (command.label.toLowerCase().includes(q)) return true
  if (command.menuPath.toLowerCase().includes(q)) return true
  return (command.aliases ?? []).some((alias) => alias.toLowerCase().includes(q))
}
