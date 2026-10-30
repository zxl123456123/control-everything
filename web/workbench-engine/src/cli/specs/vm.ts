import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const VM_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['vm', 'recipe', 'migrate-env'],
    destructive: true,
    summary: 'Migrate unambiguous legacy environment reads in one local script',
    usage: 'zkyq vm recipe migrate-env --path <absolute-script-path> [--dry-run] [--json]',
    allowedFlags: ['help', 'json', 'path', 'dry-run'],
    notes: [
      'Run --dry-run first and review the indicated lines. The command never prints script contents.',
      'Supports UTF-8 simple .sh, .bash and .zsh scripts and .ps1 scripts; PowerShell is required to inspect .ps1.',
      'Ambiguous syntax and indirect or dynamically constructed variable names require manual review.',
      'Review indirectly called scripts separately.',
      'Run when no other process is editing the script. A failed write may require manual inspection.'
    ]
  },
  {
    path: ['vm', 'recipe', 'doctor'],
    summary: 'Validate a per-workspace environment recipe without provisioning by default',
    usage:
      'orca vm recipe doctor <recipe-id> [--repo-path <path>] [--provision|--connect] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'recipe-id', 'repo-path', 'provision', 'connect'],
    positionalArgs: ['recipe-id'],
    notes: [
      'Reads environmentRecipes from zkyq.yaml in the repo path, validates the selected recipe, and reports agent-friendly checks.',
      'This default mode is non-destructive and does not run the recipe command.',
      'Use --provision or --connect to run the recipe, validate its result, and run cleanup when configured.'
    ],
    examples: [
      'orca vm recipe doctor cloud-sandbox',
      'orca vm recipe doctor cloud-sandbox --repo-path /path/to/repo --json',
      'orca vm recipe doctor cloud-sandbox --provision --json'
    ]
  }
]
