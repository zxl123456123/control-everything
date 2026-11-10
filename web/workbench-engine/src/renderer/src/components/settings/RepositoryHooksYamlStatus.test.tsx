import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RepositoryHooksYamlStatus } from './RepositoryHooksYamlStatus'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

describe('project configuration migration notices', () => {
  const render = (projectConfig: { name: 'zkyq.yaml' | 'orca.yaml'; conflict: boolean }) =>
    renderToStaticMarkup(
      <RepositoryHooksYamlStatus
        yamlState="loaded"
        yamlHooks={{ scripts: { setup: 'echo setup' } }}
        projectConfig={projectConfig}
        copiedTemplate={false}
        onCopyTemplate={() => {}}
      />
    )

  it('explains a legacy file and a conflict without changing the hooks shown', () => {
    const legacy = render({ name: 'orca.yaml', conflict: false })
    expect(legacy).toContain('Using orca.yaml. Review and rename it to zkyq.yaml.')
    expect(legacy).toContain('echo setup')
    const conflict = render({ name: 'zkyq.yaml', conflict: true })
    expect(conflict).toContain('Both zkyq.yaml and orca.yaml exist.')
    expect(conflict).toContain('echo setup')
  })

  it('does not show a migration notice for the new file alone', () => {
    const current = render({ name: 'zkyq.yaml', conflict: false })
    expect(current).not.toContain('orca.yaml')
    expect(current).toContain('echo setup')
  })
})
