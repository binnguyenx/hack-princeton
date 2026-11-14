export type CommandTier = 'P0' | 'P1' | 'P2'

export type CommandId =
  | 'file.saveProject'
  | 'edit.undo'
  | 'edit.redo'
  | 'select.clear'
  | 'view.focus'
  | 'view.reset'
  | 'view.toggleTiltLock'
  | 'view.toggleProjection'
  | 'view.toggleVisibility'
  | 'view.showAll'
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
  packageDisabledReason?: string
  hasProject: boolean
  hasActiveDocument: boolean
  isCandidateActive: boolean
  isDraftActive: boolean
  isPlaceMode?: boolean
  canRestore: boolean
  canRedo?: boolean
  busy?: boolean
  hasSelection: boolean
}

const CATALOG: Omit<CommandDef, 'disabledReason'>[] = [
  { id: 'file.saveProject', label: 'Save Project', menuPath: 'File/Save Project', shortcut: 'Mod+S', aliases: ['save'], tier: 'P0' },
  { id: 'edit.undo', label: 'Undo', menuPath: 'Edit/Undo', shortcut: 'Mod+Z', aliases: ['undo'], tier: 'P0' },
  { id: 'edit.redo', label: 'Redo', menuPath: 'Edit/Redo', shortcut: 'Mod+Shift+Z', aliases: ['redo'], tier: 'P0' },
  { id: 'select.clear', label: 'Select None', menuPath: 'Select/Select None', shortcut: 'Esc', aliases: ['clear selection'], tier: 'P0' },
  { id: 'view.reset', label: 'Reset View', menuPath: 'View/Reset', shortcut: 'Insert', tier: 'P0' },
  { id: 'view.toggleTiltLock', label: 'Toggle Tilt Lock', menuPath: 'View/Tilt Lock', shortcut: 'Mod+B', tier: 'P0' },
  { id: 'view.toggleProjection', label: 'Toggle Projection', menuPath: 'View/Projection', tier: 'P0' },
  { id: 'view.focus', label: 'Focus Selection', menuPath: 'View/Focus Selection', shortcut: 'F', aliases: ['focus'], tier: 'P0' },
  { id: 'view.toggleVisibility', label: 'Toggle Visibility', menuPath: 'View/Visibility/Toggle', shortcut: 'H', aliases: ['hide', 'show'], tier: 'P0' },
  { id: 'view.showAll', label: 'Show all objects', menuPath: 'View/Visibility/Show all', tier: 'P0' },
  { id: 'view.standardAnterior', label: 'Anterior View', menuPath: 'View/Standard Views/Anterior', shortcut: 'End', aliases: ['front'], tier: 'P0' },
  { id: 'view.standardPosterior', label: 'Posterior View', menuPath: 'View/Standard Views/Posterior', shortcut: 'Shift+End', aliases: ['back'], tier: 'P0' },
  { id: 'view.standardLeft', label: 'Left View', menuPath: 'View/Standard Views/Left', shortcut: 'PageDown', aliases: ['left side'], tier: 'P0' },
  { id: 'view.standardRight', label: 'Right View', menuPath: 'View/Standard Views/Right', shortcut: 'Shift+PageDown', aliases: ['right side'], tier: 'P0' },
  { id: 'view.standardSuperior', label: 'Superior View', menuPath: 'View/Standard Views/Superior', shortcut: 'Home', aliases: ['top'], tier: 'P0' },
  { id: 'view.standardInferior', label: 'Inferior View', menuPath: 'View/Standard Views/Inferior', shortcut: 'Shift+Home', aliases: ['bottom'], tier: 'P0' },
  { id: 'window.commandSearch', label: 'Command Search', menuPath: 'Window/Command Search', shortcut: 'Mod+K', aliases: ['palette'], tier: 'P0' },
  { id: 'tool.navigate', label: 'Navigate Tool', menuPath: 'Object/Tools/Navigate', shortcut: 'N', aliases: ['orbit tool'], tier: 'P0' },
  { id: 'tool.select', label: 'Select Tool', menuPath: 'Object/Tools/Select', shortcut: 'V', aliases: ['pointer'], tier: 'P0' },
  { id: 'tool.transform', label: 'Transform Tool', menuPath: 'Object/Tools/Transform', shortcut: 'T', aliases: ['move', 'rotate'], tier: 'P0' },
  { id: 'object.applyDraft', label: 'Apply Draft', menuPath: 'Object/Apply Draft', shortcut: 'Enter', aliases: ['apply'], tier: 'P0' },
  { id: 'object.cancelDraft', label: 'Cancel Draft', menuPath: 'Object/Cancel Draft', shortcut: 'Esc', aliases: ['cancel'], tier: 'P0' },
  { id: 'object.restoreRevision', label: 'Restore Revision', menuPath: 'Object/Restore Revision', shortcut: 'Mod+Backspace', aliases: ['restore'], tier: 'P0' },
]

export function buildCanvasCommands(ctx: CommandContext): CommandDef[] {
  return CATALOG.map((definition) => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    const cmd = { ...definition, shortcut: definition.shortcut?.replace('Mod+', mac ? '⌘+' : 'Ctrl+') }
    if (ctx.busy && ['edit.undo', 'edit.redo', 'object.restoreRevision', 'tool.transform'].includes(cmd.id)) return { ...cmd, disabledReason: 'Finish the pending operation first' }
    switch (cmd.id) {
      case 'file.saveProject':
        return { ...cmd, disabledReason: !ctx.hasProject ? 'Open a project first' : ctx.packageDisabledReason }
      case 'view.showAll':
        return { ...cmd, disabledReason: ctx.hasProject ? undefined : 'Open a project first' }
      case 'tool.transform':
        return { ...cmd, disabledReason: ctx.isCandidateActive ? undefined : 'Open a candidate tab to transform' }
      case 'object.cancelDraft':
        return { ...cmd, disabledReason: ctx.isDraftActive || ctx.isPlaceMode ? undefined : 'No draft or placement mode to cancel' }
      case 'object.applyDraft':
        return { ...cmd, disabledReason: ctx.isDraftActive ? undefined : 'Start a transform draft first' }
      case 'edit.redo':
        return { ...cmd, disabledReason: !ctx.isDraftActive && ctx.canRedo ? undefined : 'No later committed revision available' }
      case 'edit.undo':
      case 'object.restoreRevision':
        return { ...cmd, disabledReason: ctx.canRestore ? undefined : 'No earlier revision recorded yet' }
      case 'view.reset':
      case 'view.toggleTiltLock':
      case 'view.toggleProjection':
      case 'view.standardAnterior':
      case 'view.standardPosterior':
      case 'view.standardLeft':
      case 'view.standardRight':
      case 'view.standardSuperior':
      case 'view.standardInferior':
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
