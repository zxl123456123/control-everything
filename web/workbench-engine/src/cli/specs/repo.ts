import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const REPO_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'migrate-config'],
    destructive: true,
    summary: 'Rename the project configuration to zkyq.yaml',
    usage: 'zkyq repo migrate-config --path <absolute-project-root> [--dry-run] [--json]',
    allowedFlags: ['help', 'json', 'path', 'dry-run'],
    notes: [
      'Runs locally on the named Git worktree. Tracked files are staged; untracked files remain untracked.',
      'Requires a regular orca.yaml and refuses an existing zkyq.yaml. Use --dry-run to check first.',
      'If the old file is ignored, update ignore rules for the new name before migrating.',
      'Run when no other process is editing the worktree or its Git index.'
    ]
  },
  {
    path: ['repo', 'list'],
    summary: 'List repos registered in Control Everything',
    usage: 'zkyq repo list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['repo', 'add'],
    summary: 'Add a project to Control Everything by filesystem path',
    usage: 'zkyq repo add --path <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path']
  },
  {
    path: ['repo', 'show'],
    summary: 'Show one registered repo',
    usage: 'zkyq repo show --repo <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo']
  },
  {
    path: ['repo', 'set'],
    summary: 'Set whether non-Control Everything worktrees are shown for a repo',
    usage:
      'zkyq repo set --repo <selector> --external-worktree-visibility show|hide|inherit [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'external-worktree-visibility'],
    notes: [
      'show and hide override the global non-Control Everything worktree visibility default for this repo; inherit clears the override.',
      'Per-worktree visibility rules still apply.'
    ],
    examples: ['zkyq repo set --repo path:/path/to/repo --external-worktree-visibility show --json']
  },
  {
    path: ['repo', 'set-base-ref'],
    summary: "Set the repo's default base ref for future worktrees",
    usage: 'zkyq repo set-base-ref --repo <selector> --ref <ref> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'ref']
  },
  {
    path: ['repo', 'search-refs'],
    summary: 'Search branch/tag refs within a repo',
    usage: 'zkyq repo search-refs --repo <selector> --query <text> [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'query', 'limit']
  }
]
