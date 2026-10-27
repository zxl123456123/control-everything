import { describe, expect, it } from 'vitest'
import { projectRoute, readPlatformRoute } from './platform-route'

describe('platform page routes', () => {
  const read = (hash: string, search = '') => readPlatformRoute({ hash, search })
  it('keeps news inside Studio independently of a legacy project query', () => {
    expect(read('#news', '?project_id=p-one')).toEqual({ view: 'news', id: '', tab: '' })
  })
  it('opens all account aliases independently of a legacy project query', () => {
    for (const hash of ['#mobile', '#settings/mobile', '#settings/account']) {
      expect(read(hash)).toEqual({ view: 'settings', id: '', tab: 'account' })
      expect(read(hash, '?project_id=p-one')).toEqual({ view: 'settings', id: '', tab: 'account' })
    }
    expect(read(projectRoute('p-one'), '?project_id=p-two').id).toBe('p-one')
  })
  it('opens legacy project links and returns home without falling back to their old query', () => {
    expect(read('', '?project_id=p-one')).toEqual({
      view: 'project',
      id: 'p-one',
      tab: 'workspace'
    })
    expect(read('#home', '?project_id=p-one').view).toBe('home')
    expect(read('#project/p-two/review', '?project_id=p-one')).toEqual({
      view: 'project',
      id: 'p-two',
      tab: 'review'
    })
  })
  it('keeps old management routes under the project and old inbox links as filters', () => {
    expect(read('#project/p-one/manage').tab).toBe('tasks')
    expect(read('#project/p-one/attention').tab).toBe('attention')
    expect(read('#project/p-one/activity').tab).toBe('activity')
    expect(read('#project/p-one/sessions').tab).toBe('workspace')
    expect(read('#attention')).toEqual({ view: 'inbox', id: '', tab: 'attention' })
    expect(read('#tasks')).toEqual({ view: 'inbox', id: '', tab: 'all' })
    expect(read('#inbox/attention').tab).toBe('attention')
    expect(read('#inbox/review').tab).toBe('review')
    expect(read('#overview').view).toBe('home')
    expect(read('#settings')).toEqual({ view: 'settings', id: '', tab: 'appearance' })
    expect(read('#agents').view).toBe('tools')
    expect(read('#projects').view).toBe('home')
    expect(projectRoute('p-one', 'tasks')).toBe('#project/p-one/tasks')
  })
  it.each(['#project/%ZZ', '#project/%2Fetc/review', '#project/../tasks'])(
    'rejects malformed project route %s',
    (hash) => {
      expect(read(hash).view).toBe('home')
    }
  )
})


it('separates setup, global settings and explicit project intents without changing legacy task filters', () => {
  for (const hash of ['#workbench', '#workspace', '#project-setup']) expect(readPlatformRoute({ hash, search: '?project_id=p-one' })).toEqual({view:'workbench', id:'', tab:''})
  expect(readPlatformRoute({hash:'#settings/development',search:''})).toEqual({view:'settings',id:'',tab:'development'})
  for (const tab of ['settings','items','board']) expect(readPlatformRoute({hash:'#project/p-one/'+tab,search:''})).toEqual({view:'project',id:'p-one',tab})
  expect(readPlatformRoute({hash:'#settings/%2Fbad',search:''}).tab).toBe('appearance')
})
