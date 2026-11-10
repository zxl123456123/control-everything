/**
 * Host scan for processes carrying an agent-session spawn token.
 *
 * The token is the only PID-reuse-safe identity element a child is guaranteed to carry, and it
 * lives in the child's environment — which only Linux lets another process read (`/proc/<pid>/environ`).
 * macOS and Windows answer `null`, meaning "this host cannot enumerate", NEVER "no process carries
 * it": reporting an empty result there would free a reservation whose child is alive and hand a
 * second writer to the same provider session.
 */

import { readFile, readdir } from 'node:fs/promises'
import {
  LEGACY_AGENT_SESSION_SPAWN_TOKEN_ENV,
  ZKYQ_AGENT_SESSION_SPAWN_TOKEN_ENV
} from '../../shared/agent-session-caller-env'
import { spawnTokenFromEnvironBlock } from './agent-session-spawn-token-readback'

export type AgentSessionSpawnTokenScan = ReadonlyMap<string, readonly number[]>

/** Tokens observed on this host, or null when the platform cannot answer at all. */
export async function scanAgentSessionSpawnTokenProcesses(
  platform: NodeJS.Platform = process.platform,
  variable?: string
): Promise<AgentSessionSpawnTokenScan | null> {
  if (platform !== 'linux') {
    return null
  }
  let entries: string[]
  try {
    entries = await readdir('/proc')
  } catch {
    return null
  }
  const observed = new Map<string, number[]>()
  for (const entry of entries) {
    const pid = Number(entry)
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      continue
    }
    let block: string
    try {
      block = await readFile(`/proc/${pid}/environ`, 'utf-8')
    } catch {
      // A process that exited mid-scan, or one this user may not read, is not evidence either way.
      continue
    }
    // Either token is evidence that a reservation may still have a live child. A conflict must
    // not become an empty scan and release a reservation whose process is still running.
    const variables =
      variable === undefined
        ? [ZKYQ_AGENT_SESSION_SPAWN_TOKEN_ENV, LEGACY_AGENT_SESSION_SPAWN_TOKEN_ENV]
        : [variable]
    const tokens = new Set(variables.map((name) => spawnTokenFromEnvironBlock(block, name)))
    for (const token of tokens) {
      if (token !== null) {
        observed.set(token, [...(observed.get(token) ?? []), pid])
      }
    }
  }
  return observed
}

/** Pids carrying one specific token, or null when the host could not enumerate. */
export async function findAgentSessionSpawnTokenProcesses(
  spawnToken: string,
  scan: () => Promise<AgentSessionSpawnTokenScan | null> = scanAgentSessionSpawnTokenProcesses
): Promise<number[] | null> {
  const observed = await scan()
  return observed === null ? null : [...(observed.get(spawnToken) ?? [])]
}
