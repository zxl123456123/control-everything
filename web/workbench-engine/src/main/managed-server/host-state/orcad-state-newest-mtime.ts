/** When the shared profile state was last written, which tells a rollback whether to restore. */
import { quotePosixShell } from '../../../shared/shell-argument-quoting'
import { isWindowsRemoteHost, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { orcadWindowsHostOpCommand } from '../install/orcad-remote-windows-node'
import { posixSnapshotMembersFunction } from './orcad-state-snapshot-members'

/**
 * Has the shared store been written since `activatedAt`?
 *
 * Prints the newest mtime (epoch seconds) across the snapshot members, or `UNKNOWN`. The
 * caller compares; an `UNKNOWN` becomes `null`, which `assessOrcadRollback` treats as "yes,
 * assume writes".
 */
export function newestStateMtimeCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  baseDir: string
): string {
  if (isWindowsRemoteHost(host)) {
    return orcadWindowsHostOpCommand(host, baseDir, 'state-newest-mtime', [userDataDir])
  }
  return [
    `root=${quotePosixShell(userDataDir)};`,
    posixSnapshotMembersFunction(),
    'set --; for m in $(snapshot_members "$root"); do [ -e "$root/$m" ] && set -- "$@" "$root/$m"; done;',
    '[ $# -gt 0 ] || { echo UNKNOWN; exit 0; };',
    'newest=$(find "$@" -type f -exec stat -c %Y {} + 2>/dev/null ||',
    'find "$@" -type f -exec stat -f %m {} + 2>/dev/null);',
    'if [ -z "$newest" ]; then echo UNKNOWN; else',
    `echo "$newest" | sort -n | tail -1; fi`
  ].join(' ')
}

export function parseNewestStateMtimeSeconds(output: string): number | null {
  const value = output.trim().split('\n').pop()?.trim()
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  return Number.parseInt(value, 10)
}
