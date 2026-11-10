import { AGENT_HOOK_IDENTITY_SUFFIXES as IDENTITY_SUFFIXES } from '../../shared/agent-hook-environment-identity'

// These shell adapters mirror the self-contained Node adapter used by installed plugins.
const PANE_SUFFIXES = [
  'PANE_KEY',
  'TAB_ID',
  'WORKTREE_ID',
  'AGENT_LAUNCH_TOKEN',
  'AGENT_PANE',
  'AGENT_LAUNCH'
]
const ENDPOINT_SUFFIXES = ['PORT', 'TOKEN', 'ENV', 'VERSION', 'TRANSPORT', 'OPENCODE_TUI']

function posixWireIdentity(): string[] {
  return [
    'zkyq_hook_namespace=Zkyq',
    'if [ "${ZKYQ_AGENT_HOOK_VERSION:-}" = 1 ]; then zkyq_hook_namespace=Orca; fi'
  ]
}

function windowsWireIdentity(): string[] {
  return [
    'set "ZKYQ_HOOK_HEADER_NAMESPACE=Zkyq"',
    'if "%ZKYQ_AGENT_HOOK_VERSION%"=="1" set "ZKYQ_HOOK_HEADER_NAMESPACE=Orca"'
  ]
}

export function buildPosixHookEnvironmentIdentityMigration(): string[] {
  return [
    'zkyq_hook_identity_conflict=',
    ...IDENTITY_SUFFIXES.flatMap((suffix) => {
      const current = `ZKYQ_${suffix}`
      const retired = `ORCA_${suffix}`
      return [
        `if [ "\${${current}+set}" = set ] && [ "\${${retired}+set}" = set ] && [ "$${current}" != "$${retired}" ]; then zkyq_hook_identity_conflict=1; fi`,
        `if [ "\${${current}+set}" != set ] && [ "\${${retired}+set}" = set ]; then ${current}="$${retired}"; export ${current}; fi`,
        `unset ${retired}`
      ]
    }),
    `if [ -n "$zkyq_hook_identity_conflict" ]; then unset ${PANE_SUFFIXES.map((suffix) => `ZKYQ_${suffix}`).join(' ')}; fi`,
    'unset zkyq_hook_identity_conflict',
    ...posixWireIdentity()
  ]
}

export function buildWindowsHookEnvironmentIdentityMigration(): string[] {
  return [
    'setlocal DisableDelayedExpansion',
    'set "ZKYQ_HOOK_IDENTITY_CONFLICT="',
    ...IDENTITY_SUFFIXES.flatMap((suffix) => {
      const current = `ZKYQ_${suffix}`
      const retired = `ORCA_${suffix}`
      return [
        `if defined ${current} if defined ${retired} if not "%${current}%"=="%${retired}%" set "ZKYQ_HOOK_IDENTITY_CONFLICT=1"`,
        `if not defined ${current} if defined ${retired} set "${current}=%${retired}%"`,
        `set "${retired}="`
      ]
    }),
    ...PANE_SUFFIXES.map(
      (suffix) => `if defined ZKYQ_HOOK_IDENTITY_CONFLICT set "ZKYQ_${suffix}="`
    ),
    'set "ZKYQ_HOOK_IDENTITY_CONFLICT="',
    ...windowsWireIdentity()
  ]
}

/** Read only the endpoint's declared assignments, keeping file values ahead of inherited values. */
export function buildPosixHookEndpointRefresh(): string[] {
  return [
    'load_hook_endpoint() {',
    '  endpoint_path="$1"',
    '  unset ZKYQ_AGENT_HOOK_TRANSPORT',
    `  unset ${ENDPOINT_SUFFIXES.flatMap((suffix) => [`zkyq_endpoint_current_${suffix}`, `zkyq_endpoint_retired_${suffix}`]).join(' ')}`,
    '  endpoint_cr=$(printf "\\r")',
    '  while IFS= read -r endpoint_line || [ -n "$endpoint_line" ]; do',
    '    endpoint_line=${endpoint_line%"$endpoint_cr"}',
    '    case "$endpoint_line" in',
    ...ENDPOINT_SUFFIXES.flatMap((suffix) => [
      `      ZKYQ_AGENT_HOOK_${suffix}=*|"set ZKYQ_AGENT_HOOK_${suffix}="*) zkyq_endpoint_current_${suffix}=\${endpoint_line#*=} ;;`,
      `      ORCA_AGENT_HOOK_${suffix}=*|"set ORCA_AGENT_HOOK_${suffix}="*) zkyq_endpoint_retired_${suffix}=\${endpoint_line#*=} ;;`
    ]),
    '    esac',
    '  done < "$endpoint_path"',
    ...ENDPOINT_SUFFIXES.flatMap((suffix) => [
      `  if [ "\${zkyq_endpoint_current_${suffix}+set}" = set ] && [ "\${zkyq_endpoint_retired_${suffix}+set}" = set ] && [ "$zkyq_endpoint_current_${suffix}" != "$zkyq_endpoint_retired_${suffix}" ]; then`,
      `    unset ${PANE_SUFFIXES.map((name) => `ZKYQ_${name}`).join(' ')}`,
      '    return 1',
      '  fi'
    ]),
    ...ENDPOINT_SUFFIXES.map(
      (suffix) =>
        `  if [ "\${zkyq_endpoint_current_${suffix}+set}" = set ]; then ZKYQ_AGENT_HOOK_${suffix}="$zkyq_endpoint_current_${suffix}"; export ZKYQ_AGENT_HOOK_${suffix}; elif [ "\${zkyq_endpoint_retired_${suffix}+set}" = set ]; then ZKYQ_AGENT_HOOK_${suffix}="$zkyq_endpoint_retired_${suffix}"; export ZKYQ_AGENT_HOOK_${suffix}; fi`
    ),
    '}',
    'if [ -n "${ZKYQ_AGENT_HOOK_ENDPOINT:-}" ] && [ -r "$ZKYQ_AGENT_HOOK_ENDPOINT" ]; then',
    '  load_hook_endpoint "$ZKYQ_AGENT_HOOK_ENDPOINT" || :',
    'fi',
    ...posixWireIdentity()
  ]
}

export function buildWindowsHookEndpointRefresh(): string[] {
  return [
    ...ENDPOINT_SUFFIXES.flatMap((suffix) => [
      `set "ZKYQ_ENDPOINT_CURRENT_${suffix}="`,
      `set "ZKYQ_ENDPOINT_RETIRED_${suffix}="`
    ]),
    'set "ZKYQ_ENDPOINT_CONFLICT="',
    'if defined ZKYQ_AGENT_HOOK_ENDPOINT if exist "%ZKYQ_AGENT_HOOK_ENDPOINT%" for /f "usebackq tokens=1,* delims==" %%A in ("%ZKYQ_AGENT_HOOK_ENDPOINT%") do (',
    ...ENDPOINT_SUFFIXES.flatMap((suffix) => [
      `  if /I "%%A"=="set ZKYQ_AGENT_HOOK_${suffix}" set "ZKYQ_ENDPOINT_CURRENT_${suffix}=%%B"`,
      `  if /I "%%A"=="ZKYQ_AGENT_HOOK_${suffix}" set "ZKYQ_ENDPOINT_CURRENT_${suffix}=%%B"`,
      `  if /I "%%A"=="set ORCA_AGENT_HOOK_${suffix}" set "ZKYQ_ENDPOINT_RETIRED_${suffix}=%%B"`,
      `  if /I "%%A"=="ORCA_AGENT_HOOK_${suffix}" set "ZKYQ_ENDPOINT_RETIRED_${suffix}=%%B"`
    ]),
    ')',
    ...ENDPOINT_SUFFIXES.flatMap((suffix) => [
      `if defined ZKYQ_ENDPOINT_CURRENT_${suffix} if defined ZKYQ_ENDPOINT_RETIRED_${suffix} if not "%ZKYQ_ENDPOINT_CURRENT_${suffix}%"=="%ZKYQ_ENDPOINT_RETIRED_${suffix}%" set "ZKYQ_ENDPOINT_CONFLICT=1"`,
      `if defined ZKYQ_ENDPOINT_CURRENT_${suffix} set "ZKYQ_AGENT_HOOK_${suffix}=%ZKYQ_ENDPOINT_CURRENT_${suffix}%"`,
      `if not defined ZKYQ_ENDPOINT_CURRENT_${suffix} if defined ZKYQ_ENDPOINT_RETIRED_${suffix} set "ZKYQ_AGENT_HOOK_${suffix}=%ZKYQ_ENDPOINT_RETIRED_${suffix}%"`,
      `set "ZKYQ_ENDPOINT_CURRENT_${suffix}="`,
      `set "ZKYQ_ENDPOINT_RETIRED_${suffix}="`
    ]),
    ...PANE_SUFFIXES.map((suffix) => `if defined ZKYQ_ENDPOINT_CONFLICT set "ZKYQ_${suffix}="`),
    'set "ZKYQ_ENDPOINT_CONFLICT="',
    ...windowsWireIdentity()
  ]
}
