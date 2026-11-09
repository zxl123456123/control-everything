import { ArrowLeft, ChevronRight } from 'lucide-react'

export function PlatformWorkspaceHeader({
  projectName,
  settings = false,
  active = true,
  workspaceInert = false
}: {
  projectName?: string
  settings?: boolean
  active?: boolean
  workspaceInert?: boolean
}): React.JSX.Element {
  return (
    <header className={active ? 'platform-workspace-header' : undefined} hidden={!active}>
      <div className="platform-workspace-brand" aria-label="掌控一切">
        <span className="platform-workspace-monogram" aria-hidden="true">
          CE
        </span>
      </div>
      <nav
        className="platform-project-tabs"
        aria-label={projectName ? '项目工作区导航' : '项目工作台导航'}
      >
        <a href="#home" className="platform-project-back" aria-label="项目总览">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>项目总览</span>
        </a>
        <ChevronRight size={14} className="platform-workspace-separator" aria-hidden="true" />
        <span className="platform-workspace-title">
          {projectName || (settings ? '开发设置' : '工作台')}
        </span>
      </nav>
      <div id="platform-workspace-controls" inert={workspaceInert} />
      <div id="platform-workspace-info" />
    </header>
  )
}
