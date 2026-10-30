import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stampOrcadAppVersion } from './orcad-host-adapters'

describe('the Orca version a server reports', () => {
  let root: string
  let saved: string | undefined
  let savedLegacy: string | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orcad-app-version-'))
    saved = process.env.ZKYQ_APP_VERSION
    savedLegacy = process.env.ORCA_APP_VERSION
    delete process.env.ZKYQ_APP_VERSION
    delete process.env.ORCA_APP_VERSION
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    if (saved === undefined) {
      delete process.env.ZKYQ_APP_VERSION
    } else {
      process.env.ZKYQ_APP_VERSION = saved
    }
    if (savedLegacy === undefined) delete process.env.ORCA_APP_VERSION
    else process.env.ORCA_APP_VERSION = savedLegacy
  })

  it('is the release its bundle was built from, not a dev placeholder', () => {
    mkdirSync(join(root, 'out', 'cli'), { recursive: true })
    writeFileSync(join(root, 'out', 'package.json'), JSON.stringify({ version: '1.4.224' }))
    stampOrcadAppVersion(() => root)
    expect(process.env.ZKYQ_APP_VERSION).toBe('1.4.224')
  })

  it('replaces a version inherited from the Orca that started it', () => {
    process.env.ZKYQ_APP_VERSION = '1.4.300'
    process.env.ORCA_APP_VERSION = '0.0.1'
    mkdirSync(join(root, 'out'), { recursive: true })
    writeFileSync(join(root, 'out', 'package.json'), JSON.stringify({ version: '1.4.224' }))
    stampOrcadAppVersion(() => root)
    expect(process.env.ZKYQ_APP_VERSION).toBe('1.4.224')
    expect(process.env.ORCA_APP_VERSION).toBeUndefined()
  })

  it('leaves the environment alone when the bundle has no version', () => {
    process.env.ORCA_APP_VERSION = '0.0.1'
    stampOrcadAppVersion(() => root)
    expect(process.env.ZKYQ_APP_VERSION).toBeUndefined()
    expect(process.env.ORCA_APP_VERSION).toBeUndefined()
    stampOrcadAppVersion(() => {
      throw new Error('orcad_install_root_unavailable')
    })
    expect(process.env.ZKYQ_APP_VERSION).toBeUndefined()
  })
})
