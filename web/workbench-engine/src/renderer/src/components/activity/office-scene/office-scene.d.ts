export type OfficeAgent = {
  id: string
  label: string
  provider: string
  status: 'working' | 'waiting' | 'done' | 'idle' | 'unknown' | 'error'
  taskId?: string
  taskTitle?: string
  evidence?: string
  stateLabel?: string
}

export type OfficeTask = { id: string; title: string; state?: string }
export type OfficeFlow = { id: string; taskId: string; label: string; from: string; to: string }
export type OfficeSceneInput = {
  agents: OfficeAgent[]
  tasks: OfficeTask[]
  flows: OfficeFlow[]
  stale?: boolean
  notice?: string
  selectedId?: string | null
  nodeLabels?: Partial<Record<'tasks' | 'review' | 'done', { title: string; line: string }>>
}

export type OfficeScene = {
  update: (input: OfficeSceneInput) => void
  setActive: (active: boolean) => void
  destroy: () => void
}

export const WorkspaceMonitorScene: {
  create: (options: {
    canvas: HTMLCanvasElement
    onSelect?: (selection: { kind: 'agent' | 'task'; id: string }) => void
  }) => OfficeScene
}
