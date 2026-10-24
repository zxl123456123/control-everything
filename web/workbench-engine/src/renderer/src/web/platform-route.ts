export type PlatformRoute =
  | { view: 'home' | 'tools' | 'inbox' | 'mobile'; id: ''; tab: string }
  | {
      view: 'project'
      id: string
      tab: 'workspace' | 'tasks' | 'review' | 'attention' | 'activity' | 'monitor'
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
      tab: ['tasks', 'review', 'attention', 'activity', 'monitor'].includes(page)
        ? (page as 'tasks' | 'review' | 'attention' | 'activity' | 'monitor')
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
  if (view === 'mobile') return { view: 'mobile', id: '', tab: '' }
  return {
    view: ['tools', 'settings', 'agents'].includes(view) ? 'tools' : 'home',
    id: '',
    tab: ''
  }
}

export function projectRoute(id: string, tab = 'workspace'): string {
  return `#project/${encodeURIComponent(id)}/${tab}`
}
