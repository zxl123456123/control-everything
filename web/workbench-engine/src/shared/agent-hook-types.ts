// Why: shared agent-hook IPC payload shapes and the managed-script protocol
// version constant. Consumed by both the main-process hook server (src/main/
// agent-hooks/server.ts) and each per-agent hook service. Lives in `shared/`
// to keep a single source of truth for the version string and status contract.

export const AGENT_HOOK_TARGETS = [
  'claude',
  'openclaude',
  'codex',
  'qoder',
  'qoder-cn',
  'qwen-code',
  'codebuddy',
  'gemini',
  'antigravity',
  'amp',
  'cursor',
  'droid',
  'command-code',
  'grok',
  'copilot',
  'hermes',
  'devin',
  'kimi',
  'muse',
  'zcode',
  'dsh',
  'jcode',
  'kiro'
] as const
export type AgentHookTarget = (typeof AGENT_HOOK_TARGETS)[number]

export type AgentHookInstallState = 'installed' | 'not_installed' | 'partial' | 'error' | 'skipped'

export type AgentHookInstallSkipReason =
  | 'agent_disabled'
  | 'cli_not_found'
  | 'cli_presence_unknown'
  | 'hooks_disabled'

export type AgentHookInstallStatus = {
  agent: AgentHookTarget
  state: AgentHookInstallState
  configPath: string
  managedHooksPresent: boolean
  detail: string | null
  skipReason?: AgentHookInstallSkipReason
}

// v2 publishes ZKYQ endpoint keys and X-Zkyq headers. Frozen v1 clients keep
// their existing endpoint until their session ends; both versions use the same payload.
export const ZKYQ_HOOK_PROTOCOL_VERSION = '2' as const

// Why: absence means the listener predates raw-JSON metadata headers, so managed scripts must keep using form posts.
export const ZKYQ_HOOK_RAW_JSON_TRANSPORT = 'raw-json-v1' as const
