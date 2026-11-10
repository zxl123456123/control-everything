import {
  buildPosixHookEndpointRefresh,
  buildPosixHookEnvironmentIdentityMigration,
  buildWindowsHookEndpointRefresh,
  buildWindowsHookEnvironmentIdentityMigration
} from '../agent-hooks/hook-environment-identity-prelude'
import { buildPosixAgentHookPostCommand } from '../agent-hooks/hook-post-command'
import {
  buildPosixHookPayloadCapture,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'
import { buildWindowsAgentHookCurlPostCommand } from '../agent-hooks/installer-utils'

export function getManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      ...buildWindowsHookEnvironmentIdentityMigration(),
      // Why: the endpoint file holds this install's live port/token; sourcing it lets a surviving PTY reach the current server (see claude/hook-service.ts).
      ...buildWindowsHookEndpointRefresh(),
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAgentHookCurlPostCommand('codex'),
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookEnvironmentIdentityMigration(),
    ...buildPosixHookPayloadCapture(),
    ...buildPosixHookSpoolLines('codex'),
    // Why: sourcing refreshes PORT/TOKEN/ENV/VERSION from the current Orca so a surviving PTY keeps reporting after a restart (see claude/hook-service.ts).
    ...buildPosixHookEndpointRefresh(),
    'if [ -z "$ZKYQ_AGENT_HOOK_PORT" ] || [ -z "$ZKYQ_AGENT_HOOK_TOKEN" ] || [ -z "$ZKYQ_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    'post_codex_hook() {',
    '  curl_bin="$1"',
    '  connect_timeout="${2:-0.5}"',
    '  max_time="${3:-1.5}"',
    // Why: keep full hook JSON off the command line and avoid URL-encoding paths/commands into IDS-friendly traversal signatures.
    ...buildPosixAgentHookPostCommand('codex', {
      curlCommand: '"$curl_bin"',
      indent: '    '
    }).map((line) => `  ${line}`),
    '}',
    'is_wsl_runtime() {',
    '  [ -n "$WSL_DISTRO_NAME" ] && return 0',
    '  grep -qiE "microsoft|wsl" /proc/sys/kernel/osrelease /proc/version 2>/dev/null',
    '}',
    'if post_codex_hook curl >/dev/null 2>&1; then',
    '  exit 0',
    'fi',
    'if is_wsl_runtime; then',
    '  windows_curl=$(command -v curl.exe 2>/dev/null || true)',
    '  if [ -n "$windows_curl" ] && [ -x "$windows_curl" ]; then',
    '    if post_codex_hook "$windows_curl" 3 5 >/dev/null 2>&1; then',
    '      exit 0',
    '    fi',
    '    # post_codex_hook "$windows_curl" 3 5 >/dev/null 2>&1 || true',
    '  fi',
    'fi',
    'spool_hook_event',
    'exit 0',
    ''
  ].join('\n')
}
