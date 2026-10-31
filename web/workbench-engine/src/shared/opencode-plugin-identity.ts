import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import { getOpenCodeTuiPluginSource, openCodeTuiPluginDirName } from './opencode-tui-plugin-install'
import { prepareOpenCodeTuiPluginRegistration } from './opencode-tui-config-registration'
import { writeOverlayOpenCodePluginAtomically } from './opencode-plugin-atomic-write'

// Exact generated modules from the two environment-identity baselines. User edits do not match.
const retiredModuleHashes = new Set([
  '86b8a432a30dcfe43b03d27a15ed2f7587c4bfff2b58fba640f5b6a154045124',
  '98c702c143cd79bdea6b1f2d7bea8733be7e8b99ef9e778a015d4f9ca30f6590',
  '2ec2c932fb6bc6461f771d152720be48368692a316b5765d0f88baff18da1c32',
  '40fa7c8ef115007808cdf0e0b6b04b6672aeebbf76e35953729544a884ce151c',
  'c8053707bba5197af89e36ec3b54c695a2b2a538b82f784695b17944273c2a06',
  'f9b59e3789b54c9758c807a9b05e29a2c7ce8a7a4d3656e406b9a0c91ef57a73',
  'd8a5fa3320f6099226add240d44f08274f588cbefb3e1e6c7c16f3cd022346bd',
  '3c92ce9f570784ba5e512c52480b91470f33f6ecfefae273e33391eed81db0f9'
])

export function retiredOpenCodePluginFileName(name: string): string | undefined {
  return [
    'zkyq-opencode-status.js',
    'zkyq-opencode2-status.js',
    'zkyq-opencode-startup-prompt.js'
  ].includes(name)
    ? name.replace(/^zkyq-/, 'orca-')
    : undefined
}

function retiredSource(source: string): string {
  return source
    .replaceAll('zkyq-opencode', 'orca-opencode')
    .replaceAll('ZkyqOpenCodeStatusPlugin', 'OrcaOpenCodeStatusPlugin')
    .replaceAll('zkyqServerPlugin', 'orcaServerPlugin')
    .replaceAll('_zkyqServerOnly', '_orcaServerOnly')
    .replaceAll('zkyqTuiPlugin', 'orcaTuiPlugin')
}

/** Retire only verified generated modules; validate every collision before touching disk. */
export function migrateOpenCodePluginIdentity(
  configDir: string,
  pluginFileName: string,
  source: string,
  ownership: 'canonical' | 'overlay'
): void {
  const previousName = retiredOpenCodePluginFileName(pluginFileName)
  if (!previousName) return
  const pluginsDir = join(configDir, 'plugins')
  const startup = pluginFileName === 'zkyq-opencode-startup-prompt.js'
  const tuiName = startup ? pluginFileName.slice(0, -3) : openCodeTuiPluginDirName(pluginFileName)
  const oldTuiName = startup ? previousName.slice(0, -3) : openCodeTuiPluginDirName(previousName)
  const pairs = [
    ...(!startup
      ? [{ oldName: previousName, name: pluginFileName, source, directory: false }]
      : []),
    {
      oldName: oldTuiName,
      name: tuiName,
      source: getOpenCodeTuiPluginSource(tuiName, source),
      directory: true
    }
  ]
  const moves: {
    from: string
    to: string
    directory: boolean
    duplicate: boolean
    link: boolean
    source: string
  }[] = []
  for (const pair of pairs) {
    const from = join(pluginsDir, pair.oldName)
    const stat = lstatSync(from, { throwIfNoEntry: false })
    if (!stat) continue
    const entry = pair.directory ? join(from, 'tui.js') : from
    if (pair.directory && !stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new Error(`Cannot migrate user-owned OpenCode plugin: ${from}`)
    }
    const content = readFileSync(entry, 'utf8').replaceAll('\r\n', '\n')
    if (
      content !== retiredSource(pair.source) &&
      !retiredModuleHashes.has(createHash('sha256').update(content).digest('hex'))
    ) {
      throw new Error(`Cannot migrate modified OpenCode plugin: ${from}`)
    }
    const to = join(pluginsDir, pair.name)
    const duplicate = lstatSync(to, { throwIfNoEntry: false }) !== undefined
    if (duplicate) {
      const target = pair.directory ? join(to, 'tui.js') : to
      if (
        readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== pair.source ||
        (pair.directory &&
          !stat.isSymbolicLink() &&
          readdirSync(from).some((name) => name !== 'tui.js'))
      ) {
        throw new Error(`Conflicting OpenCode plugin identity: ${to}`)
      }
    }
    moves.push({
      from,
      to,
      directory: pair.directory,
      duplicate,
      link: stat.isSymbolicLink(),
      source: pair.source
    })
  }
  if (!moves.length) return
  const applyRegistration = prepareOpenCodeTuiPluginRegistration(
    configDir,
    join(pluginsDir, tuiName, 'tui.js'),
    ownership,
    join(pluginsDir, oldTuiName, 'tui.js')
  )
  for (const move of moves) {
    if (ownership === 'overlay' && move.link) {
      if (!move.duplicate) {
        if (move.directory) mkdirSync(move.to, { recursive: true })
        writeOverlayOpenCodePluginAtomically(
          move.directory ? join(move.to, 'tui.js') : move.to,
          move.source
        )
      }
      unlinkSync(move.from)
    } else if (!move.duplicate) renameSync(move.from, move.to)
    else if (move.directory && !move.link) {
      unlinkSync(join(move.from, 'tui.js'))
      rmdirSync(move.from)
    } else unlinkSync(move.from)
  }
  applyRegistration()
}
