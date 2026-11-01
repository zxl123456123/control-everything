import {
  MANAGED_DATA_ROOT_FLAG,
  MANAGED_DATA_ROOT_HELPER_MARKER,
  MANAGED_DATA_ROOT_PATH_MARKER,
  MANAGED_DATA_ROOT_TARGET_MARKER,
  MANAGED_DATA_ROOT_RESULT_MARKER,
  type ManagedDataRootResult
} from '../../../shared/managed-data-roots'
import {
  ORCAD_CLI_PACKAGE_FILENAME,
  ORCAD_INSTALL_COMPLETE_FILENAME
} from '../../../shared/orcad-artifacts'
import { quotePosixShell } from '../../../shared/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  normalizeRemoteHome,
  remoteBasename,
  remoteDirname
} from '../../ssh/ssh-remote-platform'
import { ORCAD_INSTALL_MODEL, remoteInstallVersionDirRegex } from './remote-install-model'
import { orcadNodeSlotRuntimeCommand, selectOrcadSlotEntryCommand } from './orcad-remote-runtime'
import { execOrcadRemote, type OrcadRemoteExecTarget } from './orcad-remote-runtime-control'
import {
  orcadRemoteBaseDir,
  orcadWindowsHomeOpCommand,
  orcadWindowsNodeCommandLine,
  orcadWindowsSlotOpCommand,
  readOrcadWindowsEncodedAnswer
} from './orcad-remote-windows-node'
import {
  readWindowsOrcadSlotEntry,
  readWindowsOrcadSlotRuntime
} from './orcad-remote-launch-windows'

type Target = OrcadRemoteExecTarget & { remoteHome: string }
type Probe = {
  userDataDir: string
  state: 'current' | 'previous' | 'empty'
  helper: string | null
  targetSupports: boolean
}

/** Read-only discovery, including a current helper retained beside an older rollback slot. */
export function managedDataRootProbeCommand(
  target: Target,
  current: string,
  preferred?: string
): string {
  const { host, remoteHome } = target
  const base = orcadRemoteBaseDir(host, remoteHome)
  if (isWindowsRemoteHost(host))
    return orcadWindowsHomeOpCommand(host, remoteHome, 'data-root-probe', [
      base,
      current,
      ...(preferred ? [preferred] : [])
    ])
  const previous = joinRemotePath(
    host,
    remoteDirname(current, host),
    remoteBasename(current, host).replace('.zkyq', '.orca')
  )
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64')
  return [
    `c=${quotePosixShell(current)}; o=${quotePosixShell(previous)};`,
    'if [ -e "$c" ] && [ -e "$o" ] && ! [ "$c" -ef "$o" ]; then echo "Conflicting default data directories" >&2; exit 78; fi;',
    `if [ -e "$c" ] || [ -L "$c" ]; then r=${quotePosixShell(encoded({ userDataDir: current, state: 'current' }))};`,
    `elif [ -e "$o" ] || [ -L "$o" ]; then r=${quotePosixShell(encoded({ userDataDir: previous, state: 'previous' }))};`,
    `else r=${quotePosixShell(encoded({ userDataDir: current, state: 'empty' }))}; fi;`,
    `printf '${MANAGED_DATA_ROOT_PATH_MARKER} %s\\n' "$r";`,
    `cap() { p="$1"/${quotePosixShell(ORCAD_CLI_PACKAGE_FILENAME)}; [ -f "$p" ] && [ "$(wc -c < "$p")" -le 65536 ] && grep -Eq '"zkyqDefaultDataRoots"[[:space:]]*:[[:space:]]*1[[:space:]]*[,}]' "$p"; };`,
    `t=MA==; ${preferred ? `if cap ${quotePosixShell(preferred)}; then t=MQ==; fi;` : ''}`,
    `printf '${MANAGED_DATA_ROOT_TARGET_MARKER} %s\\n' "$t";`,
    `h=; for d in ${preferred ? quotePosixShell(preferred) + ' ' : ''}${quotePosixShell(base)}/${ORCAD_INSTALL_MODEL.dirPrefix}-*; do`,
    `[ -d "$d" ] && [ ! -L "$d" ] && [ -f "$d"/${quotePosixShell(ORCAD_INSTALL_COMPLETE_FILENAME)} ] && cap "$d" || continue; h="$d"; break; done;`,
    `printf '${MANAGED_DATA_ROOT_HELPER_MARKER} '; printf %s "$h" | base64 | tr -d '\\r\\n'; echo;`
  ].join(' ')
}

export async function discoverManagedDataRoot(
  target: Target,
  current: string,
  preferred?: string
): Promise<Probe> {
  const output = await execOrcadRemote(
    target,
    managedDataRootProbeCommand(target, current, preferred)
  )
  const raw = readOrcadWindowsEncodedAnswer(output, MANAGED_DATA_ROOT_PATH_MARKER)
  const helper = readOrcadWindowsEncodedAnswer(output, MANAGED_DATA_ROOT_HELPER_MARKER)
  const supports = readOrcadWindowsEncodedAnswer(output, MANAGED_DATA_ROOT_TARGET_MARKER)
  if (raw === null || helper === null || !['0', '1'].includes(supports ?? ''))
    throw Error('The host did not identify its default data directory')
  const result = JSON.parse(raw) as Probe
  result.userDataDir = normalizeRemoteHome(result.userDataDir, target.host)
  const previous = joinRemotePath(
    target.host,
    remoteDirname(current, target.host),
    remoteBasename(current, target.host).replace('.zkyq', '.orca')
  )
  if (
    ![current, previous].includes(result.userDataDir) ||
    !['current', 'previous', 'empty'].includes(result.state)
  )
    throw Error('The host returned an unexpected default data directory')
  if (
    helper &&
    (remoteDirname(helper, target.host) !== orcadRemoteBaseDir(target.host, target.remoteHome) ||
      !remoteInstallVersionDirRegex(ORCAD_INSTALL_MODEL).test(remoteBasename(helper, target.host)))
  )
    throw Error('The host returned an unexpected data directory helper')
  return { ...result, helper: helper || null, targetSupports: supports === '1' }
}

/** Called after confirmed stop and before capture, and again before every slot launch. */
export async function prepareManagedDataRoot(
  target: Target,
  current: string,
  preferred: string,
  mode: 'prepare' | 'launch'
): Promise<ManagedDataRootResult> {
  const probe = await discoverManagedDataRoot(target, current, preferred)
  if (!probe.helper) {
    if (mode === 'prepare' || probe.targetSupports || probe.state === 'current')
      throw Error(
        'Install the current Control Everything component before migrating this data directory'
      )
    const previous = joinRemotePath(
      target.host,
      remoteDirname(current, target.host),
      remoteBasename(current, target.host).replace('.zkyq', '.orca')
    )
    return { version: 1, userDataDir: previous, launchUserDataDir: previous }
  }
  const action = mode === 'prepare' || probe.targetSupports ? 'prepare' : 'previous-build'
  let command: string
  if (isWindowsRemoteHost(target.host)) {
    const answer = await execOrcadRemote(
      target,
      orcadWindowsSlotOpCommand(target.host, probe.helper, 'slot-runtime', [probe.helper])
    )
    command = orcadWindowsNodeCommandLine(readWindowsOrcadSlotRuntime(answer), [
      readWindowsOrcadSlotEntry(answer, target.host, probe.helper),
      MANAGED_DATA_ROOT_FLAG,
      action,
      current
    ])
  } else {
    command = `${orcadNodeSlotRuntimeCommand(target.host, probe.helper)}${selectOrcadSlotEntryCommand(target.host, probe.helper)}; "$orcad_runtime" "$orcad_entry" ${MANAGED_DATA_ROOT_FLAG} ${action} ${quotePosixShell(current)}`
  }
  const raw = readOrcadWindowsEncodedAnswer(
    await execOrcadRemote(target, command),
    MANAGED_DATA_ROOT_RESULT_MARKER
  )
  if (raw === null) throw Error('The host returned no data directory operation result')
  const result = JSON.parse(raw) as ManagedDataRootResult
  result.userDataDir = normalizeRemoteHome(result.userDataDir, target.host)
  result.launchUserDataDir = normalizeRemoteHome(result.launchUserDataDir, target.host)
  const previous = joinRemotePath(
    target.host,
    remoteDirname(current, target.host),
    remoteBasename(current, target.host).replace('.zkyq', '.orca')
  )
  if (
    result.version !== 1 ||
    result.userDataDir !== current ||
    result.launchUserDataDir !== (action === 'previous-build' ? previous : current)
  )
    throw Error('The data directory operation returned unexpected paths')
  return result
}
