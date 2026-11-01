import { afterEach, expect, it } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'jsonc-parser'
import {
  getOpenCodePluginSource,
  getOpenCode2PluginSource
} from '../main/opencode/status-plugin-module-source'
import { getOpenCodeStartupPromptSource } from '../main/opencode/opencode-startup-prompt-source'
import { writeOpenCodePluginConfig } from '../main/opencode/opencode-plugin-config-writer'
import { getOpenCodeTuiPluginSource } from './opencode-tui-plugin-install'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
function fixture(startup = false, second = false) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'zkyq-plugin-identity-')))
  roots.push(dir)
  const name = startup
    ? 'zkyq-opencode-startup-prompt'
    : second
      ? 'zkyq-opencode2-status'
      : 'zkyq-opencode-status'
  const oldName = name.replace(/^zkyq-/, 'orca-')
  const source = startup
    ? getOpenCodeStartupPromptSource()
    : second
      ? getOpenCode2PluginSource()
      : getOpenCodePluginSource()
  const tui = startup ? name : `${name}-tui`
  const oldTui = tui.replace(/^zkyq-/, 'orca-')
  const retire = (text: string) =>
    text
      .replaceAll('zkyq-opencode', 'orca-opencode')
      .replaceAll('ZkyqOpenCodeStatusPlugin', 'OrcaOpenCodeStatusPlugin')
      .replaceAll('zkyqServerPlugin', 'orcaServerPlugin')
      .replaceAll('_zkyqServerOnly', '_orcaServerOnly')
      .replaceAll('zkyqTuiPlugin', 'orcaTuiPlugin')
  const old = join(dir, 'plugins', `${oldName}.js`)
  const entry = join(dir, 'plugins', tui, 'tui.js')
  const oldEntry = join(dir, 'plugins', oldTui, 'tui.js')
  mkdirSync(join(dir, 'plugins', oldTui), { recursive: true })
  if (!startup) writeFileSync(old, retire(source))
  writeFileSync(oldEntry, retire(getOpenCodeTuiPluginSource(tui, source)))
  const install = (ownership: 'canonical' | 'overlay' = 'canonical') =>
    writeOpenCodePluginConfig({
      configDir: dir,
      pluginFileName: `${name}.js`,
      getSource: () => source,
      installsTuiPlugin: !startup,
      tuiOnlyDirectory: startup ? name : undefined,
      ownership
    })
  return { dir, name, old, entry, oldEntry, source, install }
}

it.each([
  [false, false],
  [false, true],
  [true, false]
])(
  'migrates generated files and TUI references without changing user choices (%s, %s)',
  (startup, second) => {
    const f = fixture(startup, second)
    const config = join(f.dir, 'tui.jsonc')
    writeFileSync(
      config,
      `{// keep comment\n"theme":"custom","plugin":["npm-package",[${JSON.stringify(pathToFileURL(f.oldEntry).href)},{"enabled":true}]],"keybinds":{"session_new":"ctrl+n"}}`
    )
    f.install()
    expect(existsSync(f.old)).toBe(false)
    expect(existsSync(f.oldEntry)).toBe(false)
    expect(readFileSync(f.entry, 'utf8')).toBe(
      getOpenCodeTuiPluginSource(f.name + (startup ? '' : '-tui'), f.source)
    )
    const text = readFileSync(config, 'utf8')
    expect(text).toContain('// keep comment')
    expect(parse(text)).toEqual({
      theme: 'custom',
      plugin: ['npm-package', [pathToFileURL(f.entry).href, { enabled: true }]],
      keybinds: { session_new: 'ctrl+n' }
    })
    expect(text).not.toContain('orca-opencode')
    const before = [statSync(f.entry).mtimeMs, statSync(config).mtimeMs]
    f.install()
    expect([statSync(f.entry).mtimeMs, statSync(config).mtimeMs]).toEqual(before)
  }
)

it('updates relative references and collapses identical old/new registrations', () => {
  const f = fixture()
  const config = join(f.dir, 'tui.json')
  writeFileSync(
    config,
    JSON.stringify({
      plugin: ['./plugins/orca-opencode-status-tui/tui.js', pathToFileURL(f.entry).href]
    })
  )
  f.install()
  expect(parse(readFileSync(config, 'utf8')).plugin).toEqual([pathToFileURL(f.entry).href])
})

it.each(['modified', 'target', 'invalid-config', 'options-conflict'])(
  'preserves every old file on a migration conflict: %s',
  (kind) => {
    const f = fixture()
    const config = join(f.dir, 'tui.json')
    if (kind === 'modified') writeFileSync(f.oldEntry, 'user customization')
    if (kind === 'target') writeFileSync(join(f.dir, 'plugins', `${f.name}.js`), 'user collision')
    if (kind === 'invalid-config') writeFileSync(config, '{broken')
    if (kind === 'options-conflict')
      writeFileSync(
        config,
        JSON.stringify({
          plugin: [
            [pathToFileURL(f.oldEntry).href, { mode: 1 }],
            [pathToFileURL(f.entry).href, { mode: 2 }]
          ]
        })
      )
    const before = [
      readFileSync(f.old, 'utf8'),
      readFileSync(f.oldEntry, 'utf8'),
      existsSync(config) ? readFileSync(config, 'utf8') : undefined
    ]
    expect(() => f.install()).toThrow()
    expect([
      readFileSync(f.old, 'utf8'),
      readFileSync(f.oldEntry, 'utf8'),
      existsSync(config) ? readFileSync(config, 'utf8') : undefined
    ]).toEqual(before)
    if (kind !== 'target') expect(existsSync(join(f.dir, 'plugins', `${f.name}.js`))).toBe(false)
  }
)

it('preserves additional files while renaming a generated TUI directory', () => {
  const f = fixture()
  writeFileSync(join(f.oldEntry, '..', 'user-notes.txt'), 'keep')
  f.install()
  expect(readFileSync(join(f.entry, '..', 'user-notes.txt'), 'utf8')).toBe('keep')
})

it('does not create a TUI config for auto-discovered plugins', () => {
  const f = fixture(false, true)
  f.install()
  expect(existsSync(join(f.dir, 'tui.json'))).toBe(false)
})

it('removes verified duplicates without changing current module timestamps', () => {
  const f = fixture()
  const oldSource = readFileSync(f.old, 'utf8')
  const oldTui = readFileSync(f.oldEntry, 'utf8')
  f.install()
  const server = join(f.dir, 'plugins', `${f.name}.js`)
  const before = [statSync(server).mtimeMs, statSync(f.entry).mtimeMs]
  writeFileSync(f.old, oldSource)
  mkdirSync(join(f.oldEntry, '..'))
  writeFileSync(f.oldEntry, oldTui)
  f.install()
  expect(existsSync(f.old)).toBe(false)
  expect(existsSync(f.oldEntry)).toBe(false)
  expect([statSync(server).mtimeMs, statSync(f.entry).mtimeMs]).toEqual(before)
})

it('detaches a mirrored TUI directory on Windows and POSIX without changing its target', () => {
  const f = fixture()
  const original = readFileSync(f.oldEntry, 'utf8')
  const target = join(f.dir, 'user-tui')
  mkdirSync(target)
  writeFileSync(join(target, 'tui.js'), original)
  writeFileSync(join(target, 'user.txt'), 'keep')
  rmSync(join(f.oldEntry, '..'), { recursive: true })
  symlinkSync(target, join(f.oldEntry, '..'), process.platform === 'win32' ? 'junction' : 'dir')
  f.install('overlay')
  expect(existsSync(f.oldEntry)).toBe(false)
  expect(lstatSync(join(f.entry, '..')).isSymbolicLink()).toBe(false)
  expect(readFileSync(join(target, 'tui.js'), 'utf8')).toBe(original)
  expect(readFileSync(join(target, 'user.txt'), 'utf8')).toBe('keep')
})

it.skipIf(process.platform === 'win32')(
  'detaches mirrored legacy modules while preserving user sources and settings',
  () => {
    const f = fixture()
    const user = join(f.dir, 'user')
    mkdirSync(user)
    const original = readFileSync(f.old, 'utf8')
    const originalTui = readFileSync(f.oldEntry, 'utf8')
    const userFile = join(user, 'status.js')
    const userTui = join(user, 'tui')
    writeFileSync(userFile, original)
    mkdirSync(userTui)
    writeFileSync(join(userTui, 'tui.js'), originalTui)
    rmSync(f.old)
    rmSync(join(f.oldEntry, '..'), { recursive: true })
    symlinkSync(userFile, f.old)
    symlinkSync(userTui, join(f.oldEntry, '..'), 'dir')
    const userConfig = join(user, 'tui.jsonc')
    writeFileSync(
      userConfig,
      `{// user\n"plugin":[${JSON.stringify(pathToFileURL(f.oldEntry).href)}]}`
    )
    symlinkSync(userConfig, join(f.dir, 'tui.jsonc'))
    f.install('overlay')
    expect(lstatSync(f.entry).isSymbolicLink()).toBe(false)
    expect(lstatSync(join(f.dir, 'tui.jsonc')).isSymbolicLink()).toBe(false)
    expect(readFileSync(userFile, 'utf8')).toBe(original)
    expect(readFileSync(join(userTui, 'tui.js'), 'utf8')).toBe(originalTui)
    expect(readFileSync(userConfig, 'utf8')).toContain('orca-opencode')
  }
)
