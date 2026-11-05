import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { AgentPaneThread } from './activity-thread-types'
import { projectOfficeAgents, projectOfficeChildWork } from './office-activity-model'
import { WorkspaceMonitorScene } from './office-scene/office-scene.js'

export function OfficeActivityView({ threads, showChildAgents, selectedPaneKey, active, onSelect }: {
  threads: readonly AgentPaneThread[]
  showChildAgents: boolean
  selectedPaneKey?: string
  active: boolean
  onSelect: (paneKey: string) => void
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLElement>(null)
  const scene = useRef<ReturnType<typeof WorkspaceMonitorScene.create> | null>(null)
  const latest = useRef({ agents: projectOfficeAgents([], showChildAgents), onSelect })
  const previousThreads = useRef<readonly AgentPaneThread[]>([])
  const taskPanes = useRef(new Map<string, string>())
  const [page, setPage] = useState(0)
  const [intersecting, setIntersecting] = useState(false)
  const agents = useMemo(() => projectOfficeAgents(threads, showChildAgents), [threads, showChildAgents])
  latest.current = { agents, onSelect }
  const pages = Math.max(1, Math.ceil(agents.length / 12))
  const currentPage = Math.min(page, pages - 1)
  const shown = useMemo(() => agents.slice(currentPage * 12, (currentPage + 1) * 12), [agents, currentPage])
  const hasAgents = agents.length > 0
  const selectedId = shown.find((agent) => agent.paneKey === selectedPaneKey)?.id

  useEffect(() => {
    if (!hasAgents || !canvas.current) return
    const instance = WorkspaceMonitorScene.create({ canvas: canvas.current, onSelect: (item) => {
      const paneKey = item.kind === 'task'
        ? taskPanes.current.get(item.id)
        : latest.current.agents.find((value) => value.id === item.id)?.paneKey
      if (paneKey) latest.current.onSelect(paneKey)
    } })
    const resetBaseline = () => { previousThreads.current = [] }
    document.addEventListener('visibilitychange', resetBaseline)
    scene.current = instance
    return () => {
      document.removeEventListener('visibilitychange', resetBaseline)
      resetBaseline()
      scene.current = null
      instance.destroy()
    }
  }, [hasAgents])
  useEffect(() => {
    if (!container.current) return
    const observer = new IntersectionObserver((entries) => setIntersecting(Boolean(entries[0]?.isIntersecting)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { scene.current?.setActive(active && intersecting) }, [active, intersecting, currentPage, hasAgents])
  useEffect(() => {
    const observing = active && intersecting && !document.hidden && showChildAgents
    const work = projectOfficeChildWork(observing ? previousThreads.current : [], threads, shown)
    previousThreads.current = observing ? threads : []
    taskPanes.current = work.taskPanes
    scene.current?.update({ agents: shown, tasks: work.tasks, flows: work.flows, stale: false, selectedId,
      notice: agents.length > shown.length ? `本组 ${shown.length} / ${agents.length} 个实例` : undefined })
  }, [active, intersecting, showChildAgents, shown, threads, agents.length, selectedId])

  const changePage = (next: number): void => {
    scene.current?.setActive(false)
    previousThreads.current = []
    setPage(next)
  }
  if (!hasAgents) {
    return (
      <section ref={container} aria-label="办公室" className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
        <MessageSquareText aria-hidden="true" className="size-7" />
        <p>{translate('auto.components.activity.ActivityPrototypePage.e3db9892f6', 'No activity yet.')}</p>
        <p className="text-xs">当前项目的会话符合列表筛选条件后，会在这里显示工位。</p>
      </section>
    )
  }

  return (
    <section ref={container} aria-label="办公室" className="min-h-0 min-w-0 flex-1 overflow-auto p-3 scrollbar-sleek">
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <canvas
          ref={canvas}
          aria-label="办公室工位"
          className="block [--monitor-bg:var(--background)] [--monitor-panel:var(--muted)] [--monitor-ink:var(--foreground)] [--monitor-soft:var(--muted-foreground)] [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      {pages > 1 && <div className="mt-2 flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>上一组</Button>
        <span>{currentPage + 1} / {pages}</span>
        <Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => changePage(currentPage + 1)}>下一组</Button>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2" aria-label="工位列表">
        {shown.map((agent) => <Button key={agent.id} variant="outline" size="sm" aria-pressed={selectedId === agent.id} onClick={() => onSelect(agent.paneKey)}>
          {agent.label} · {agent.stateLabel}
        </Button>)}
      </div>
    </section>
  )
}
