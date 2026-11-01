import { randomUUID } from 'node:crypto'
import { quotePosixShell as sh } from '../../../shared/shell-argument-quoting'
import { quotePowerShellLiteral as ps } from '../../../shared/powershell-native-argument'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import { powerShellCommand } from '../../ssh/ssh-remote-powershell'
import {
  RELAY_REMOTE_DIR,
  RETIRED_RELAY_REMOTE_DIR
} from '../../ssh/remote-exec/remote-frame-protocol'
import {
  REMOTE_ROOT_IDENTITY_LOCK,
  REMOTE_ROOT_IDENTITY_OWNER,
  REMOTE_ROOT_IDENTITY_RECORD
} from './remote-root-identity-host'

export type RemoteRootProbe = {
  old: 'absent' | 'dir' | 'link' | 'other'
  current: 'absent' | 'dir' | 'link' | 'other'
  oldTarget: string
  currentTarget: string
  slot: string
  owner: string
  record: string
}

export function remoteRootProbeCommand(host: RemoteHostPlatform, home: string): string {
  const old = joinRemotePath(host, home, RETIRED_RELAY_REMOTE_DIR)
  const current = joinRemotePath(host, home, RELAY_REMOTE_DIR)
  if (!isWindowsRemoteHost(host))
    return [
      `identity_old=${sh(old)}; identity_current=${sh(current)};`,
      `identity_kind() { if [ -L "$1" ]; then printf link; elif [ -d "$1" ]; then printf dir; elif [ -e "$1" ]; then printf other; else printf absent; fi; };`,
      `identity_emit() { printf '%s=' "$1"; printf '%s' "$2" | base64 | tr -d '\\r\\n'; printf '\\n'; };`,
      `printf 'ZKYQ_ROOT_PROBE_V1\\n'; identity_emit old "$(identity_kind "$identity_old")"; identity_emit current "$(identity_kind "$identity_current")";`,
      `identity_target=''; if [ -L "$identity_old" ]; then identity_target=$(readlink "$identity_old") || exit 65; fi; identity_emit oldTarget "$identity_target";`,
      `identity_target=''; if [ -L "$identity_current" ]; then identity_target=$(readlink "$identity_current") || exit 65; fi; identity_emit currentTarget "$identity_target";`,
      `identity_base="$identity_old"; [ -d "$identity_old" ] && [ ! -L "$identity_old" ] || identity_base="$identity_current";`,
      `identity_slot=''; for d in "$identity_base"/relay-* "$identity_base"/orcad-*; do [ -d "$d" ] && [ ! -L "$d" ] && [ -f "$d/.version" ] && [ ! -L "$d/.version" ] || continue; identity_version=$(cat "$d/.version") || exit 65; identity_name=\${d##*/}; [ "\${identity_name#*-}" = "$identity_version" ] || continue; identity_slot="$identity_name"; break; done; identity_emit slot "$identity_slot";`,
      `identity_owner=''; for f in "$identity_base/orcad-machine.json" "$identity_base/orcad-active.json"; do [ -f "$f" ] && [ ! -L "$f" ] || continue; identity_owner=$(head -c 65537 "$f") || exit 65; break; done; identity_emit owner "$identity_owner";`,
      `identity_record=''; if [ -e "$identity_base/${REMOTE_ROOT_IDENTITY_RECORD}" ] || [ -L "$identity_base/${REMOTE_ROOT_IDENTITY_RECORD}" ]; then if [ -f "$identity_base/${REMOTE_ROOT_IDENTITY_RECORD}" ] && [ ! -L "$identity_base/${REMOTE_ROOT_IDENTITY_RECORD}" ]; then identity_record=$(head -c 65537 "$identity_base/${REMOTE_ROOT_IDENTITY_RECORD}") || exit 65; [ -n "$identity_record" ] || identity_record='!empty'; else identity_record='!unsafe'; fi; fi; identity_emit record "$identity_record";`
    ].join(' ')
  return powerShellCommand(
    [
      "$ErrorActionPreference = 'Stop'",
      `function IdentityItem($p) { Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }`,
      `function IdentityKind($p) { $i=IdentityItem $p; if ($null -eq $i) { 'absent' } elseif (($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { 'link' } elseif ($i.PSIsContainer) { 'dir' } else { 'other' } }`,
      `function IdentityEmit($n,$v) { [Console]::WriteLine($n+'='+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$v))) }`,
      `function IdentityFile($p) { $i=IdentityItem $p; return ($null -ne $i -and -not $i.PSIsContainer -and ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) }`,
      `$old=${ps(old)}; $current=${ps(current)}`,
      `[Console]::WriteLine('ZKYQ_ROOT_PROBE_V1'); IdentityEmit 'old' (IdentityKind $old); IdentityEmit 'current' (IdentityKind $current)`,
      `$v=''; if ((IdentityKind $old) -eq 'link') { $v=[string](IdentityItem $old).Target[0] }; IdentityEmit 'oldTarget' $v`,
      `$v=''; if ((IdentityKind $current) -eq 'link') { $v=[string](IdentityItem $current).Target[0] }; IdentityEmit 'currentTarget' $v`,
      `$base=$current; if ((IdentityKind $old) -eq 'dir') { $base=$old }`,
      `$slot=''; if (Test-Path -LiteralPath $base -PathType Container) { foreach ($d in Get-ChildItem -LiteralPath $base -Directory -Force) { if (($d.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $d.Name -notmatch '^(relay|orcad)-') { continue }; $f=Join-Path $d.FullName '.version'; if ((IdentityFile $f) -and [IO.File]::ReadAllText($f).Trim() -eq ($d.Name -replace '^[^-]+-','')) { $slot=$d.Name; break } } }; IdentityEmit 'slot' $slot`,
      `$v=''; foreach ($name in @('orcad-machine.json','orcad-active.json')) { $f=Join-Path $base $name; if (IdentityFile $f) { if ((Get-Item -LiteralPath $f).Length -gt 65536) { throw 'Remote ownership record is oversized' }; $v=[IO.File]::ReadAllText($f); break } }; IdentityEmit 'owner' $v`,
      `$v=''; $f=Join-Path $base ${ps(REMOTE_ROOT_IDENTITY_RECORD)}; if ($null -ne (IdentityItem $f)) { if (IdentityFile $f) { if ((Get-Item -LiteralPath $f).Length -gt 65536) { throw 'Remote root record is oversized' }; $v=[IO.File]::ReadAllText($f); if ($v -eq '') { $v='!empty' } } else { $v='!unsafe' } }; IdentityEmit 'record' $v`
    ].join('; ')
  )
}

export function parseRemoteRootProbe(output: string): RemoteRootProbe {
  const rows = output.trim().split(/\r?\n/)
  if (rows.shift() !== 'ZKYQ_ROOT_PROBE_V1' || rows.length !== 7)
    throw new Error('Remote root probe returned no verifiable answer')
  const result: Record<string, string> = {}
  for (const line of rows) {
    const match =
      /^(old|current|oldTarget|currentTarget|slot|owner|record)=([A-Za-z0-9+/]*={0,2})$/.exec(line)
    if (!match || result[match[1]] !== undefined) throw new Error('Remote root probe is malformed')
    result[match[1]] = Buffer.from(match[2], 'base64').toString('utf8')
  }
  for (const key of ['old', 'current'])
    if (!['absent', 'dir', 'link', 'other'].includes(result[key]))
      throw new Error('Remote root type is unverifiable')
  return {
    old: result.old as RemoteRootProbe['old'],
    current: result.current as RemoteRootProbe['current'],
    oldTarget: result.oldTarget,
    currentTarget: result.currentTarget,
    slot: result.slot,
    owner: result.owner,
    record: result.record
  }
}

export function deferredRemoteRootCommand(
  host: RemoteHostPlatform,
  home: string,
  token: string
): string {
  const old = joinRemotePath(host, home, RETIRED_RELAY_REMOTE_DIR)
  const current = joinRemotePath(host, home, RELAY_REMOTE_DIR)
  const owner = joinRemotePath(host, home, REMOTE_ROOT_IDENTITY_LOCK, REMOTE_ROOT_IDENTITY_OWNER)
  return `[ "$(cat ${sh(owner)})" = ${sh(token)} ] && [ -d ${sh(old)} ] && [ ! -L ${sh(old)} ] && { if [ ! -e ${sh(current)} ] && [ ! -L ${sh(current)} ]; then ln -s ${sh(old)} ${sh(current)}; else [ -L ${sh(current)} ] && [ "$(readlink ${sh(current)})" = ${sh(old)} ]; fi; } && echo DEFERRED`
}

/** Directory.Move never copies across filesystems and never nests into an existing target. */
export function windowsRemoteRootMoveCommand(
  host: RemoteHostPlatform,
  home: string,
  token: string
): string {
  const old = joinRemotePath(host, home, RETIRED_RELAY_REMOTE_DIR)
  const current = joinRemotePath(host, home, RELAY_REMOTE_DIR)
  const owner = joinRemotePath(host, home, REMOTE_ROOT_IDENTITY_LOCK, REMOTE_ROOT_IDENTITY_OWNER)
  return powerShellCommand(
    [
      "$ErrorActionPreference='Stop'",
      `$identityHome=[IO.Path]::GetFullPath(${ps(home)}); $old=[IO.Path]::GetFullPath(${ps(old)}); $current=[IO.Path]::GetFullPath(${ps(current)})`,
      `if ([IO.Path]::GetDirectoryName($old) -ne $identityHome -or [IO.Path]::GetDirectoryName($current) -ne $identityHome) { throw 'Remote root move escaped the selected home' }`,
      `function IdentityJunction($name,$target) { Push-Location -LiteralPath $identityHome -ErrorAction Stop; try { $null=New-Item -ItemType Junction -Path '.' -Name $name -Value $target -ErrorAction Stop } finally { Pop-Location }; $created=Get-Item -LiteralPath (Join-Path $identityHome $name) -Force -ErrorAction Stop; if (($created.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -or [IO.Path]::GetFullPath([string]$created.Target[0]) -ne (Join-Path $identityHome $target)) { throw 'Remote root junction was not published at the selected path' } }`,
      `if ([IO.File]::ReadAllText(${ps(owner)}) -ne ${ps(token)}) { throw 'Remote root identity lock ownership changed' }`,
      `$prior=Get-Item -LiteralPath $old -Force -ErrorAction Stop; if (-not $prior.PSIsContainer -or ($prior.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Retired remote root is not a real directory' }`,
      `$present=Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue; if ($null -ne $present) { if (($present.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -or [IO.Path]::GetFullPath([string]$present.Target[0]) -ne $old) { throw 'Both current and retired remote directories exist' }; [IO.Directory]::Delete($current,$false) }`,
      `$record=Join-Path $old ${ps(REMOTE_ROOT_IDENTITY_RECORD)}; if (Test-Path -LiteralPath $record) { [IO.File]::Move($record,(Join-Path $old ${ps(`.zkyq-root-identity-previous-${randomUUID()}.json`)})) }`,
      `try { [IO.Directory]::Move($old,$current) } catch { if ([IO.Directory]::Exists($old) -and -not (Test-Path -LiteralPath $current)) { IdentityJunction ${ps(RELAY_REMOTE_DIR)} ${ps(RETIRED_RELAY_REMOTE_DIR)}; 'DEFERRED'; return }; throw }`,
      `try { IdentityJunction ${ps(RETIRED_RELAY_REMOTE_DIR)} ${ps(RELAY_REMOTE_DIR)} } catch { if (-not (Test-Path -LiteralPath $old)) { [IO.Directory]::Move($current,$old) }; throw }`,
      `'MOVED'`
    ].join('; ')
  )
}

export function releaseRemoteRootLockCommand(
  host: RemoteHostPlatform,
  home: string,
  token: string
): string {
  const lock = joinRemotePath(host, home, REMOTE_ROOT_IDENTITY_LOCK)
  const owner = joinRemotePath(host, lock, REMOTE_ROOT_IDENTITY_OWNER)
  if (!isWindowsRemoteHost(host))
    return `[ ! -L ${sh(lock)} ] && [ "$(cat ${sh(owner)} 2>/dev/null)" = ${sh(token)} ] && rm -rf ${sh(lock)} || true`
  return powerShellCommand(
    `$lock=${ps(lock)}; $i=Get-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue; if ($null -ne $i -and $i.PSIsContainer -and ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and [IO.File]::ReadAllText(${ps(owner)}) -eq ${ps(token)}) { Remove-Item -LiteralPath $lock -Recurse -Force -ErrorAction Stop }`
  )
}
