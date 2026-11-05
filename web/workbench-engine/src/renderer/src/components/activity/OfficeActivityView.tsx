import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AgentPaneThread } from './activity-thread-types'
import { projectOfficeAgents, projectOfficeChildWork } from './office-activity-model'
import { WorkspaceMonitorScene } from './office-scene/office-scene.js'

export function OfficeActivityView({ threads, showChildAgents, active, onSelect }: {
  threads: readonly AgentPaneThread[]
  showChildAgents: boolean
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

  useEffect(() => {
    if (!canvas.current) return
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
      scene.current = null
      instance.destroy()
    }
  }, [])
  useEffect(() => {
    if (!container.current) return
    const observer = new IntersectionObserver((entries) => setIntersecting(Boolean(entries[0]?.isIntersecting)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { scene.current?.setActive(active && intersecting) }, [active, intersecting, currentPage])
  useEffect(() => {
    const observing = active && intersecting && !document.hidden && showChildAgents
    const work = projectOfficeChildWork(observing ? previousThreads.current : [], threads, shown)
    previousThreads.current = observing ? threads : []
    taskPanes.current = work.taskPanes
    scene.current?.update({ agents: shown, tasks: work.tasks, flows: work.flows, stale: false,
      notice: `本组 ${shown.length} / ${agents.length} 个实例` })
  }, [active, intersecting, showChildAgents, shown, threads, agents.length])

  const changePage = (next: number): void => {
    scene.current?.setActive(false)
    previousThreads.current = []
    setPage(next)
  }
  return (
    <section ref={container} aria-label="Agent 办公室" className="min-h-0 min-w-0 flex-1 overflow-auto p-3">
      <p className="mb-2 text-xs text-muted-foreground">按当前项目与列表筛选范围显示。开启「显示子 Agent」后，任务块会显示观察到的子 Agent 工作。</p>
      <div className="overflow-hidden rounded-md border bg-background"><canvas ref={canvas} aria-label="Agent 办公室" /></div>
      {pages > 1 && <div className="mt-2 flex items-center justify-center gap-2">
        <Button variant="outline" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>上一组</Button>
        <span>{currentPage + 1} / {pages}</span>
        <Button variant="outline" disabled={currentPage + 1 >= pages} onClick={() => changePage(currentPage + 1)}>下一组</Button>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2" aria-label="工位列表">
        {shown.map((agent) => <Button key={agent.id} variant="outline" onClick={() => onSelect(agent.paneKey)}>
          {agent.label} · {agent.stateLabel}
        </Button>)}
        {!agents.length && <p className="text-sm text-muted-foreground">当前范围没有可显示的 Agent。</p>}
      </div>
    </section>
  )
}
