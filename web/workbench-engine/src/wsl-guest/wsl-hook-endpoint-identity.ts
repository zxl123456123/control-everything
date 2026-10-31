import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseAgentHookEndpointFile } from '../shared/agent-hook-endpoint-file'
import { isShellSafeEndpointValue } from '../shared/agent-hook-listener/endpoint-publication'
import {
  sanitizeWslHookInstanceKey,
  wslHookRelayEndpointDir
} from '../shared/wsl-hook-relay-contract'

function directoryPath(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat && !stat.isDirectory()) {
    throw new Error('WSL hook endpoint directory contains a non-directory or symbolic link')
  }
}

function hasManagedEndpoint(directory: string): boolean {
  return ['endpoint-v2.env', 'endpoint.env'].some((name) => {
    const file = join(directory, name)
    const stat = lstatSync(file, { throwIfNoEntry: false })
    if (!stat?.isFile() || stat.size > 64 * 1024) return false
    const contents = readFileSync(file, 'utf8')
    const lines = contents.trim().split(/\r?\n/)
    if (
      lines.some(
        (line) =>
          !/^(?:ZKYQ|ORCA)_AGENT_HOOK_(?:PORT|TOKEN|ENV|VERSION|TRANSPORT|OPENCODE_TUI)=/.test(line)
      )
    )
      return false
    try {
      const endpoint = parseAgentHookEndpointFile(contents)
      return (
        Object.values(endpoint).every(isShellSafeEndpointValue) &&
        /^\d+$/.test(endpoint.port) &&
        Number(endpoint.port) > 0 &&
        Number(endpoint.port) <= 65535 &&
        endpoint.version === (name === 'endpoint.env' ? '1' : '2')
      )
    } catch {
      return false
    }
  })
}

/** Prepare the canonical instance view and relocate when the filesystem allows it.
 * Existing readers retain one migration link; fresh instances create only the current path.
 * Removing that link requires confirming the old PTY/Agent cohort has exited. */
export function prepareWslHookEndpointDirectory(home: string, instanceKey: string): string {
  if (sanitizeWslHookInstanceKey(instanceKey) !== instanceKey) {
    throw new Error('Invalid WSL hook endpoint instance key')
  }
  const current = wslHookRelayEndpointDir(home, instanceKey)
  const retired = join(home, '.orca-wsl', 'agent-hooks', `instance-${instanceKey}`)
  for (const root of ['.zkyq-wsl', '.orca-wsl']) {
    directoryPath(join(home, root))
    directoryPath(join(home, root, 'agent-hooks'))
  }
  const prior = lstatSync(retired, { throwIfNoEntry: false })
  const currentStat = lstatSync(current, { throwIfNoEntry: false })
  const deferred = currentStat?.isSymbolicLink()
  if (deferred) {
    if (
      resolve(dirname(current), readlinkSync(current)) !== resolve(retired) ||
      !prior?.isDirectory() ||
      !hasManagedEndpoint(retired)
    ) {
      throw new Error('WSL hook endpoint migration link has an unexpected target')
    }
  } else {
    directoryPath(current)
  }
  if (!prior) return current
  if (prior.isSymbolicLink()) {
    if (
      resolve(dirname(retired), readlinkSync(retired)) !== resolve(current) ||
      !lstatSync(current, { throwIfNoEntry: false })?.isDirectory()
    ) {
      throw new Error('WSL hook endpoint migration link has an unexpected target')
    }
    return current
  }
  if (!prior.isDirectory() || !hasManagedEndpoint(retired)) {
    throw new Error('Refusing to migrate an unrecognized WSL hook endpoint directory')
  }
  if (currentStat && !deferred) {
    throw new Error('Both current and retired WSL hook endpoint directories exist')
  }
  mkdirSync(dirname(current), { recursive: true, mode: 0o700 })
  if (deferred) unlinkSync(current)
  try {
    renameSync(retired, current)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // DrvFS cannot rename a directory while an old spool writer holds a file.
    // Keep one canonical view and retry relocation on the next relay startup.
    if (deferred || code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
      symlinkSync(retired, current, 'dir')
    }
    if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EBUSY') throw error
    console.warn('[wsl-hook-relay] endpoint relocation deferred until open files close')
    return current
  }
  try {
    symlinkSync(current, retired, 'dir')
  } catch (error) {
    // Restore the original location if publishing the frozen-reader path fails.
    if (!lstatSync(retired, { throwIfNoEntry: false })) renameSync(current, retired)
    throw error
  }
  return current
}
