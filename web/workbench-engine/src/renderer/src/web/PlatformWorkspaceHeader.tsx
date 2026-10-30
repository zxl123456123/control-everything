import { ArrowLeft, ChevronRight } from 'lucide-react'

export function PlatformWorkspaceHeader({
  projectName,
  settings = false
}: {
  projectName?: string
  settings?: boolean
}): React.JSX.Element {
  return (
    <header className="platform-workspace-header">
      <div className="platform-workspace-brand" aria-label="掌控一切">
        <span className="platform-workspace-monogram" aria-hidden="true">
          CE
        </span>
        <span>掌控一切</span>
      </div>
      <nav
        className="platform-project-tabs"
        aria-label={projectName ? '项目工作区导航' : '项目工作台导航'}
      >
        <a href="#home" className="platform-project-back">
          <ArrowLeft size={14} aria-hidden="true" />
          项目总览
        </a>
        <ChevronRight size={14} className="platform-workspace-separator" aria-hidden="true" />
        <span className="platform-workspace-title">
          {projectName || (settings ? '开发设置' : '工作台')}
        </span>
      </nav>
    </header>
  )
}
