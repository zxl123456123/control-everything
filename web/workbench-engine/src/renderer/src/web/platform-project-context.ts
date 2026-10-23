import { createContext, useContext, useMemo } from 'react'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { PlatformProject } from './platform-studio-surface'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'

// Undefined is standalone; null is integrated but has no current, verified project.
export const PlatformProjectContext = createContext<PlatformProjectBootstrap | null | undefined>(
  undefined
)

// The platform catalog is a display projection; native runtime records stay intact.
export type PlatformProjectScope = { projects: readonly PlatformProject[]; executionHostId: string }
export const PlatformProjectScopeContext = createContext<PlatformProjectScope | undefined>(
  undefined
)
const normalize = (path: string) => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

export function isPlatformProjectPathVisible(
  path: string,
  hostId: string,
  scope: PlatformProjectScope | undefined
): boolean {
  if (!scope) return true
  if (hostId !== scope.executionHostId) return false
  const candidate = normalize(path)
  return scope.projects.some((project) => {
    if (!project.directory) return false
    const directory = normalize(project.directory)
    return candidate === directory
  })
}

export function filterPlatformProjectRepos(
  repos: readonly Repo[],
  scope: PlatformProjectScope | undefined
): readonly Repo[] {
  return scope
    ? repos.filter((repo) =>
        isPlatformProjectPathVisible(repo.path, getRepoExecutionHostId(repo), scope)
      )
    : repos
}

export function usePlatformProjectRepos(repos: readonly Repo[]): readonly Repo[] {
  const scope = useContext(PlatformProjectScopeContext)
  return useMemo(() => filterPlatformProjectRepos(repos, scope), [repos, scope])
}
