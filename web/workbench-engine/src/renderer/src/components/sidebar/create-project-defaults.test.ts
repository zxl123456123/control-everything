import { describe, expect, it } from 'vitest'
import { getDefaultWorkspaceDir } from '../../../../shared/constants'
import {
  formatCreateProjectParentSummary,
  getDefaultCreateProjectParent
} from './create-project-defaults'

describe('project directory defaults', () => {
  it.each([
    [
      '/home/example/',
      '/home/example/zkyq/projects',
      '/home/example/zkyq/workspaces',
      '~/zkyq/projects'
    ],
    [
      '/Users/example',
      '/Users/example/zkyq/projects',
      '/Users/example/zkyq/workspaces',
      '~/zkyq/projects'
    ],
    [
      String.raw`C:\example\home`,
      String.raw`C:\example\home\zkyq\projects`,
      String.raw`C:\example\home\zkyq\workspaces`,
      String.raw`C:\example\home\zkyq\projects`
    ]
  ])('keeps native separators for %s', (home, projects, workspaces, summary) => {
    expect(getDefaultCreateProjectParent(home)).toBe(projects)
    expect(getDefaultWorkspaceDir(home)).toBe(workspaces)
    expect(formatCreateProjectParentSummary({ parent: projects, defaultParent: projects })).toBe(
      summary
    )
  })

  it.each(['/data/zkyq/projects', '/home/example/orca/projects'])('keeps %s verbatim', (parent) => {
    expect(formatCreateProjectParentSummary({ parent, defaultParent: parent })).toBe(parent)
  })

  it.each([{ isRemoteHost: true }, { runtimeEnvironmentId: 'remote-runtime' }])(
    'does not abbreviate the remote host home as the client home',
    (scope) => {
      const parent = '/home/example/zkyq/projects'
      expect(formatCreateProjectParentSummary({ parent, defaultParent: parent, ...scope })).toBe(
        parent
      )
    }
  )
})
