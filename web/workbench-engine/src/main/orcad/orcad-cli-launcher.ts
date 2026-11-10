import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  ORCAD_CLI_ENTRY_FILENAME,
  ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME
} from '../../shared/orcad-artifacts'
import { nodeFileContentsEqual } from '../../shared/node-file-content-equality'
import { buildUnixCliLauncher } from '../cli/cli-dev-launcher'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { resolveOrcadInstallRoot, resolveUserDataPath } from './orcad-app-paths'

// Read by native/windows-cli-launcher: its presence beside the exe selects the server mode.
export const ORCAD_WINDOWS_CLI_LAUNCHER_CONFIG_FILENAME = 'zkyq-launcher.cfg'
const RETIRED_LAUNCHER_SUFFIX = '.retired'

let launcherPath: string | null = null
let accountCommand: 'zkyq' | undefined

export function getOrcadAccountCommand(): 'zkyq' | undefined {
  return accountCommand
}

export function getOrcadCliLauncherPath(): string | null {
  return launcherPath
}

export async function prepareOrcadCliLauncher(): Promise<void> {
  launcherPath = null
  accountCommand = undefined
  const installRoot = resolveOrcadInstallRoot()
  const entry = join(installRoot, ...ORCAD_CLI_ENTRY_FILENAME.split('/'))
  // Older server slots and source-only runs may not include the CLI yet.
  if (!existsSync(entry)) {
    return
  }
  const userDataPath = resolveUserDataPath()
  const binDir = join(userDataPath, 'cli', 'bin')
  if (process.platform === 'win32') {
    launcherPath = await prepareWindowsLauncher(installRoot, entry, userDataPath, binDir)
    if (!launcherPath) {
      return
    }
    await retireGeneratedCommand(binDir, 'ce-workbench.exe')
    await retireGeneratedCommand(binDir, 'orca.exe')
  } else {
    const path = join(binDir, 'zkyq')
    const script = buildUnixCliLauncher(process.execPath, entry, userDataPath, 'node')
    await mkdir(binDir, { recursive: true })
    const current = await readFile(path, 'utf8').catch(() => null)
    if (current !== script) {
      writeFileAtomically(path, script, { mode: 0o700 })
    }
    await chmod(path, 0o700)
    launcherPath = path
    await retireGeneratedCommand(binDir, 'ce-workbench')
    await retireGeneratedCommand(binDir, 'orca')
  }
  await rm(join(binDir, 'platform-entry.cjs'), { force: true })
  accountCommand = 'zkyq'
}

/** Retire only the generated command in this host's private CLI directory. */
async function retireGeneratedCommand(binDir: string, filename: string): Promise<void> {
  const path = join(binDir, filename)
  if (existsSync(path)) {
    // Windows can rename an executable still mapped by a running process.
    await rename(path, `${path}.${randomUUID()}${RETIRED_LAUNCHER_SUFFIX}`)
  }
  await removeRetiredLaunchers(binDir, filename)
}

export function buildWindowsCliLauncherConfig(
  nodePath: string,
  cliEntryPath: string,
  userDataPath: string
): string {
  return `node=${nodePath}\ncli=${cliEntryPath}\nuser-data=${userDataPath}\n`
}

/** A native exe, never a .cmd: cmd.exe reparses `%*` and cannot carry a multi-line body. */
async function prepareWindowsLauncher(
  installRoot: string,
  entry: string,
  userDataPath: string,
  binDir: string
): Promise<string | null> {
  const source = join(installRoot, ...ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME.split('/'))
  if (!existsSync(source)) {
    return null
  }
  const filename = 'zkyq.exe'
  const path = join(binDir, filename)
  await mkdir(binDir, { recursive: true })
  await removeRetiredLaunchers(binDir, filename)
  // Publish configuration before the new binary can be invoked.
  const configPath = join(binDir, ORCAD_WINDOWS_CLI_LAUNCHER_CONFIG_FILENAME)
  const config = buildWindowsCliLauncherConfig(process.execPath, entry, userDataPath)
  if ((await readFile(configPath, 'utf8').catch(() => null)) !== config) {
    writeFileAtomically(configPath, config)
  }
  const binary = await readFile(source)
  if (!(await nodeFileContentsEqual(path, binary).catch(() => false))) {
    try {
      writeFileAtomically(path, binary)
    } catch {
      // A running launcher keeps its image mapped; Windows still lets it be renamed away.
      await rename(path, `${path}.${randomUUID()}${RETIRED_LAUNCHER_SUFFIX}`)
      writeFileAtomically(path, binary)
    }
  }
  // This generated file contains only runtime paths; retire it after successful installation.
  await rm(join(binDir, 'orca-launcher.cfg'), { force: true })
  return path
}

async function removeRetiredLaunchers(binDir: string, filename: string): Promise<void> {
  const names = await readdir(binDir).catch(() => [])
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${filename}.`) && name.endsWith(RETIRED_LAUNCHER_SUFFIX))
      // One still running stays until a later start.
      .map((name) => rm(join(binDir, name), { force: true }).catch(() => {}))
  )
}
