import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { retireGeneratedCommand } from '../../src/main/cli/retire-generated-command.cjs'

function escapeWindowsBatchValue(value) {
  // Why: cmd.exe expands %NAME% even inside quotes, so literal path percent signs must be doubled.
  return value.replaceAll('%', '%%')
}

export function prepareDevCliTerminalWrappers({
  repoRoot,
  userDataPath,
  electronExecutable,
  platform = process.platform
}) {
  const binDir = path.join(repoRoot, 'out', 'bin')
  const userDataBinDir = path.join(userDataPath, 'cli', 'bin')
  const cliPath = path.join(repoRoot, 'out', 'cli', 'index.js')
  mkdirSync(binDir, { recursive: true })
  mkdirSync(userDataBinDir, { recursive: true })

  if (platform === 'win32') {
    const legacyContent = `@echo off\r\nset "ORCA_USER_DATA_PATH=${escapeWindowsBatchValue(userDataPath)}"\r\nset "ORCA_DEV_CLI_INVOCATION=1"\r\nset "ORCA_APP_EXECUTABLE=${escapeWindowsBatchValue(electronExecutable)}"\r\nset "ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT=1"\r\nnode "${escapeWindowsBatchValue(cliPath)}" %*\r\n`
    const wrapperContent = legacyContent.replace(
      'set "ORCA_DEV_CLI_INVOCATION=1"',
      'set "ORCA_DEV_CLI_INVOCATION=1"\r\nset "ORCA_CLI_COMMAND=zkyq-dev"'
    )
    for (const targetDir of [binDir, userDataBinDir]) {
      for (const commandName of ['zkyq-dev.cmd', 'zkyq.cmd']) {
        writeFileSync(path.join(targetDir, commandName), wrapperContent, 'utf8')
      }
      for (const oldName of ['orca-dev.cmd', 'orca.cmd']) {
        retireGeneratedCommand(path.join(targetDir, oldName), legacyContent)
      }
    }
  } else {
    const legacyContent = `#!/usr/bin/env bash\nexport ORCA_USER_DATA_PATH=${JSON.stringify(userDataPath)}\nexport ORCA_DEV_CLI_INVOCATION=1\nexport ORCA_APP_EXECUTABLE=${JSON.stringify(electronExecutable)}\nexport ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT=1\nexec node ${JSON.stringify(cliPath)} "$@"\n`
    const wrapperContent = legacyContent.replace(
      'export ORCA_DEV_CLI_INVOCATION=1',
      'export ORCA_DEV_CLI_INVOCATION=1\nexport ORCA_CLI_COMMAND=zkyq-dev'
    )
    for (const targetDir of [binDir, userDataBinDir]) {
      for (const commandName of ['zkyq-dev', 'zkyq']) {
        const wrapperPath = path.join(targetDir, commandName)
        writeFileSync(wrapperPath, wrapperContent, 'utf8')
        chmodSync(wrapperPath, 0o755)
      }
      for (const oldName of ['orca-dev', 'orca']) {
        retireGeneratedCommand(path.join(targetDir, oldName), legacyContent)
      }
    }
  }

  return { binDir, userDataBinDir }
}
