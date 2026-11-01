import { randomUUID } from 'node:crypto'
import { posix, win32 } from 'node:path'
import { quotePosixShell } from '../../../shared/shell-argument-quoting'
import { orcadNodeRuntimeExecutable } from '../../../shared/orcad-artifacts'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  validateRemoteHome
} from '../../ssh/ssh-remote-platform'
import {
  RELAY_REMOTE_DIR,
  RETIRED_RELAY_REMOTE_DIR
} from '../../ssh/remote-exec/remote-frame-protocol'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import {
  REMOTE_NODE_RUNTIME_READY,
  REMOTE_NODE_RUNTIME_MISSING
} from '../../ssh/orcad-remote-node-runtime-report'
import {
  execOrcadRemote,
  type OrcadRemoteExecTarget
} from '../install/orcad-remote-runtime-control'
import { acquireInstallLock } from '../install/remote-install-lock'
import { remoteInstallDirOwner } from '../install/remote-install-model'
import {
  nodeRuntimeStoreDir,
  remoteNodeRuntimePresentCommand,
  NODE_RUNTIME_PROMOTE_TIMEOUT_MS
} from '../install/orcad-remote-node-runtime'
import { orcadWindowsNodeCommandLine } from '../install/orcad-remote-windows-node'
import { writeRemoteInstallFile } from '../install/remote-install-transfers'
import {
  deferredRemoteRootCommand,
  parseRemoteRootProbe,
  remoteRootProbeCommand,
  releaseRemoteRootLockCommand,
  windowsRemoteRootMoveCommand,
  type RemoteRootProbe
} from './remote-root-identity-commands'
import {
  REMOTE_ROOT_IDENTITY_LOCK,
  REMOTE_ROOT_IDENTITY_OWNER,
  REMOTE_ROOT_IDENTITY_SCRIPT,
  REMOTE_ROOT_IDENTITY_SCRIPT_FILENAME
} from './remote-root-identity-host'

export type RemoteRootIdentityScope = { key: string | null; expectedKeys: readonly string[] }
export type RemoteRootIdentityResult = {
  state: 'current' | 'bridged' | 'deferred'
  reason?: string
}

/** Establish the canonical install namespace without separating old readers from new writes. */
export async function prepareRemoteRootIdentity(
  remote: OrcadRemoteExecTarget,
  home: string,
  target: NodeRuntimeTarget,
  scope: RemoteRootIdentityScope
): Promise<RemoteRootIdentityResult> {
  const { host } = remote
  if (!validateRemoteHome(home, host))
    throw new Error('Remote root home is not a valid absolute path')
  const old = joinRemotePath(host, home, RETIRED_RELAY_REMOTE_DIR)
  const current = joinRemotePath(host, home, RELAY_REMOTE_DIR)
  const paths = isWindowsRemoteHost(host) ? win32 : posix
  const same = (a: string, b: string) =>
    isWindowsRemoteHost(host)
      ? paths.resolve(a).toLowerCase() === paths.resolve(b).toLowerCase()
      : a === b
  const check = (probe: RemoteRootProbe) => {
    if (probe.old === 'other' || probe.current === 'other')
      throw new Error('Remote install root is not a directory')
    if (
      probe.old === 'link' &&
      (!same(paths.resolve(home, probe.oldTarget), current) || probe.current !== 'dir')
    )
      throw new Error('Remote root bridge has an unexpected target')
    if (
      probe.current === 'link' &&
      (!same(paths.resolve(home, probe.currentTarget), old) || probe.old !== 'dir')
    )
      throw new Error('Remote root migration link has an unexpected target')
    if (probe.old === 'dir' && probe.current === 'dir')
      throw new Error('Both current and retired remote install directories exist')
    if (probe.record) {
      if (Buffer.byteLength(probe.record) > 65536 || JSON.parse(probe.record).schemaVersion !== 1)
        throw new Error('Unsupported remote root identity record')
    }
  }
  let probe = parseRemoteRootProbe(
    await execOrcadRemote(remote, remoteRootProbeCommand(host, home))
  )
  check(probe)
  if (probe.old === 'absent') return { state: 'current' }
  const token = randomUUID()
  await acquireInstallLock(remote.conn, home, host, {
    signal: remote.signal,
    lockName: REMOTE_ROOT_IDENTITY_LOCK,
    relayGcClaim: false,
    waitTimeoutMs: 15_000,
    owner: { fileName: REMOTE_ROOT_IDENTITY_OWNER, token }
  })
  let preserveLock = false
  try {
    probe = parseRemoteRootProbe(await execOrcadRemote(remote, remoteRootProbeCommand(host, home)))
    check(probe)
    if (probe.old === 'absent') return { state: 'current' }
    let base = probe.old === 'dir' ? old : current
    const runtimeDir = nodeRuntimeStoreDir(host, base, target)
    const runtimeStatus = (
      await execOrcadRemote(remote, remoteNodeRuntimePresentCommand(host, runtimeDir))
    ).trim()
    const runtimeReady = runtimeStatus === REMOTE_NODE_RUNTIME_READY
    if (!runtimeReady && runtimeStatus !== REMOTE_NODE_RUNTIME_MISSING)
      throw new Error('Remote identity runtime is unverifiable')
    let owned = Boolean(probe.slot && remoteInstallDirOwner(probe.slot)) || runtimeReady
    if (probe.owner) {
      if (Buffer.byteLength(probe.owner) > 65536)
        throw new Error('Remote ownership record is oversized')
      const owner = JSON.parse(probe.owner)
      owned ||=
        owner?.schemaVersion === 1 &&
        ((typeof owner.machineKey === 'string' && /^[a-f0-9]{16}$/.test(owner.machineKey)) ||
          (Object.hasOwn(owner, 'active') &&
            Object.hasOwn(owner, 'previous') &&
            (owner.active === null || typeof owner.active === 'string') &&
            (owner.previous === null || typeof owner.previous === 'string')))
    }
    if (!owned)
      throw new Error(
        'Retired remote directory has no recognized install ownership; its contents were preserved'
      )
    if (probe.old === 'dir' && isWindowsRemoteHost(host)) {
      const moved = (
        await execOrcadRemote(remote, windowsRemoteRootMoveCommand(host, home, token))
      ).trim()
      if (moved !== 'MOVED' && moved !== 'DEFERRED')
        throw new Error('Remote root move returned no verifiable answer')
      base = current
    } else if (probe.old === 'dir' && !runtimeReady) {
      const moved = (
        await execOrcadRemote(remote, deferredRemoteRootCommand(host, home, token))
      ).trim()
      if (moved !== 'DEFERRED') throw new Error('Remote root bridge returned no verifiable answer')
      return { state: 'deferred', reason: 'runtime-not-installed' }
    }
    if (!runtimeReady) return { state: 'bridged', reason: 'runtime-not-installed' }
    const script = joinRemotePath(host, base, REMOTE_ROOT_IDENTITY_SCRIPT_FILENAME)
    await writeRemoteInstallFile(remote.conn, host, script, REMOTE_ROOT_IDENTITY_SCRIPT, {
      signal: remote.signal
    })
    let runtime = joinRemotePath(
      host,
      nodeRuntimeStoreDir(host, base, target),
      ...orcadNodeRuntimeExecutable(target).split('/')
    )
    if (!isWindowsRemoteHost(host) && probe.old === 'dir') {
      // A POSIX home can live on DrvFS, which cannot move a directory holding its own executable.
      const lock = joinRemotePath(host, home, REMOTE_ROOT_IDENTITY_LOCK)
      const bootstrap = joinRemotePath(host, lock, 'node')
      const owner = joinRemotePath(host, lock, REMOTE_ROOT_IDENTITY_OWNER)
      const prepared = (
        await execOrcadRemote(
          remote,
          `[ ! -L ${quotePosixShell(lock)} ] && [ "$(cat ${quotePosixShell(owner)})" = ${quotePosixShell(token)} ] && [ ! -e ${quotePosixShell(bootstrap)} ] && [ ! -L ${quotePosixShell(bootstrap)} ] && cp ${quotePosixShell(runtime)} ${quotePosixShell(bootstrap)} && chmod 700 ${quotePosixShell(bootstrap)} && cmp -s ${quotePosixShell(runtime)} ${quotePosixShell(bootstrap)} && echo ZKYQ_IDENTITY_RUNTIME_READY`,
          remote.signal,
          NODE_RUNTIME_PROMOTE_TIMEOUT_MS
        )
      ).trim()
      if (prepared !== 'ZKYQ_IDENTITY_RUNTIME_READY')
        throw new Error('Remote root migration runtime was not copied intact')
      runtime = bootstrap
    }
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64')
    const args = [
      script,
      home,
      encode(scope.key),
      encode(scope.expectedKeys),
      token,
      !isWindowsRemoteHost(host) && probe.old === 'dir' ? 'prepare' : 'finalize'
    ]
    const command = isWindowsRemoteHost(host)
      ? orcadWindowsNodeCommandLine(runtime, args)
      : [runtime, ...args].map(quotePosixShell).join(' ')
    const result: unknown = JSON.parse(await execOrcadRemote(remote, command))
    if (
      !result ||
      typeof result !== 'object' ||
      !('state' in result) ||
      !['current', 'bridged', 'deferred'].includes(String(result.state))
    )
      throw new Error('Remote root identity returned no verifiable result')
    return result as RemoteRootIdentityResult
  } catch (error) {
    preserveLock = isUnconfirmedSshCommandTermination(error)
    throw error
  } finally {
    if (!preserveLock)
      await execOrcadRemote(remote, releaseRemoteRootLockCommand(host, home, token))
  }
}
