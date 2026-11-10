export type PlatformRoute =
  | { view: 'news' | 'home' | 'tools' | 'mobile' | 'workbench' | 'settings'; id: ''; tab: string }
  | {
      view: 'project'
      id: string
      tab: 'workspace' | 'activity' | 'settings'
    }

export function readPlatformRoute(location: Pick<Location, 'hash' | 'search'>): PlatformRoute {
  const [view, encoded = '', tab = ''] = location.hash.slice(1).split('/')
  let id = ''
  try {
    id = decodeURIComponent(encoded)
  } catch {
    /* Invalid links return to projects. */
  }
  if (!view && location.search) id = new URLSearchParams(location.search).get('project_id') || ''
  if ((view === 'project' || !view) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    return {
      view: 'project',
      id,
      tab: ['activity', 'settings'].includes(tab)
        ? (tab as Extract<PlatformRoute, { view: 'project' }>['tab'])
        : 'workspace'
    }
  }
  if (view === 'news') return { view: 'news', id: '', tab: '' }
  if (view === 'mobile' || view === 'settings' && id === 'mobile')
    return { view: 'settings', id: '', tab: 'account' }
  if (view === 'workbench' || view === 'project-setup' || view === 'workspace')
    return { view: 'workbench', id: '', tab: '' }
  if (view === 'settings')
    return { view: 'settings', id: '', tab: /^[a-z][a-z0-9-]{0,63}$/.test(id) ? id : 'appearance' }
  return {
    view: ['tools', 'agents'].includes(view) ? 'tools' : 'home',
    id: '',
    tab: ''
  }
}

export function projectRoute(id: string, tab = 'workspace'): string {
  return `#project/${encodeURIComponent(id)}/${tab}`
}
