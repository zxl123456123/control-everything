import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { DEV_COMMAND_NAME, DEV_LAUNCHER_DIR } from './cli-install-constants'
import { escapeWindowsBatchValue, isAbsoluteForPlatform } from './cli-install-path-format'
import { quotePosixShellDoubleQuotedApostrophe } from '../../shared/shell-argument-quoting'
import { retireGeneratedCommand } from './retire-generated-command.cjs'

export async function ensureDevLauncher(args: {
  platform: NodeJS.Platform
  userDataPath: string
  execPath: string
  cliEntryPath: string
  commandName: string
}): Promise<string | null> {
  if (
    !isAbsoluteForPlatform(args.platform, args.execPath) ||
    !isAbsolute(args.cliEntryPath) ||
    !existsSync(args.cliEntryPath)
  ) {
    return null
  }

  const launcherPath = join(
    args.userDataPath,
    ...DEV_LAUNCHER_DIR,
    args.platform === 'win32' ? `${args.commandName}.cmd` : args.commandName
  )
  await mkdir(dirname(launcherPath), { recursive: true })

  // Why: dev builds lack the packaged resources/bin launcher, so generate one in userData to validate the flow.
  const legacyContent =
    args.platform === 'win32'
      ? buildWindowsDevLauncher(args.execPath, args.cliEntryPath, args.userDataPath)
      : buildUnixCliLauncher(args.execPath, args.cliEntryPath, args.userDataPath)
  const content =
    args.commandName !== DEV_COMMAND_NAME
      ? legacyContent
      : args.platform === 'win32'
        ? legacyContent.replace('setlocal\n', 'setlocal\nset "ORCA_CLI_COMMAND=zkyq-dev"\n')
        : legacyContent.replace(
            'set -euo pipefail\n',
            'set -euo pipefail\nexport ORCA_CLI_COMMAND=zkyq-dev\n'
          )
  await writeFile(launcherPath, content, {
    encoding: 'utf8',
    mode: args.platform === 'win32' ? undefined : 0o755
  })
  if (args.commandName === DEV_COMMAND_NAME) {
    // Managed terminals use the short command without claiming the global production command.
    await writeFile(
      join(dirname(launcherPath), args.platform === 'win32' ? 'zkyq.cmd' : 'zkyq'),
      content,
      {
        encoding: 'utf8',
        mode: args.platform === 'win32' ? undefined : 0o755
      }
    )
    for (const name of args.platform === 'win32'
      ? ['orca-dev.cmd', 'orca.cmd']
      : ['orca-dev', 'orca']) {
      retireGeneratedCommand(
        join(dirname(launcherPath), name),
        legacyContent
          .replaceAll('ZKYQ_USER_DATA_PATH', 'ORCA_USER_DATA_PATH')
          .replaceAll('ZKYQ_APP_EXECUTABLE', 'ORCA_APP_EXECUTABLE')
          .replaceAll('ZKYQ_NODE_', 'ORCA_NODE_')
      )
    }
  }
  return launcherPath
}

export function buildUnixCliLauncher(
  execPathValue: string,
  cliEntryPath: string,
  userDataPath: string,
  runtime: 'electron' | 'node' = 'electron'
): string {
  if (runtime === 'node') {
    return `#!/usr/bin/env sh
set -eu
export ZKYQ_USER_DATA_PATH=${quotePosixShellDoubleQuotedApostrophe(userDataPath)}
unset NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE ELECTRON_RUN_AS_NODE
exec ${quotePosixShellDoubleQuotedApostrophe(execPathValue)} ${quotePosixShellDoubleQuotedApostrophe(cliEntryPath)} "$@"
`
  }
  return `#!/usr/bin/env bash
set -euo pipefail
ELECTRON=${quotePosixShellDoubleQuotedApostrophe(execPathValue)}
CLI=${quotePosixShellDoubleQuotedApostrophe(cliEntryPath)}
export ZKYQ_USER_DATA_PATH=${quotePosixShellDoubleQuotedApostrophe(userDataPath)}
if [ -z "\${ZKYQ_APP_EXECUTABLE:-}" ]; then
  export ZKYQ_APP_EXECUTABLE="$ELECTRON"
  export ZKYQ_APP_EXECUTABLE_NEEDS_APP_ROOT=1
fi
export ZKYQ_NODE_OPTIONS="\${NODE_OPTIONS-}"
export ZKYQ_NODE_REPL_EXTERNAL_MODULE="\${NODE_REPL_EXTERNAL_MODULE-}"
unset NODE_OPTIONS
unset NODE_REPL_EXTERNAL_MODULE
ELECTRON_RUN_AS_NODE=1 exec "$ELECTRON" "$CLI" "$@"
`
}

export function buildWindowsDevLauncher(
  execPathValue: string,
  cliEntryPath: string,
  userDataPath: string
): string {
  return `@echo off
setlocal
set "ELECTRON=${escapeWindowsBatchValue(execPathValue)}"
set "CLI=${escapeWindowsBatchValue(cliEntryPath)}"
set "ZKYQ_USER_DATA_PATH=${escapeWindowsBatchValue(userDataPath)}"
if not defined ZKYQ_APP_EXECUTABLE (
  set "ZKYQ_APP_EXECUTABLE=%ELECTRON%"
  set "ZKYQ_APP_EXECUTABLE_NEEDS_APP_ROOT=1"
)
set "ZKYQ_NODE_OPTIONS=%NODE_OPTIONS%"
set "ZKYQ_NODE_REPL_EXTERNAL_MODULE=%NODE_REPL_EXTERNAL_MODULE%"
set NODE_OPTIONS=
set NODE_REPL_EXTERNAL_MODULE=
set ELECTRON_RUN_AS_NODE=1
"%ELECTRON%" "%CLI%" %*
`
}

export function buildWindowsForwarder(launcherPath: string): string {
  return `@echo off
setlocal
set "ORCA_LAUNCHER=${escapeWindowsBatchValue(launcherPath)}"
"%ORCA_LAUNCHER%" %*
`
}

export function extractManagedUnixLauncherTarget(content: string): string | null {
  if (
    !content.includes('ELECTRON_RUN_AS_NODE=1') ||
    (!content.includes('ZKYQ_NODE_OPTIONS') && !content.includes('ORCA_NODE_OPTIONS')) ||
    !content.includes('NODE_REPL_EXTERNAL_MODULE')
  ) {
    return null
  }

  const cliPath = extractShellAssignment(content, 'CLI')
  if (!cliPath) {
    return null
  }

  // Why: only Orca's compiled CLI entrypoints count as managed; arbitrary Electron-launching scripts stay conflicts.
  return /(?:^|[/\\])(?:out|app\.asar\.unpacked[/\\]out)[/\\]cli[/\\]index\.js$/.test(cliPath)
    ? cliPath
    : null
}

export function extractShellAssignment(content: string, name: string): string | null {
  const match = new RegExp(`^${name}=('([^']*)'|"([^"]*)"|([^\\n]+))$`, 'm').exec(content)
  if (!match) {
    return null
  }
  return (match[2] ?? match[3] ?? match[4] ?? '').trim()
}
