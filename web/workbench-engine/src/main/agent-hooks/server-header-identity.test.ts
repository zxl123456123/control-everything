import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AgentHookServer } from './server'
import { parseAgentHookEndpointFile } from '../../shared/agent-hook-endpoint-file'
import { OPENCODE_STARTUP_PROMPT_CLAIM_PATH } from '../../shared/opencode-startup-prompt'
import { RelayAgentHookServer } from '../../wsl-guest/agent-hook-server'

it('retains legacy relay clients and authenticates the canonical header before reading a body', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zkyq-relay-header-'))
  const forwarded: unknown[] = []
  const server = new RelayAgentHookServer({
    endpointDir: dir,
    forward: (event) => {
      forwarded.push(event)
    }
  })
  await server.start()
  try {
    const { port, token } = server.getCoordinates()
    const url = `http://127.0.0.1:${port}/hook/claude`
    for (const namespace of ['orca', 'zkyq']) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { [`x-${namespace}-agent-hook-token`]: token, 'content-type': 'application/json' },
        body: JSON.stringify({
          paneKey: 'tab:11111111-1111-4111-8111-111111111111',
          tabId: 'tab',
          env: 'remote',
          version: '1',
          payload: { hook_event_name: 'UserPromptSubmit', prompt: namespace }
        })
      })
      expect(response.status).toBe(204)
    }
    expect(forwarded).toHaveLength(2)
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'POST',
          headers: {
            'x-zkyq-agent-hook-token': token,
            'x-orca-agent-hook-token': 'wrong',
            'content-length': '1000000'
          }
        },
        (res) => {
          res.resume()
          res.on('end', () => {
            resolve(res.statusCode ?? 0)
            req.destroy()
          })
        }
      )
      req.on('error', reject)
      req.setTimeout(3000, () =>
        req.destroy(new Error('Relay authentication waited for an unfinished body'))
      )
      req.flushHeaders()
    })
    expect(status).toBe(403)
    expect(forwarded).toHaveLength(2)
  } finally {
    server.stop()
    rmSync(dir, { recursive: true, force: true })
  }
})

it('authenticates migrated clients and rejects mixed or duplicate tokens before reading a body', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zkyq-header-identity-'))
  const server = new AgentHookServer()
  let claims = 0
  try {
    await server.start({ userDataPath: dir, statusHooksEnabled: false })
    const endpoint = server.endpointFilePath
    if (!endpoint) throw new Error('Missing test endpoint')
    const coords = parseAgentHookEndpointFile(readFileSync(endpoint, 'utf8'))
    server.setStartupPromptClaimListener(
      () => {
        claims++
        return true
      },
      () => {}
    )
    const url = `http://127.0.0.1:${coords.port}${OPENCODE_STARTUP_PROMPT_CLAIM_PATH}`
    for (const namespace of ['orca', 'zkyq']) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          [`x-${namespace}-agent-hook-token`]: coords.token,
          'content-type': 'application/json'
        },
        body: '{}'
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ allowed: true })
    }
    for (const headers of [
      { 'x-zkyq-agent-hook-token': 'wrong', 'x-orca-agent-hook-token': coords.token },
      { 'x-zkyq-agent-hook-token': coords.token, 'x-orca-agent-hook-token': 'wrong' },
      { 'x-zkyq-agent-hook-token': [coords.token, coords.token] },
      { 'x-orca-agent-hook-token': [coords.token, coords.token] },
      {
        'x-zkyq-agent-hook-token': coords.token,
        'x-zkyq-pane-key': 'one:0',
        'x-orca-pane-key': 'two:0'
      }
    ]) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          url,
          { method: 'POST', headers: { ...headers, 'content-length': '1000000' } },
          (res) => {
            res.resume()
            res.on('end', () => {
              resolve(res.statusCode ?? 0)
              req.destroy()
            })
          }
        )
        req.on('error', reject)
        req.setTimeout(3000, () =>
          req.destroy(new Error('Authentication waited for an unfinished body'))
        )
        req.flushHeaders()
      })
      expect(status).toBe(403)
    }
    expect(claims).toBe(2)
  } finally {
    server.stop()
    rmSync(dir, { recursive: true, force: true })
  }
})
