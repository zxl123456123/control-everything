import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateRecipeEnvironment } from './recipe-env-migration'
import { VM_HANDLERS } from './handlers/vm'
import type { HandlerContext } from './dispatch'
import {
  runEphemeralVmRecipeCleanup,
  runEphemeralVmRecipeResume,
  runEphemeralVmRecipeStart,
  runEphemeralVmRecipeSuspend
} from '../shared/ephemeral-vm-recipe-runner'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeSync: vi.fn(actual.writeSync) }
})

const roots: string[] = []
function fixture(contents: string | Buffer, extension = '.sh'): string {
  const root = mkdtempSync(join(tmpdir(), 'zkyq-recipe-migration-'))
  roots.push(root)
  const path = join(root, `create${extension}`)
  writeFileSync(path, contents)
  return path
}
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('recipe environment migration', () => {
  it('migrates every supported recipe variable while preserving unrelated names', () => {
    const names = [
      'VM_MODE',
      'VM_INSTANCE_ID',
      'RECIPE_ID',
      'PROJECT_ID',
      'WORKSPACE_ID',
      'WORKSPACE_NAME',
      'REPO_PATH',
      'REPO_URL',
      'REPO_BRANCH',
      'REPO_REF',
      'REPO_REF_HEAD',
      'RECIPE_RESULT_SCHEMA_VERSION',
      'VERSION'
    ]
    const original =
      names.map((name) => `echo "$ORCA_${name}"`).join('\n') + '\necho "$ORCA_CUSTOM"\n'
    const path = fixture(original)
    const result = migrateRecipeEnvironment(path, false)
    expect(result.replacements).toHaveLength(names.length)
    expect(readFileSync(path, 'utf8')).toBe(
      names.map((name) => `echo "$ZKYQ_${name}"`).join('\n') + '\necho "$ORCA_CUSTOM"\n'
    )
  })

  it.each(['\n', '\r\n'])(
    'preserves all other bytes, mode and file identity with %j line endings',
    (eol) => {
      const original = [
        '\ufeff#!/bin/sh',
        'echo "中文 $ORCA_VM_MODE"',
        'echo "${ORCA_REPO_URL}"',
        ''
      ].join(eol)
      const path = fixture(original)
      chmodSync(path, 0o700)
      const before = statSync(path)
      const preview = migrateRecipeEnvironment(path, true)
      expect(readFileSync(path, 'utf8')).toBe(original)
      expect(preview.replacements).toEqual([
        { oldName: 'ORCA_VM_MODE', newName: 'ZKYQ_VM_MODE', line: 2 },
        { oldName: 'ORCA_REPO_URL', newName: 'ZKYQ_REPO_URL', line: 3 }
      ])
      expect(JSON.stringify(preview)).not.toContain('中文')
      expect(migrateRecipeEnvironment(path, false).dryRun).toBe(false)
      expect(readFileSync(path, 'utf8')).toBe(original.replaceAll('ORCA_', 'ZKYQ_'))
      const after = statSync(path)
      expect(after.ino).toBe(before.ino)
      expect(after.mode).toBe(before.mode)
      expect(migrateRecipeEnvironment(path, true).replacements).toEqual([])
    }
  )

  it.each([
    'echo "$ORCA_VM_MODE"\necho \'literal\'\n',
    'echo "$ORCA_VM_MODE" # comment\n',
    '# ORCA_VM_MODE\necho hi\n',
    'ORCA_VM_MODE=value\n',
    'echo "$ORCA_VM_MODE" \\\n  next\n',
    'cat <<EOF\n$ORCA_VM_MODE\nEOF\n',
    'echo "unterminated\necho $ORCA_VM_MODE\n',
    'echo "$(echo $ORCA_VM_MODE)"\n'
  ])('refuses ambiguous shell syntax without editing the file', (original) => {
    const path = fixture(original)
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('review it manually')
    expect(readFileSync(path, 'utf8')).toBe(original)
  })

  it('rejects binary, oversized, non-shell and relative paths', () => {
    for (const path of [
      fixture(Buffer.from([0xff, 0])),
      fixture('x'.repeat(256 * 1024 + 1)),
      fixture('x', '.js')
    ]) {
      expect(() => migrateRecipeEnvironment(path, false)).toThrow()
    }
    expect(() => migrateRecipeEnvironment('relative.sh', false)).toThrow(
      'absolute shell or PowerShell script'
    )
  })

  it.runIf(process.platform === 'win32')(
    'migrates parsed PowerShell reads without changing other bytes',
    () => {
      const original = '\ufeff# 中文\r\nWrite-Output "$env:ORCA_VM_MODE ${env:ORCA_REPO_URL}"\r\n'
      const path = fixture(original, '.ps1')
      const before = statSync(path)
      const preview = migrateRecipeEnvironment(path, true)
      expect(preview.replacements).toEqual([
        { oldName: 'ORCA_VM_MODE', newName: 'ZKYQ_VM_MODE', line: 2 },
        { oldName: 'ORCA_REPO_URL', newName: 'ZKYQ_REPO_URL', line: 2 }
      ])
      expect(readFileSync(path, 'utf8')).toBe(original)
      migrateRecipeEnvironment(path, false)
      expect(readFileSync(path, 'utf8')).toBe(original.replaceAll('ORCA_', 'ZKYQ_'))
      expect(statSync(path).ino).toBe(before.ino)
      expect(statSync(path).mode).toBe(before.mode)
    }
  )

  it
    .runIf(process.platform === 'win32')
    .each([
      '$env:ORCA_VM_MODE = "other"',
      '$env:ORCA_VM_MODE++',
      '[ref]$env:ORCA_VM_MODE',
      'Write-Output "ORCA_VM_MODE"',
      '# ORCA_VM_MODE\nWrite-Output "ok"',
      'Write-Output $env:orca_vm_mode',
      'Write-Output "$env:ORCA_VM_MODE'
    ])('refuses ambiguous or writing PowerShell references', (original) => {
    const path = fixture(original, '.ps1')
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('review')
    expect(readFileSync(path, 'utf8')).toBe(original)
  })

  it.runIf(process.platform === 'win32')(
    'preserves four synthetic lifecycle operations after migration',
    async () => {
      const script = [
        '$mode = $env:ORCA_VM_MODE',
        '$instance = $env:ORCA_VM_INSTANCE_ID',
        '$repo = $env:ORCA_REPO_URL',
        "if ($mode -eq 'create' -or $mode -eq 'resume') {",
        "  @{ schemaVersion = 1; connection = @{ type = 'ssh'; target = @{ label = 'fixture'; host = '127.0.0.1'; port = 22; username = 'fixture' }; projectRoot = '/fixture' }; userData = @{ instance = $instance; repo = $repo } } | ConvertTo-Json -Depth 5 -Compress",
        '} else {',
        '  Write-Output "$mode|$instance|$repo"',
        '}'
      ].join('\r\n')
      const path = fixture(script, '.ps1')
      const repoPath = join(path, '..')
      const command = `powershell.exe -NoProfile -NonInteractive -File "${path}"`
      const recipe = {
        id: 'fixture',
        name: 'fixture',
        create: command,
        suspend: command,
        resume: command,
        destroy: command
      }
      const execute = async () => {
        const start = await runEphemeralVmRecipeStart({
          recipe,
          repoPath,
          context: { instanceId: 'fixture-vm', repoUrl: 'https://example.test/repo' }
        })
        if (!start.ok) throw new Error(start.error)
        const args = { recipe, repoPath, context: start.context, recipeResult: start.result }
        const suspend = await runEphemeralVmRecipeSuspend(args)
        const resume = await runEphemeralVmRecipeResume(args)
        const destroy = await runEphemeralVmRecipeCleanup(args)
        expect(suspend.ok && resume.ok && destroy.ok).toBe(true)
        return {
          start: start.result,
          suspend: suspend.stdout,
          resume: resume.ok && !resume.skipped ? resume.result : null,
          destroy: destroy.stdout
        }
      }
      const before = await execute()
      expect(migrateRecipeEnvironment(path, true).replacements).toHaveLength(3)
      migrateRecipeEnvironment(path, false)
      expect(await execute()).toEqual(before)
    },
    30_000
  )

  it('refuses to mutate other hard-linked paths', () => {
    const original = 'echo "$ORCA_VM_MODE"\n'
    const path = fixture(original)
    const link = `${path}.link`
    linkSync(path, link)
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('one link')
    expect(readFileSync(path, 'utf8')).toBe(original)
    expect(readFileSync(link, 'utf8')).toBe(original)
  })

  it('reports a partial migration if a later write fails', async () => {
    const original = 'echo "$ORCA_VM_MODE"\necho "$ORCA_REPO_URL"\n'
    const path = fixture(original)
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
    vi.mocked(writeSync)
      .mockImplementationOnce(fs.writeSync)
      .mockImplementationOnce(() => {
        throw new Error('fixture write failure')
      })
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('stopped after 1 replacements')
    expect(readFileSync(path, 'utf8')).toBe('echo "$ZKYQ_VM_MODE"\necho "$ORCA_REPO_URL"\n')
    expect(migrateRecipeEnvironment(path, false).replacements).toHaveLength(1)
    expect(readFileSync(path, 'utf8')).toBe(original.replaceAll('ORCA_', 'ZKYQ_'))
  })

  it('restores a partially written variable prefix when a write fails', async () => {
    const original = 'echo "$ORCA_VM_MODE"\n'
    const path = fixture(original)
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
    const shortWrite = ((
      fd: number,
      _buffer: Uint8Array,
      _offset: number,
      _length: number,
      position: number
    ) => fs.writeSync(fd, Buffer.from('ZK'), 0, 2, position)) as typeof writeSync
    vi.mocked(writeSync)
      .mockImplementationOnce(shortWrite)
      .mockImplementationOnce(() => {
        throw new Error('fixture write failure')
      })
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('stopped after 0 replacements')
    expect(readFileSync(path, 'utf8')).toBe(original)
  })

  it('reports an incomplete reference if recovery also fails', async () => {
    const path = fixture('echo "$ORCA_VM_MODE"\n')
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
    const shortWrite = ((
      fd: number,
      _buffer: Uint8Array,
      _offset: number,
      _length: number,
      position: number
    ) => fs.writeSync(fd, Buffer.from('ZK'), 0, 2, position)) as typeof writeSync
    vi.mocked(writeSync)
      .mockImplementationOnce(shortWrite)
      .mockImplementationOnce(() => {
        throw new Error('fixture write failure')
      })
      .mockImplementationOnce(() => {
        throw new Error('fixture recovery failure')
      })
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('last reference may be incomplete')
    expect(readFileSync(path, 'utf8')).toBe('echo "$ZKCA_VM_MODE"\n')
  })

  it('does not rename a changed variable when a script is concurrently edited', async () => {
    const original = 'echo "$ORCA_VM_MODE"\necho "$ORCA_REPO_URL"\n'
    const path = fixture(original)
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
    const secondOffset = Buffer.byteLength(original.slice(0, original.indexOf('ORCA_REPO_URL')))
    const concurrentWrite = ((
      fd: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number
    ) => {
      const written = fs.writeSync(fd, buffer, offset, length, position)
      fs.writeSync(fd, Buffer.from('X'), 0, 1, secondOffset + 5)
      return written
    }) as typeof writeSync
    vi.mocked(writeSync).mockImplementationOnce(concurrentWrite)
    expect(() => migrateRecipeEnvironment(path, false)).toThrow('script changed during migration')
    expect(readFileSync(path, 'utf8')).toBe('echo "$ZKYQ_VM_MODE"\necho "$ORCA_XEPO_URL"\n')
  })

  it('refuses valued dry-run and remote selection before writing', async () => {
    const path = fixture('echo "$ORCA_VM_MODE"\n')
    const context = {
      flags: new Map([
        ['path', path],
        ['dry-run', 'true']
      ]),
      json: true
    } as HandlerContext
    await expect(VM_HANDLERS['vm recipe migrate-env'](context)).rejects.toThrow(
      'does not accept a value'
    )
    context.flags.delete('dry-run')
    vi.stubEnv('ZKYQ_CLI_CWD', '/remote/project')
    await expect(VM_HANDLERS['vm recipe migrate-env'](context)).rejects.toThrow('runs locally')
    expect(readFileSync(path, 'utf8')).toBe('echo "$ORCA_VM_MODE"\n')
  })
})
