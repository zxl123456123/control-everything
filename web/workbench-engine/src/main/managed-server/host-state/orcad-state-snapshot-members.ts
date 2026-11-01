/** What the pre-activation snapshot holds; shared by the POSIX commands and the Windows host script. */

/**
 * Root-relative paths a rollback needs restored. Everything else under the data root is
 * either regenerable, or owned by a process that survives the rollback.
 */
export const ORCAD_SNAPSHOT_MEMBERS = [
  'orca-profile-index.json',
  'orca-profile-index.json.bak',
  'zkyq-profile-index.json',
  'zkyq-profile-index.json.bak',
  // Pre-profiles layout; still read as a migration source.
  'orca-data.json',
  'zkyq-data.json',
  'orca-data.json.bak.0',
  'orca-data.json.bak.1',
  'orca-data.json.bak.2',
  'orca-data.json.bak.3',
  'orca-data.json.bak.4',
  'zkyq-data.json.bak.0',
  'zkyq-data.json.bak.1',
  'zkyq-data.json.bak.2',
  'zkyq-data.json.bak.3',
  'zkyq-data.json.bak.4',
  'profiles',
  // Cross-profile SQLite moves must survive an orcad rollback too.
  'profile-move-intents'
] as const

/** Never captured and never restored — see `orcad-state-snapshot.ts`. */
export const ORCAD_SNAPSHOT_EXCLUDED = ['daemon', 'logs'] as const

/** POSIX list of fixed members and valid retained JSON exports in one or more roots. */
export function posixSnapshotMembersFunction(): string {
  for (const member of ORCAD_SNAPSHOT_MEMBERS) {
    if (!/^[A-Za-z0-9._-]+$/.test(member)) throw new Error('Unsafe snapshot member name')
  }
  // Send a shared suffix once when both data-name families include it.
  const paired = ORCAD_SNAPSHOT_MEMBERS.filter((name) => name.startsWith('orca-'))
    .map((name) => name.slice(5))
    .filter((suffix) => ORCAD_SNAPSHOT_MEMBERS.some((name) => name === `zkyq-${suffix}`))
  const remaining = ORCAD_SNAPSHOT_MEMBERS.filter(
    (name) => !paired.some((suffix) => name === `orca-${suffix}` || name === `zkyq-${suffix}`)
  )
  return [
    'snapshot_members() {',
    paired.length ? `for p in orca zkyq; do printf "$p-%s " ${paired.join(' ')}; done;` : '',
    remaining.length ? `printf "%s " ${remaining.join(' ')};` : '',
    // Callers use command substitutions, so these short variables stay in their subshell.
    'for r in "$@"; do',
    'for f in "$r"/orca-data.json.sqlite-export.*.json "$r"/zkyq-data.json.sqlite-export.*.json; do',
    '[ -e "$f" ] || [ -L "$f" ] || continue;',
    'n=${f##*/}; v=${n#*.sqlite-export.}; v=${v%.json};',
    'case "$v" in (""|*[!0-9]*) continue;; esac;',
    'v=${v#"${v%%[!0]*}"};',
    '[ -n "$v" ] || continue;',
    '[ ${#v} -lt 16 ] || { [ ${#v} -eq 16 ] && [ "$v" -le 9007199254740991 ]; } || continue;',
    'printf "%s " "$n"; done; done; };'
  ].join(' ')
}

export const ORCAD_STATE_RESTORE_STAGE_DIRNAME = '.orcad-state-restore-stage'

/** Under `~/.orca-remote`: held by one snapshot capture, restore or clear at a time. */
export const ORCAD_STATE_MUTATION_LOCK_DIRNAME = 'orcad-state-mutation.lock'

/**
 * How often a running mutation refreshes the activation fence's mtime. Why: the fence goes
 * stale by age (INSTALL_LOCK_STALE_MS), and a mutation may outlast that, so a live run keeps
 * it fresh while a dead one stops within a beat.
 */
export const ORCAD_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS = 60
/** How long a lock an exited desktop process left must sit untouched before it is reclaimed. */
export const ORCAD_EXITED_OWN_LOCK_QUIET_SECONDS = 3 * ORCAD_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS

/** A state mutation found another still running, so it did nothing. */
export const ORCAD_STATE_MUTATION_BUSY = 'STATE_MUTATION_BUSY'
/** The host-side deadline killed a state mutation part way through. */
export const ORCAD_STATE_MUTATION_DEADLINE = 'STATE_MUTATION_DEADLINE'

/** Windows keeps the snapshot as a directory copy, where POSIX keeps `state.tar`. */
export const ORCAD_WINDOWS_SNAPSHOT_STATE_DIRNAME = 'state'

/** Prefixes the line a failed POSIX capture prints, ahead of `FAILED`, saying why. */
export const ORCAD_SNAPSHOT_FAILURE = 'SNAPSHOT_FAILURE'
