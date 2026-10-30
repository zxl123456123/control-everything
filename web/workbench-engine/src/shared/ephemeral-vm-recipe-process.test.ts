import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRecipeCommand } from './ephemeral-vm-recipe-process'

const tmpRoots: string[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const root of tmpRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-vm-recipe-process-'))
  tmpRoots.push(root)
  return root
}

function nodeCommand(scriptPath: string): string {
  return `"${process.execPath}" "${scriptPath}"`
}

describe('runRecipeCommand', () => {
  it.each([
    { mode: 'create' as const, resultSchemaVersion: 1 as const },
    { mode: 'suspend' as const, resultSchemaVersion: 1 as const },
    { mode: 'resume' as const, resultSchemaVersion: 2 as const },
    { mode: 'destroy' as const, resultSchemaVersion: 2 as const }
  ])('passes the same recipe context to new and existing $mode scripts', async (args) => {
    const repoPath = makeRepo()
    const scriptPath = join(repoPath, 'environment.js')
    const values = {
      VM_MODE: args.mode,
      VM_INSTANCE_ID: 'orca-existing-resource',
      RECIPE_ID: 'cloud-sandbox',
      PROJECT_ID: 'project-1',
      WORKSPACE_ID: 'workspace-1',
      WORKSPACE_NAME: 'Workspace One',
      REPO_PATH: repoPath,
      REPO_URL: 'https://example.test/repo.git',
      REPO_BRANCH: 'workspace-branch',
      REPO_REF: 'main',
      REPO_REF_HEAD: 'abc123',
      RECIPE_RESULT_SCHEMA_VERSION: String(args.resultSchemaVersion),
      VERSION: '1.2.3'
    }
    writeFileSync(
      scriptPath,
      `const keys = ${JSON.stringify(Object.keys(values))}; console.log(JSON.stringify(Object.fromEntries(keys.map(key => [key, [process.env['ZKYQ_' + key], process.env['ORCA_' + key]]]))))`
    )
    const result = await runRecipeCommand({
      command: nodeCommand(scriptPath),
      repoPath,
      ...args,
      env: { ZKYQ_VM_MODE: 'wrong', ORCA_VM_MODE: 'wrong' },
      context: {
        instanceId: values.VM_INSTANCE_ID,
        recipeId: values.RECIPE_ID,
        projectId: values.PROJECT_ID,
        workspaceId: values.WORKSPACE_ID,
        workspaceName: values.WORKSPACE_NAME,
        repoPath,
        repoUrl: values.REPO_URL,
        branch: values.REPO_BRANCH,
        ref: values.REPO_REF,
        expectedRefHead: values.REPO_REF_HEAD,
        orcaVersion: values.VERSION
      }
    })
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [value, value]]))
    )
  })

  it('does not impose an implicit wall-clock deadline', async () => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
      unref: vi.fn()
    })
    const resultPromise = runRecipeCommand({
      command: 'destroy',
      repoPath: makeRepo(),
      mode: 'destroy',
      resultSchemaVersion: 1,
      context: { recipeId: 'cloud-sandbox', repoPath: makeRepo() },
      spawnCommand: vi.fn(() => child) as never
    })

    expect(vi.getTimerCount()).toBe(0)
    child.emit('close', 0, null)
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 })
  })

  it('force-kills an aborted recipe if graceful termination never closes it', async () => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
      unref: vi.fn()
    })
    const controller = new AbortController()
    const resultPromise = runRecipeCommand({
      command: 'destroy',
      repoPath: makeRepo(),
      mode: 'destroy',
      resultSchemaVersion: 1,
      context: { recipeId: 'cloud-sandbox', repoPath: makeRepo() },
      signal: controller.signal,
      spawnCommand: vi.fn(() => child) as never
    })

    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(resultPromise).resolves.toMatchObject({ aborted: true, exitCode: null })
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('clears the force-kill timer when graceful termination closes synchronously', async () => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
      unref: vi.fn()
    })
    child.kill.mockImplementation(() => {
      child.emit('close', null, 'SIGTERM')
      return true
    })
    const controller = new AbortController()
    const resultPromise = runRecipeCommand({
      command: 'destroy',
      repoPath: makeRepo(),
      mode: 'destroy',
      resultSchemaVersion: 1,
      context: { recipeId: 'cloud-sandbox', repoPath: makeRepo() },
      signal: controller.signal,
      spawnCommand: vi.fn(() => child) as never
    })

    controller.abort()

    await expect(resultPromise).resolves.toMatchObject({ aborted: true, signal: 'SIGTERM' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { output: 'abcdef', maxCaptureBytes: 4, expected: 'cdef' },
    { output: 'A😀B', maxCaptureBytes: 5, expected: '😀B' },
    { output: '😀😀😀', maxCaptureBytes: 5, expected: '😀' }
  ])(
    'retains a complete UTF-8 tail within $maxCaptureBytes bytes',
    async ({ output, maxCaptureBytes, expected }) => {
      const repoPath = makeRepo()
      const scriptPath = join(repoPath, 'output.js')
      writeFileSync(scriptPath, `process.stdout.write(${JSON.stringify(output)})`)

      const result = await runRecipeCommand({
        command: nodeCommand(scriptPath),
        repoPath,
        mode: 'create',
        resultSchemaVersion: 1,
        context: {
          recipeId: 'cloud-sandbox',
          repoPath
        },
        maxCaptureBytes
      })

      expect(result.stdout).toBe(expected)
      expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(maxCaptureBytes)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'cancels shell child processes without waiting for long-running descendants',
    async () => {
      const repoPath = makeRepo()
      const scriptPath = join(repoPath, 'slow.js')
      writeFileSync(
        scriptPath,
        [
          "process.stderr.write('ready\\n')",
          'setTimeout(() => {',
          "  console.log('done')",
          '}, 5000)'
        ].join('\n')
      )
      const controller = new AbortController()

      const result = await Promise.race([
        runRecipeCommand({
          command: nodeCommand(scriptPath),
          repoPath,
          mode: 'create',
          resultSchemaVersion: 1,
          context: {
            recipeId: 'cloud-sandbox',
            repoPath
          },
          signal: controller.signal,
          onStderr: (chunk) => {
            if (chunk.includes('ready')) {
              controller.abort()
            }
          }
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('recipe cancellation timed out')), 1500)
        })
      ])

      expect(result).toMatchObject({ signal: 'SIGTERM', aborted: true })
    }
  )
})
