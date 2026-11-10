import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'prepare-codex'],
    summary: "Prepare a WSL pane's Control Everything-managed Codex home before a shell launch",
    usage: 'zkyq agent hooks prepare-codex',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Control Everything-managed agent status hooks are enabled',
    usage: 'zkyq agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['zkyq agent hooks status', 'zkyq agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Control Everything-managed agent status hooks and remove local hook entries',
    usage: 'zkyq agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['zkyq agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Control Everything-managed agent status hooks',
    usage: 'zkyq agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['zkyq agent hooks on']
  }
]
