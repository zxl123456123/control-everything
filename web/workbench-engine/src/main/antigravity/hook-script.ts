import {
  buildPosixHookEndpointRefresh,
  buildPosixHookEnvironmentIdentityMigration,
  buildWindowsHookEndpointRefresh,
  buildWindowsHookEnvironmentIdentityMigration
} from '../agent-hooks/hook-environment-identity-prelude'
import {
  buildPosixHookPayloadCapture,
  POSIX_HOOK_JSON_STDIN,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines
} from '../agent-hooks/hook-stdin-contract'
import { ANTIGRAVITY_PRE_TOOL_USE_DECISION } from './hook-events'

export function getManagedScript(
  target: 'local' | 'posix' = 'local',
  windowsRuntimePath = process.execPath
): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      // Why (#9358/#9941): inherited delayed expansion eats `!` out of the percent-expanded
      // curl args, mangling paneKey and dropping worktreeId. `!` is legal in a Windows path.
      'setlocal DisableDelayedExpansion',
      ...buildWindowsHookEnvironmentIdentityMigration(),
      'if /I "%ZKYQ_ANTIGRAVITY_EVENT%"=="Stop" (',
      '  echo {"decision":""}',
      ') else if /I "%ZKYQ_ANTIGRAVITY_EVENT%"=="PreToolUse" (',
      `  echo ${ANTIGRAVITY_PRE_TOOL_USE_DECISION}`,
      ') else (',
      '  echo {}',
      ')',
      ...buildWindowsHookEndpointRefresh(),
      ...buildWindowsHookEnvironmentGuardLines(),
      // The runtime path is fixed at installation; hook payloads stay on stdin.
      'set "ELECTRON_RUN_AS_NODE=1"',
      `if not defined ZKYQ_AGENT_HOOK_NODE set "ZKYQ_AGENT_HOOK_NODE=${windowsRuntimePath.replaceAll('%', '%%')}"`,
      '"%ZKYQ_AGENT_HOOK_NODE%" "%~dp0antigravity-hook-post.cjs" >nul 2>nul',
      'exit /b 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookEnvironmentIdentityMigration(),
    'case "$ZKYQ_ANTIGRAVITY_EVENT" in',
    '  Stop)',
    '    printf \'{"decision":""}\\n\'',
    '    ;;',
    '  PreToolUse)',
    `    printf '${ANTIGRAVITY_PRE_TOOL_USE_DECISION}\\n'`,
    '    ;;',
    '  *)',
    // Why: Antigravity accepts an empty JSON object for passive status hooks;
    // only the PreToolUse gate rejects it, and that branch answers above.
    '    printf "{}\\n"',
    '    ;;',
    'esac',
    // Why: some Antigravity events arrive without stdin but still need a
    // status post, so the shared capture maps empty input to an object.
    ...buildPosixHookPayloadCapture('empty-object', POSIX_HOOK_JSON_STDIN),
    ...buildPosixHookSpoolLines('antigravity', 'ZKYQ_ANTIGRAVITY_EVENT'),
    ...buildPosixHookEndpointRefresh(),
    'if [ -z "$ZKYQ_AGENT_HOOK_PORT" ] || [ -z "$ZKYQ_AGENT_HOOK_TOKEN" ] || [ -z "$ZKYQ_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    // Timeout caps best-effort hook posts if the local listener stalls.
    // Why: pipe payload to curl's stdin (`payload@-`) instead of an inline
    // `payload=$VALUE` arg, so tens-of-KB tool output stays off the curl
    // command line (EDR command-line false positives). Wire body is identical.
    'printf \'%s\' "$payload" | curl -sS -X POST "http://127.0.0.1:${ZKYQ_AGENT_HOOK_PORT}/hook/antigravity" \\',
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-${zkyq_hook_namespace}-Agent-Hook-Token: ${ZKYQ_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${ZKYQ_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${ZKYQ_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${ZKYQ_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${ZKYQ_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${ZKYQ_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${ZKYQ_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "hook_event_name=${ZKYQ_ANTIGRAVITY_EVENT}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || spool_hook_event',
    'exit 0',
    ''
  ].join('\n')
}

export function getWindowsWrapperScript(eventName: string): string {
  return [
    '@echo off',
    // Why (#9358/#9941): `!` is legal in the hooks path, and inherited delayed expansion
    // eats it out of the percent-expanded `%~dp0` — the wrapper then misses the core and
    // silently falls back on every event. Same reason the core disables it.
    'setlocal DisableDelayedExpansion',
    ...buildWindowsHookEnvironmentIdentityMigration(),
    `set "ZKYQ_ANTIGRAVITY_EVENT=${eventName}"`,
    'set "ZKYQ_ANTIGRAVITY_CORE=%~dp0antigravity-hook.cmd"',
    'if exist "%ZKYQ_ANTIGRAVITY_CORE%" (',
    '  call "%ZKYQ_ANTIGRAVITY_CORE%"',
    '  exit /b 0',
    ')',
    'if /I "%ZKYQ_ANTIGRAVITY_EVENT%"=="Stop" (',
    '  echo {"decision":""}',
    ') else if /I "%ZKYQ_ANTIGRAVITY_EVENT%"=="PreToolUse" (',
    `  echo ${ANTIGRAVITY_PRE_TOOL_USE_DECISION}`,
    ') else (',
    '  echo {}',
    ')',
    // Missing-core fallbacks obey the same outside-Orca stdin guard as the core.
    ...buildWindowsHookEnvironmentGuardLines(),
    'exit /b 0',
    ''
  ].join('\r\n')
}
