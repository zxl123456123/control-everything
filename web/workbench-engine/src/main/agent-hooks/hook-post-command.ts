import type { AgentHookSource } from '../../shared/agent-hook-relay'
import { ZKYQ_HOOK_RAW_JSON_TRANSPORT } from '../../shared/agent-hook-types'

export function buildPosixAgentHookPostCommand(
  source: AgentHookSource,
  options: { curlCommand?: string; indent?: string } = {}
): string[] {
  const curlCommand = options.curlCommand ?? 'curl'
  const indent = options.indent ?? '  '
  return [
    'zkyq_hook_namespace=Zkyq',
    'if [ "${ZKYQ_AGENT_HOOK_VERSION:-}" = 1 ]; then zkyq_hook_namespace=Orca; fi',
    `if [ "\${ZKYQ_AGENT_HOOK_TRANSPORT:-}" = "${ZKYQ_HOOK_RAW_JSON_TRANSPORT}" ] && command -v base64 >/dev/null 2>&1 && command -v tr >/dev/null 2>&1; then`,
    `  orca_hook_metadata=$(printf '%s\\037%s\\037%s\\037%s\\037%s\\037%s' "$ZKYQ_PANE_KEY" "$ZKYQ_TAB_ID" "$ZKYQ_AGENT_LAUNCH_TOKEN" "$ZKYQ_WORKTREE_ID" "$ZKYQ_AGENT_HOOK_ENV" "$ZKYQ_AGENT_HOOK_VERSION" | base64 | tr -d '\\n') && \\`,
    `  [ -n "$orca_hook_metadata" ] && \\`,
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST "http://127.0.0.1:\${ZKYQ_AGENT_HOOK_PORT}/hook/${source}" \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/json" \\`,
    `  ${indent}-H "X-\${zkyq_hook_namespace}-Agent-Hook-Token: \${ZKYQ_AGENT_HOOK_TOKEN}" \\`,
    `  ${indent}-H "X-\${zkyq_hook_namespace}-Agent-Hook-Meta-Encoding: base64" \\`,
    `  ${indent}-H "X-\${zkyq_hook_namespace}-Agent-Hook-Meta: \${orca_hook_metadata}" \\`,
    `  ${indent}-H "X-\${zkyq_hook_namespace}-Agent-Process: \${orca_agent_process:-}" \\`,
    `  ${indent}--data-binary @-`,
    'else',
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST "http://127.0.0.1:\${ZKYQ_AGENT_HOOK_PORT}/hook/${source}" \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/x-www-form-urlencoded" \\`,
    `  ${indent}-H "X-\${zkyq_hook_namespace}-Agent-Hook-Token: \${ZKYQ_AGENT_HOOK_TOKEN}" \\`,
    `  ${indent}--data-urlencode "paneKey=\${ZKYQ_PANE_KEY}" \\`,
    `  ${indent}--data-urlencode "tabId=\${ZKYQ_TAB_ID}" \\`,
    `  ${indent}--data-urlencode "launchToken=\${ZKYQ_AGENT_LAUNCH_TOKEN}" \\`,
    `  ${indent}--data-urlencode "worktreeId=\${ZKYQ_WORKTREE_ID}" \\`,
    `  ${indent}--data-urlencode "env=\${ZKYQ_AGENT_HOOK_ENV}" \\`,
    `  ${indent}--data-urlencode "version=\${ZKYQ_AGENT_HOOK_VERSION}" \\`,
    `  ${indent}--data-urlencode "agentProcess=\${orca_agent_process:-}" \\`,
    `  ${indent}--data-urlencode "payload@-"`,
    'fi'
  ]
}
