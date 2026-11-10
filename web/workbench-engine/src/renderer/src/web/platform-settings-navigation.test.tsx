import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { SettingsNavSection, SettingsPresentationScope } from '@/lib/settings-navigation-types'
import { isSettingsSectionInScope } from '@/lib/settings-navigation-types'
import { buildSettingsProjectList } from '@/components/settings/settings-project-list'
import { resolvePlatformProjectSettingsScope, resolvePlatformSettingsTarget, settingsDraftKey, settingsScopeRepos } from './platform-settings-navigation'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'

const repo: Repo = { id: 'same', path: '/projects/b', displayName: 'B', addedAt: 1,
  badgeColor: 'blue', executionHostId: 'runtime:server-b' }
const projects = buildSettingsProjectList([repo])
const scope: SettingsPresentationScope = { kind: 'project', contextKey: 'trusted-1', platformId: 'b',
  repoId: repo.id, hostId: 'runtime:server-b', setupId: projects[0].setups[0].id,
  path: repo.path, name: repo.displayName }
const sections = ['appearance', 'agents', 'repo-same'].map((id) => ({ id }) as SettingsNavSection)
const catalog = { repos: [repo], projects, sections }

describe('platform settings exact target', () => {
  it('preserves all 37 original identities and the original 22 + 2 + 12 visibility gates', () => {
    const options = { isMac: true, isWindows: true, isDev: true, isWebClient: true, repos: [] as Repo[] }
    const regular = buildSettingsNavigationMetadata(options)
    const conditional = buildSettingsNavigationMetadata({ ...options, nativeChatEnabled: true, isLinearConnected: true })
    const desktop = buildSettingsNavigationMetadata({ ...options, isWebClient: false, nativeChatEnabled: true, isLinearConnected: true })
    expect(regular).toHaveLength(22)
    expect(conditional.filter(section => !regular.some(row => row.id === section.id)).map(section => section.id).sort())
      .toEqual(['chat', 'linear'])
    expect(desktop.filter(section => !conditional.some(row => row.id === section.id))).toHaveLength(12)
    const all = buildSettingsNavigationMetadata({ ...options, isWebClient: false, nativeChatEnabled: true,
      isLinearConnected: true, repos: [repo] })
    expect(all).toHaveLength(37)
    expect(new Set(all.map(section => section.id)).size).toBe(37)
  })
  it('keeps standalone unchanged and excludes all repos from global scopes', () => {
    expect(settingsScopeRepos([repo], undefined)).toEqual([repo])
    expect(settingsScopeRepos([repo], { kind: 'global', entry: 'development', contextKey: 'c' })).toEqual([])
    expect(isSettingsSectionInScope('repo-same', { kind: 'global', entry: 'development', contextKey: 'c' })).toBe(false)
  })
  it('never selects a project or a host for an unconnected global entry', () => {
    expect(resolvePlatformSettingsTarget({ kind: 'global', entry: 'development', contextKey: 'c' }, catalog)).toBeNull()
    expect(resolvePlatformSettingsTarget({ kind: 'global', entry: 'appearance', contextKey: 'c' }, catalog)?.target)
      .toEqual({ pane: 'appearance', repoId: null })
  })
  it('locks global targets to the allowed pane and explicit environment', () => {
    const global = { kind: 'global', entry: 'development', contextKey: 'c', environmentId: 'server-b' } as const
    expect(resolvePlatformSettingsTarget(global, catalog)?.target.hostScope)
      .toEqual({ kind: 'environment', environmentId: 'server-b' })
    expect(resolvePlatformSettingsTarget(global, catalog, { pane: 'repo', repoId: 'same' })).toBeNull()
    expect(resolvePlatformSettingsTarget(global, catalog, { pane: 'agents', repoId: null, sectionId: 'repo-same' })).toBeNull()
    expect(resolvePlatformSettingsTarget(global, catalog, { pane: 'appearance', repoId: null })).toBeNull()
  })
  it('requires the exact repo, execution host, setup, path and section', () => {
    expect(resolvePlatformSettingsTarget(scope, catalog)?.ready).toEqual({ contextKey: 'trusted-1',
      repoId: 'same', hostId: 'runtime:server-b', setupId: scope.setupId, sectionId: 'repo-same' })
    for (const patch of [{ hostId: 'local' }, { setupId: 'missing' }, { path: '/projects/a' }]) {
      expect(resolvePlatformSettingsTarget({ ...scope, ...patch } as SettingsPresentationScope, catalog)).toBeNull()
    }
    expect(resolvePlatformSettingsTarget(scope, { ...catalog, sections: [] })).toBeNull()
    expect(resolvePlatformSettingsTarget(scope, { ...catalog, projects: [] })).toBeNull()
  })
  it('keeps the exact settings binding when the native name echo precedes the Studio label', () => {
    const renamed = { ...repo, displayName: 'Renamed' }
    expect(settingsScopeRepos([renamed], scope)).toEqual([renamed])
    expect(resolvePlatformSettingsTarget(scope, { ...catalog, repos: [renamed] })?.ready)
      .toEqual(resolvePlatformSettingsTarget(scope, catalog)?.ready)
    const data = { project: { id: 'b', name: 'Old bootstrap label' }, target: { repoId: repo.id },
      runtime: { environmentId: 'server-b' } } as Parameters<typeof resolvePlatformProjectSettingsScope>[1]
    expect(resolvePlatformProjectSettingsScope('trusted-1', data,
      { id: 'b', name: 'Latest Studio label', directory: repo.path }, [renamed], projects[0].setups))
      .toMatchObject({ repoId: repo.id, hostId: scope.hostId, setupId: scope.setupId, path: repo.path })
  })
  it('does not borrow the same repo id on another host or consume an out-of-scope intent', () => {
    const other = { ...repo, executionHostId: 'local' as const }
    expect(settingsScopeRepos([other, repo], scope)).toEqual([repo])
    expect(resolvePlatformSettingsTarget(scope, { ...catalog, repos: [other] })).toBeNull()
    expect(resolvePlatformSettingsTarget(scope, catalog, { pane: 'repo', repoId: 'same', hostId: 'local' })).toBeNull()
    expect(resolvePlatformSettingsTarget(scope, catalog, { pane: 'agents', repoId: null })).toBeNull()
  })
  it('isolates UI draft keys by trusted context, platform, host and setup', () => {
    const a = settingsDraftKey(scope)
    for (const patch of [{ contextKey: 'trusted-2' }, { platformId: 'a' }, { hostId: 'local' }, { setupId: 'other' }]) {
      expect(settingsDraftKey({ ...scope, ...patch } as SettingsPresentationScope)).not.toBe(a)
    }
  })
})
