import { createContext } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { ProjectHostSetup } from '../../../shared/project-types'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import type { PlatformProject } from './platform-studio-surface'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import type { SettingsProject } from '@/components/settings/settings-project-list'
import {
  isSettingsSectionInScope,
  type SettingsNavigationTarget,
  type SettingsNavSection,
  type SettingsPresentationScope
} from '@/lib/settings-navigation-types'

export type SettingsTargetReady = {
  contextKey: string
  repoId: string | null
  hostId?: SettingsNavigationTarget['hostId']
  setupId?: string
  sectionId: string
}

export type PlatformSettingsPresentation = {
  scope: SettingsPresentationScope
  initialTarget?: SettingsNavigationTarget
  visible?: boolean
  onReady?: (ready: SettingsTargetReady | null) => void
  onClose?: () => void
  /** Session-only UI drafts, owned and retired by the trusted platform context. */
  drafts?: Map<string, unknown>
}

// Dependency injection only: this module never reads a store or owns configuration values.
export const PlatformSettingsContext = createContext<PlatformSettingsPresentation | undefined>(undefined)

export type SettingsDraftParticipant = {
  key: string
  ask: () => Promise<boolean>
  discard?: () => void
}

export const SettingsDraftContext = createContext<{
  keyPrefix: string
  drafts: Map<string, unknown>
  register: (participant: SettingsDraftParticipant) => () => void
  confirmDiscard: () => Promise<boolean>
} | undefined>(undefined)

export type PlatformBeforeNavigateDetail = {
  from: string
  to: string
  waitUntil: (result: Promise<boolean>) => void
}
export type PlatformNavigationAcceptedDetail = Pick<PlatformBeforeNavigateDetail, 'from' | 'to'>

export function resolvePlatformProjectSettingsScope(
  contextKey: string,
  data: PlatformProjectBootstrap,
  project: PlatformProject | undefined,
  repos: readonly Repo[],
  setups: readonly ProjectHostSetup[]
): Extract<SettingsPresentationScope, { kind: 'project' }> | null {
  const hostId = `runtime:${data.runtime.environmentId}` as const
  if (!project?.directory || project.id !== data.project.id || project.name !== data.project.name) return null
  const scope = { kind: 'project' as const, contextKey, platformId: project.id,
    repoId: data.target.repoId, hostId, setupId: '', name: project.name, path: project.directory }
  if (settingsScopeRepos(repos, scope).length !== 1) return null
  const matches = setups.filter(setup => setup.repoId === scope.repoId && setup.hostId === hostId &&
    setup.setupState === 'ready' && normalizeRuntimePathForComparison(setup.path) ===
    normalizeRuntimePathForComparison(scope.path))
  return matches.length === 1 ? { ...scope, setupId: matches[0].id } : null
}

export function settingsDraftKey(scope: SettingsPresentationScope): string {
  return scope.kind === 'project'
    ? JSON.stringify([scope.contextKey, scope.platformId, scope.hostId, scope.repoId, scope.setupId])
    : JSON.stringify([scope.contextKey, 'global', scope.environmentId ?? null])
}

export function settingsScopeRepos(
  repos: readonly Repo[],
  scope: SettingsPresentationScope | undefined
): readonly Repo[] {
  if (!scope) return repos
  if (scope.kind === 'global') return []
  return repos.filter((repo) => repo.id === scope.repoId &&
    getRepoExecutionHostId(repo) === scope.hostId && repo.displayName === scope.name &&
    normalizeRuntimePathForComparison(repo.path) === normalizeRuntimePathForComparison(scope.path))
}

/** Resolve exact catalog identity before a platform settings surface can be revealed. */
export function resolvePlatformSettingsTarget(
  scope: SettingsPresentationScope,
  catalog: {
    repos: readonly Repo[]
    projects: readonly SettingsProject[]
    sections: readonly SettingsNavSection[]
  },
  requested?: SettingsNavigationTarget
): { target: SettingsNavigationTarget; ready: SettingsTargetReady } | null {
  const intentPane = requested?.intent === 'add-quick-command' ? 'quick-commands'
    : requested?.intent === 'add-ssh-host' ? 'ssh'
      : requested?.intent === 'add-remote-orca-server' ? 'servers' : null
  if (intentPane && requested?.pane !== intentPane) return null
  if (scope.kind === 'global') {
    if (scope.entry === 'development' && !scope.environmentId) return null
    if (scope.environmentId && requested?.hostScope && (requested.hostScope.kind !== 'environment' ||
      requested.hostScope.environmentId !== scope.environmentId)) return null
    const pane = requested?.pane ?? (scope.entry === 'appearance' ? 'appearance' : 'agents')
    if (pane === 'repo' || (requested && requested.repoId !== null) ||
      requested?.sectionId?.startsWith('repo-') || !isSettingsSectionInScope(pane, scope) ||
      !catalog.sections.some((section) => section.id === pane)) return null
    const section = catalog.sections.find((entry) => entry.id === pane)!
    if (requested?.sectionId && requested.sectionId !== pane &&
      !section.searchEntries?.some((entry) => entry.targetSectionId === requested.sectionId)) return null
    return {
      target: { ...requested, pane, repoId: null, hostId: undefined, hostScope: undefined, ...(scope.environmentId
        ? { hostScope: { kind: 'environment', environmentId: scope.environmentId } as const }
        : {}) },
      ready: { contextKey: scope.contextKey, repoId: null, sectionId: pane }
    }
  }
  if (requested && (requested.pane !== 'repo' || requested.repoId !== scope.repoId ||
    requested.hostScope !== undefined ||
    (requested.hostId !== undefined && requested.hostId !== scope.hostId))) return null
  if (settingsScopeRepos(catalog.repos, scope).length !== 1) return null
  const project = catalog.projects.find((entry) => entry.setups.some((setup) =>
    setup.id === scope.setupId && setup.repoId === scope.repoId && setup.hostId === scope.hostId &&
    setup.setupState === 'ready' &&
    normalizeRuntimePathForComparison(setup.path) === normalizeRuntimePathForComparison(scope.path)))
  if (!project) return null
  const sectionId = `repo-${project.representativeRepoId}`
  if (!catalog.sections.some((section) => section.id === sectionId)) return null
  const section = catalog.sections.find((entry) => entry.id === sectionId)!
  if (requested?.sectionId && requested.sectionId !== sectionId &&
    !section.searchEntries?.some((entry) => entry.targetSectionId === requested.sectionId)) return null
  return {
    target: { ...requested, pane: 'repo', repoId: scope.repoId, hostId: scope.hostId },
    ready: { contextKey: scope.contextKey, repoId: scope.repoId, hostId: scope.hostId,
      setupId: scope.setupId, sectionId }
  }
}
