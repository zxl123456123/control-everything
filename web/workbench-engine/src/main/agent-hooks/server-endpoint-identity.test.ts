import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseAgentHookEndpointFile } from '../../shared/agent-hook-endpoint-file'
import { OPENCODE_STARTUP_PROMPT_CLAIM_PATH } from '../../shared/opencode-startup-prompt'
import { AgentHookServer } from './server'

it.each(['absent', 'v1', 'unrelated'] as const)(
  'publishes canonical coordinates while preserving a %s endpoint reader',
  async (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'zkyq-endpoint-upgrade-'))
    const endpointDir = join(dir, 'agent-hooks')
    const oldPath = join(
      endpointDir,
      process.platform === 'win32' ? 'endpoint.cmd' : 'endpoint.env'
    )
    const oldBody =
      kind === 'v1'
        ? ['PORT=10001', 'TOKEN=retired-fixture-token', 'ENV=production', 'VERSION=1']
            .map((line) => 'set ORCA_AGENT_HOOK_' + line)
            .join('\r\n')
        : 'unrelated fixture text\n'
    if (kind !== 'absent') {
      mkdirSync(endpointDir, { recursive: true })
      writeFileSync(oldPath, oldBody)
    }
    const server = new AgentHookServer()
    try {
      await server.start({ userDataPath: dir, statusHooksEnabled: false })
      server.setStartupPromptClaimListener(
        () => true,
        () => {}
      )
      const endpoint = server.endpointFilePath!
      expect(endpoint).toContain('endpoint-v2.')
      const content = readFileSync(endpoint, 'utf8')
      expect(content).not.toContain('ORCA_')
      const current = parseAgentHookEndpointFile(content)
      expect(current.version).toBe('2')
      const response = await fetch(
        `http://127.0.0.1:${current.port}${OPENCODE_STARTUP_PROMPT_CLAIM_PATH}`,
        {
          method: 'POST',
          headers: { 'x-zkyq-agent-hook-token': current.token },
          body: '{}'
        }
      )
      expect(response.status).toBe(200)
      await response.arrayBuffer()
      if (kind === 'v1') {
        // Deliberately keep the frozen reader: it knows only ORCA keys, not the new adapter.
        const old = Object.fromEntries(
          readFileSync(oldPath, 'utf8')
            .trim()
            .split(/\r?\n/)
            .map((line) => {
              const [key, ...value] = line.replace(/^set\s+/i, '').split('=')
              return [key, value.join('=')]
            })
        )
        expect(old.ORCA_AGENT_HOOK_PORT).toBe(current.port)
        expect(old.ORCA_AGENT_HOOK_TOKEN).toBe(current.token)
        expect(old.ORCA_AGENT_HOOK_VERSION).toBe('1')
        const legacy = await fetch(
          `http://127.0.0.1:${old.ORCA_AGENT_HOOK_PORT}${OPENCODE_STARTUP_PROMPT_CLAIM_PATH}`,
          {
            method: 'POST',
            headers: { 'x-orca-agent-hook-token': old.ORCA_AGENT_HOOK_TOKEN },
            body: '{}'
          }
        )
        expect(legacy.status).toBe(200)
        await legacy.arrayBuffer()
      } else if (kind === 'unrelated') {
        expect(readFileSync(oldPath, 'utf8')).toBe(oldBody)
      } else {
        expect(existsSync(oldPath)).toBe(false)
      }
    } finally {
      server.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
