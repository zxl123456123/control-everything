export type PlatformRoute =
  | { view: 'news' | 'home' | 'tools' | 'inbox' | 'mobile' | 'project-setup' | 'settings'; id: ''; tab: string }
  | {
      view: 'project'
      id: string
      tab: 'workspace' | 'tasks' | 'review' | 'attention' | 'activity' | 'monitor' | 'settings' | 'items' | 'board'
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
    const page = tab === 'manage' ? 'tasks' : tab
    return {
      view: 'project',
      id,
      tab: ['tasks', 'review', 'attention', 'activity', 'monitor', 'settings', 'items', 'board'].includes(page)
        ? (page as Extract<PlatformRoute, { view: 'project' }>['tab'])
        : 'workspace'
    }
  }
  if (view === 'tasks' || view === 'attention' || view === 'inbox')
    return {
      view: 'inbox',
      id: '',
      tab:
        view === 'attention' || encoded === 'attention'
          ? 'attention'
          : encoded === 'review'
            ? 'review'
            : 'all'
    }
  if (view === 'news') return { view: 'news', id: '', tab: '' }
  if (view === 'mobile') return { view: 'mobile', id: '', tab: '' }
  if (view === 'project-setup' || view === 'workspace')
    return { view: 'project-setup', id: '', tab: '' }
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
