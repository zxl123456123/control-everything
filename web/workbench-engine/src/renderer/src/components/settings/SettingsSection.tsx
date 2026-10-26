import type React from 'react'
import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import type { SettingsSearchEntry } from './settings-search'
import { matchesSettingsSearch } from './settings-search'

// Why: avoids threading `activeSectionId` through every <SettingsSection /> call
// site in Settings.tsx — the page wraps its content tree in this provider.
const ActiveSettingsSectionContext = createContext<string | null>(null)
const SettingsSectionScopeContext = createContext<ReadonlySet<string> | undefined>(undefined)
export const SettingsSectionScopeProvider = SettingsSectionScopeContext.Provider

export const ActiveSettingsSectionProvider = ActiveSettingsSectionContext.Provider

type SettingsSectionProps = {
  id: string
  title: string
  description: string
  searchEntries?: SettingsSearchEntry[]
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  badge?: string
  badgeAccessory?: React.ReactNode
  forceVisible?: boolean
  /** When true, this section is the one currently selected in the sidebar.
   *  Sections render only when active. During search, the sidebar lists every
   *  match while the content pane stays focused on the selected match instead
   *  of mounting every matching settings surface at once. */
  isActive?: boolean
  /** Rendered in the section header's upper-right corner — intended for
   *  section-scoped actions (e.g. "Import from Ghostty") that would otherwise
   *  crowd the settings list as their own row. */
  headerAction?: React.ReactNode
  /** Click handler on the section title — the hook for hidden staff
   *  affordances (Option-click reveals), mirroring the Updates header. */
  onTitleClick?: (event: React.MouseEvent<HTMLHeadingElement>) => void
}

export function SettingsSection({
  id,
  title,
  description,
  searchEntries,
  children,
  className,
  bodyClassName,
  badge,
  badgeAccessory,
  forceVisible = false,
  isActive,
  headerAction,
  onTitleClick
}: SettingsSectionProps): React.JSX.Element | null {
  const query = useAppStore((state) => state.settingsSearchQuery)
  const activeFromContext = useContext(ActiveSettingsSectionContext)
  const allowedSectionIds = useContext(SettingsSectionScopeContext)
  if (allowedSectionIds && !allowedSectionIds.has(id)) return null
  const sectionIsActive = isActive ?? activeFromContext === id
  const hasQuery = query.trim() !== ''
  const matchesQuery = !searchEntries || matchesSettingsSearch(query, searchEntries)
  if (!forceVisible) {
    if (hasQuery) {
      if (!sectionIsActive || !matchesQuery) {
        return null
      }
    } else if (!sectionIsActive) {
      return null
    }
  }

  return (
    <section id={id} data-settings-section={id} className={cn('scroll-mt-8 space-y-6', className)}>
      <div className="ce-settings-section-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h2
            className="flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight text-foreground"
            onClick={onTitleClick}
          >
            {title}
            {badge ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {badge}
              </span>
            ) : null}
            {badgeAccessory}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {/* Appearance owns its row groups; avoid placing another card around them. */}
      <div
        className={cn(
          id === 'appearance' ? 'space-y-4' : 'rounded-2xl bg-card px-6 py-5',
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
