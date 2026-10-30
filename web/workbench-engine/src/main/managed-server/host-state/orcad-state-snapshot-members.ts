/** What the pre-activation snapshot holds; shared by the POSIX commands and the Windows host script. */

/**
 * Root-relative paths a rollback needs restored. Everything else under the data root is
 * either regenerable, or owned by a process that survives the rollback.
 */
export const ORCAD_SNAPSHOT_MEMBERS = [
  'orca-profile-index.json',
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
  return [
    'snapshot_members() {',
    `printf '%s' '${ORCAD_SNAPSHOT_MEMBERS.join(' ')}';`,
    'for snapshot_root in "$@"; do',
    'for snapshot_file in "$snapshot_root"/orca-data.json.sqlite-export.*.json "$snapshot_root"/zkyq-data.json.sqlite-export.*.json; do',
    '[ -e "$snapshot_file" ] || [ -L "$snapshot_file" ] || continue;',
    'snapshot_name=${snapshot_file##*/}; snapshot_revision=${snapshot_name#*.sqlite-export.}; snapshot_revision=${snapshot_revision%.json};',
    'case "$snapshot_revision" in (\'\'|*[!0-9]*) continue;; esac;',
    'snapshot_number=$(printf %s "$snapshot_revision" | sed \'s/^0*//\');',
    '[ -n "$snapshot_number" ] || continue;',
    '[ ${#snapshot_number} -lt 16 ] || { [ ${#snapshot_number} -eq 16 ] && [ "$snapshot_number" -le 9007199254740991 ]; } || continue;',
    'printf " %s" "$snapshot_name"; done; done; };'
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
