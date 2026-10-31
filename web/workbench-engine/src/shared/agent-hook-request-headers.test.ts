import { expect, it } from 'vitest'
import { normalizeAgentHookRequestHeaders } from './agent-hook-request-headers'
import { mergeAgentHookRequestHeaders } from './agent-hook-listener/hook-envelope'

it('normalizes historical metadata without changing public headers or input objects', () => {
  const input = {
    'x-orca-agent-hook-token': 'fixture-token',
    'x-orca-pane-key': 'fixture-tab:0',
    'content-type': 'application/json',
    'x-user-choice': ['one', 'two']
  }
  expect(normalizeAgentHookRequestHeaders(input)).toEqual({
    'x-zkyq-agent-hook-token': 'fixture-token',
    'x-zkyq-pane-key': 'fixture-tab:0',
    'content-type': 'application/json',
    'x-user-choice': ['one', 'two']
  })
  expect(input).toHaveProperty('x-orca-agent-hook-token', 'fixture-token')
  expect(input).not.toHaveProperty('x-zkyq-agent-hook-token')
})

it('accepts equivalent names while preserving token arrays for strict authentication', () => {
  expect(
    normalizeAgentHookRequestHeaders({
      'x-orca-agent-hook-token': 'fixture',
      'x-zkyq-agent-hook-token': 'fixture'
    })
  ).toEqual({ 'x-zkyq-agent-hook-token': 'fixture' })
  expect(
    normalizeAgentHookRequestHeaders({ 'x-orca-agent-hook-token': ['fixture', 'extra'] })
  ).toEqual({ 'x-zkyq-agent-hook-token': ['fixture', 'extra'] })
})

it.each([
  'agent-hook-token',
  'agent-hook-meta',
  'agent-hook-meta-encoding',
  'agent-process',
  'pane-key',
  'tab-id',
  'launch-token',
  'worktree-id',
  'agent-hook-env',
  'agent-hook-version'
])('refuses conflicting metadata before choosing either %s', (suffix) => {
  const input = { [`x-orca-${suffix}`]: 'older', [`x-zkyq-${suffix}`]: 'current' }
  expect(normalizeAgentHookRequestHeaders(input)).toBeNull()
  expect(input[`x-orca-${suffix}`]).toBe('older')
})

it.each(['orca', 'zkyq'])('retains packed UTF-8 metadata from %s clients', (namespace) => {
  const body = { type: 'session.idle' }
  const values = ['fixture-tab:0', 'fixture-tab', 'launch', 'workspace', 'production', '1']
  const headers = {
    [`x-${namespace}-agent-hook-meta-encoding`]: 'base64',
    [`x-${namespace}-agent-hook-meta`]: Buffer.from(values.join('\x1f')).toString('base64'),
    [`x-${namespace}-agent-process`]: '进程'
  }
  expect(mergeAgentHookRequestHeaders(body, headers)).toEqual({
    paneKey: values[0],
    tabId: values[1],
    launchToken: values[2],
    worktreeId: values[3],
    env: values[4],
    version: values[5],
    agentProcess: '进程',
    payload: body
  })
})

it('does not fall back to body ownership after conflicting headers', () => {
  expect(
    mergeAgentHookRequestHeaders(
      { paneKey: 'body:0' },
      { 'x-orca-pane-key': 'first:0', 'x-zkyq-pane-key': 'second:0' }
    )
  ).toBeNull()
})
