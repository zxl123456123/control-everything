import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { retireGeneratedCommand, retireGeneratedSymlink } from './retire-generated-command.cjs'

const roots: string[] = []
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), 'zkyq-retirement-'))
  roots.push(root)
  return { root, command: join(root, 'old-command') }
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

it('removes only the exact generated file and permits repeated cleanup', () => {
  const { root, command } = fixture()
  fs.writeFileSync(command, 'generated command')
  expect(retireGeneratedCommand(command, 'generated command')).toBe(true)
  expect(retireGeneratedCommand(command, 'generated command')).toBe(false)
  expect(fs.readdirSync(root)).toEqual([])
  fs.writeFileSync(command, 'user command')
  expect(retireGeneratedCommand(command, 'generated command')).toBe(false)
  expect(fs.readFileSync(command, 'utf8')).toBe('user command')
})

it('restores a replacement captured between inspection and retirement', () => {
  const { root, command } = fixture()
  fs.writeFileSync(command, 'generated command')
  const rename = fs.renameSync
  vi.spyOn(fs, 'renameSync').mockImplementationOnce((source, target) => {
    fs.writeFileSync(source, 'user replacement')
    rename(source, target)
  })
  expect(retireGeneratedCommand(command, 'generated command')).toBe(false)
  expect(fs.readFileSync(command, 'utf8')).toBe('user replacement')
  expect(fs.readdirSync(root)).toEqual(['old-command'])
})

it.skipIf(process.platform === 'win32')(
  'keeps foreign symlinks and removes only a matching target',
  () => {
    const { command } = fixture()
    fs.symlinkSync('/missing/user-command', command)
    expect(retireGeneratedCommand(command, 'generated command')).toBe(false)
    expect(retireGeneratedSymlink(command, '/missing/workbench-command')).toBe(false)
    expect(fs.readlinkSync(command)).toBe('/missing/user-command')
    expect(retireGeneratedSymlink(command, '/missing/user-command')).toBe(true)
  }
)
