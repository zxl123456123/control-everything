import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { migrateDefaultProfileDataRoot } from './default-data-root-migration'

const failure = vi.hoisted(() => ({ destination: '', publications: 0, restoreFails: false }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const denied = () => Object.assign(new Error('injected root move denied'), { code: 'EACCES' })
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (args[1] === failure.destination) throw denied()
      return actual.renameSync(...args)
    },
    symlinkSync: (...args: Parameters<typeof actual.symlinkSync>) => {
      if (args[1] === failure.destination && ++failure.publications > 1 && failure.restoreFails)
        throw denied()
      return actual.symlinkSync(...args)
    }
  }
})
vi.mock('./default-data-root-readers', () => ({
  defaultDataRootDaemonReaders: () => 'quiet',
  defaultCredentialRootProcessReaders: async () => 'quiet',
  retireIdleDefaultDataRootDaemons: async () => {}
}))
vi.mock('./default-data-root-record', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./default-data-root-record')>()),
  defaultDataRootMachineTag: () => '0123456789abcdef',
  prepareDefaultDataRootMigrationIdentity: async () => {}
}))

let parent: string
let previous: string
let current: string
beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'move-failure-'))
  previous = join(parent, '.orca')
  current = join(parent, '.zkyq')
  failure.destination = current
  failure.publications = 0
  failure.restoreFails = false
  mkdirSync(previous)
  writeFileSync(join(previous, 'state.txt'), 'latest state')
})
afterEach(() => rmSync(parent, { recursive: true, force: true }))

it('keeps one readable data view when the move is denied but its bridge can be restored', () => {
  expect(migrateDefaultProfileDataRoot(previous, current)).toBe(current)
  expect(readFileSync(join(current, 'state.txt'), 'utf8')).toBe('latest state')
  expect(readFileSync(join(previous, 'state.txt'), 'utf8')).toBe('latest state')
})

it('refuses startup when the move and bridge restoration both fail instead of creating an empty root', () => {
  failure.restoreFails = true
  expect(() => migrateDefaultProfileDataRoot(previous, current)).toThrow(
    'injected root move denied'
  )
  expect(existsSync(current)).toBe(false)
  expect(readFileSync(join(previous, 'state.txt'), 'utf8')).toBe('latest state')
})
