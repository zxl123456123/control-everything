#!/usr/bin/env node
// Symlinks the zkyq-dev wrapper into /usr/local/bin so the dev CLI is
// available globally after `pnpm run build:cli`.
import { existsSync, lstatSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { retireGeneratedSymlink } from '../../src/main/cli/retire-generated-command.cjs'

const scriptDir = import.meta.dirname
const source = path.join(scriptDir, 'zkyq-dev.mjs')

const commandPath =
  process.platform === 'darwin' || process.platform === 'linux' ? '/usr/local/bin/zkyq-dev' : null

if (!commandPath) {
  console.log('[zkyq-dev] Skipping global symlink (unsupported platform).')
  process.exit(0)
}

function isOwnedByUs(target) {
  try {
    if (!lstatSync(target).isSymbolicLink()) {
      return false
    }
    return readlinkSync(target) === source
  } catch {
    return false
  }
}

let installed = false
if (existsSync(commandPath) || isOwnedByUs(commandPath)) {
  if (isOwnedByUs(commandPath)) {
    console.log(`[zkyq-dev] ${commandPath} already points to dev CLI.`)
    installed = true
  } else {
    console.error(
      `[zkyq-dev] ${commandPath} exists but is not our symlink. Remove it manually if you want the dev CLI installed globally.`
    )
  }
} else {
  try {
    execFileSync('ln', ['-s', source, commandPath], { stdio: 'inherit' })
    installed = true
    console.log(`[zkyq-dev] Symlinked ${commandPath} → ${source}`)
  } catch {
    console.log(
      `[zkyq-dev] Could not create ${commandPath}. Register a symlink to ${source} with the required permissions.`
    )
  }
}
if (installed) {
  retireGeneratedSymlink('/usr/local/bin/orca-dev', path.join(scriptDir, 'orca-dev.mjs'))
}
