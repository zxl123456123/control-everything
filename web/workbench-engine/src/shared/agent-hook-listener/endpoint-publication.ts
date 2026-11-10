import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import { sweepStaleAgentHookEndpointTemps } from '../agent-hook-endpoint-temp-cleanup'

// ─── Endpoint-file writing ──────────────────────────────────────────

export function getEndpointFileName(): string {
  // Why: per-platform extension lets hook scripts source the file natively (POSIX `. "$file"` / Windows `call "%file%"`); the OpenCode plugin regex accepts both shapes.
  return process.platform === 'win32' ? 'endpoint-v2.cmd' : 'endpoint-v2.env'
}

export function isShellSafeEndpointValue(value: string): boolean {
  // Why: values are shell-sourced; the + rejects empty strings so a sourced `KEY=` can't clear the env var.
  return /^[A-Za-z0-9._:/-]+$/.test(value)
}

export type EndpointFileFields = {
  port: number
  token: string
  env: string
  version: string
  transport?: string
  openCodeTui?: boolean
}

/** Atomically write the endpoint file at `endpointDir/<getEndpointFileName()>`.
 *  Returns true on success, false on error (caller may fall back to PTY env).
 *  Kept in sync with `AgentHookServer.writeEndpointFile`. */
export function writeEndpointFile(
  endpointDir: string,
  finalPath: string,
  fields: EndpointFileFields
): boolean {
  const tmpPath = join(endpointDir, `.endpoint-${process.pid}-${randomUUID()}.tmp`)
  const prefix = process.platform === 'win32' ? 'set ' : ''
  const valuesToWrite: [string, string][] = [
    ['ZKYQ_AGENT_HOOK_PORT', String(fields.port)],
    ['ZKYQ_AGENT_HOOK_TOKEN', fields.token],
    ['ZKYQ_AGENT_HOOK_ENV', fields.env],
    ['ZKYQ_AGENT_HOOK_VERSION', fields.version]
  ]
  if (fields.transport) {
    valuesToWrite.push(['ZKYQ_AGENT_HOOK_TRANSPORT', fields.transport])
  }
  if (fields.openCodeTui) {
    valuesToWrite.push(['ZKYQ_AGENT_HOOK_OPENCODE_TUI', '1'])
  }
  for (const [key, value] of valuesToWrite) {
    if (!isShellSafeEndpointValue(value)) {
      console.error(
        `[agent-hooks] refusing to write endpoint file: ${key} contains ` +
          'characters unsafe for shell sourcing. Falling back to PTY env.'
      )
      return false
    }
  }
  const lines = [...valuesToWrite.map(([key, value]) => `${prefix}${key}=${value}`), '']
  // Existing sessions keep their frozen file path and v1 parser until they exit.
  // A fresh profile creates only the canonical v2 endpoint.
  const retiredPath = join(
    endpointDir,
    process.platform === 'win32' ? 'endpoint.cmd' : 'endpoint.env'
  )
  let refreshRetired = false
  try {
    if (
      retiredPath !== finalPath &&
      existsSync(retiredPath) &&
      lstatSync(retiredPath).isFile() &&
      statSync(retiredPath).size <= 64 * 1024
    ) {
      const prior = readFileSync(retiredPath, 'utf8')
      refreshRetired = ['PORT', 'TOKEN', 'ENV', 'VERSION'].every((suffix) =>
        new RegExp(`^(?:set\\s+)?ORCA_AGENT_HOOK_${suffix}=.+$`, 'm').test(prior)
      )
    }
  } catch {
    // An unreadable or unrelated file is never rewritten as a migration side effect.
  }
  let tmpWritten = false
  try {
    // Why: 0o700 owner-only so the dir doesn't leak this install's existence to other local users.
    mkdirSync(endpointDir, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') {
      // Why: mkdirSync mode only applies on creation; chmod fixes perms on a pre-existing dir (POSIX-only).
      try {
        chmodSync(endpointDir, 0o700)
      } catch {
        // best-effort
      }
    }
    // Why: crash-orphan cleanup must not materialize a tampered, enormous directory.
    sweepStaleAgentHookEndpointTemps(endpointDir)
    const separator = process.platform === 'win32' ? '\r\n' : '\n'
    writeFileSync(tmpPath, lines.join(separator), { mode: 0o600 })
    tmpWritten = true
    renameSync(tmpPath, finalPath)
    if (refreshRetired) {
      const retiredLines = valuesToWrite.map(
        ([key, value]) =>
          `${prefix}${key.replace(/^ZKYQ_/, 'ORCA_')}=${key === 'ZKYQ_AGENT_HOOK_VERSION' ? '1' : value}`
      )
      writeFileSync(tmpPath, [...retiredLines, ''].join(separator), { mode: 0o600 })
      renameSync(tmpPath, retiredPath)
    }
    return true
  } catch (err) {
    console.error('[agent-hooks] failed to write endpoint file:', err)
    if (tmpWritten) {
      try {
        unlinkSync(tmpPath)
      } catch {
        // tmp may already be gone
      }
    }
    return false
  }
}
