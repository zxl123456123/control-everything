import { describe, expect, it } from 'vitest'
import { projectRoute, readPlatformRoute } from './platform-route'

describe('platform page routes', () => {
  const read = (hash: string, search = '') => readPlatformRoute({ hash, search })
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
    expect(read('#settings').view).toBe('tools')
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
