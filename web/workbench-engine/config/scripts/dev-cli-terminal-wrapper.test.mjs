import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareDevCliTerminalWrappers } from './dev-cli-terminal-wrapper.mjs'

describe('dev CLI terminal wrappers', () => {
  it.each(['win32', 'linux'])(
    'retires generated old wrappers and preserves user files on %s',
    (platform) => {
      const root = mkdtempSync(path.join(tmpdir(), 'zkyq-dev-migration-'))
      const userDataPath = path.join(root, 'profile')
      const options = {
        repoRoot: root,
        userDataPath,
        electronExecutable: path.join(root, 'electron'),
        platform
      }
      const { binDir, userDataBinDir } = prepareDevCliTerminalWrappers(options)
      const extension = platform === 'win32' ? '.cmd' : ''
      const current = readFileSync(path.join(binDir, 'zkyq-dev' + extension), 'utf8')
      const old = current.replace(
        platform === 'win32'
          ? 'set "ZKYQ_CLI_COMMAND=zkyq-dev"\r\n'
          : 'export ZKYQ_CLI_COMMAND=zkyq-dev\n',
        ''
      )
      for (const directory of [binDir, userDataBinDir]) {
        writeFileSync(
          path.join(directory, 'orca-dev' + extension),
          old
            .replaceAll('ZKYQ_USER_DATA_PATH', 'ORCA_USER_DATA_PATH')
            .replaceAll('ZKYQ_APP_EXECUTABLE', 'ORCA_APP_EXECUTABLE')
            .replaceAll('ZKYQ_DEV_CLI_INVOCATION', 'ORCA_DEV_CLI_INVOCATION')
        )
        writeFileSync(path.join(directory, 'orca' + extension), 'user command')
      }
      prepareDevCliTerminalWrappers(options)
      for (const directory of [binDir, userDataBinDir]) {
        expect(existsSync(path.join(directory, 'orca-dev' + extension))).toBe(false)
        expect(readFileSync(path.join(directory, 'orca' + extension), 'utf8')).toBe('user command')
        expect(readFileSync(path.join(directory, 'zkyq' + extension), 'utf8')).toContain(
          'ZKYQ_CLI_COMMAND=zkyq-dev'
        )
      }
    }
  )

  it('writes profile-scoped Windows wrappers for worker terminals', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'zkyq-dev-terminal-wrapper-'))
    const userDataPath = path.join(root, 'profile')
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable: path.join(root, 'electron.exe'),
      platform: 'win32'
    })

    const wrapper = readFileSync(path.join(userDataPath, 'cli', 'bin', 'zkyq-dev.cmd'), 'utf8')
    expect(wrapper).toContain(`set "ZKYQ_USER_DATA_PATH=${userDataPath}"`)
    expect(wrapper).toContain('set "ZKYQ_DEV_CLI_INVOCATION=1"')
    expect(wrapper).toContain(`node "${path.join(root, 'out', 'cli', 'index.js')}" %*`)
    expect(readFileSync(path.join(userDataPath, 'cli', 'bin', 'zkyq.cmd'), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', 'zkyq-dev.cmd'), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', 'zkyq.cmd'), 'utf8')).toBe(wrapper)
  })

  it('escapes literal percent signs in every Windows batch path', () => {
    const root = path.join(mkdtempSync(path.join(tmpdir(), 'zkyq-dev-terminal-wrapper-')), '%repo%')
    const userDataPath = path.join(root, '%profile%')
    const electronExecutable = path.join(root, '%electron%', 'electron.exe')
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable,
      platform: 'win32'
    })

    const wrapper = readFileSync(path.join(userDataPath, 'cli', 'bin', 'zkyq-dev.cmd'), 'utf8')
    expect(wrapper).toContain(`set "ZKYQ_USER_DATA_PATH=${userDataPath.replaceAll('%', '%%')}"`)
    expect(wrapper).toContain(
      `set "ZKYQ_APP_EXECUTABLE=${electronExecutable.replaceAll('%', '%%')}"`
    )
    expect(wrapper).toContain(
      `node "${path.join(root, 'out', 'cli', 'index.js').replaceAll('%', '%%')}" %*`
    )
    expect(readFileSync(path.join(root, 'out', 'bin', 'zkyq-dev.cmd'), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', 'zkyq.cmd'), 'utf8')).toBe(wrapper)
  })

  it('writes executable-style POSIX wrappers with the same profile identity', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'zkyq-dev-terminal-wrapper-'))
    const userDataPath = path.join(root, 'profile')
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable: path.join(root, 'electron'),
      platform: 'linux'
    })

    const wrapper = readFileSync(path.join(userDataPath, 'cli', 'bin', 'zkyq-dev'), 'utf8')
    expect(wrapper).toContain(`export ZKYQ_USER_DATA_PATH=${JSON.stringify(userDataPath)}`)
    expect(wrapper).toContain('export ZKYQ_DEV_CLI_INVOCATION=1')
    expect(wrapper).toContain(
      `exec node ${JSON.stringify(path.join(root, 'out', 'cli', 'index.js'))}`
    )
    expect(readFileSync(path.join(userDataPath, 'cli', 'bin', 'zkyq'), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', 'zkyq-dev'), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', 'zkyq'), 'utf8')).toBe(wrapper)
  })
})
