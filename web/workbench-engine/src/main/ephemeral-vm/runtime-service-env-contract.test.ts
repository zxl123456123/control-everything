import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseOrcaYaml } from '../../shared/orca-yaml'
import { getEphemeralVmRuntimeFeatureStorePath } from '../../shared/ephemeral-vm-runtime-feature-store'
import { listEphemeralVmRuntimes } from '../../shared/ephemeral-vm-runtime-store'
import {
  cleanupEphemeralVmRuntime,
  provisionEphemeralVmRuntime,
  resumeEphemeralVmRuntime,
  suspendEphemeralVmRuntime
} from './runtime-service'

const roots: string[] = []
function directory(): string {
  const root = mkdtempSync(join(tmpdir(), 'zkyq-env-contract-'))
  roots.push(root)
  return root
}
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('uses the contract through the saved runtime across all lifecycle operations', async () => {
  const userDataPath = directory()
  const repoPath = directory()
  const scriptPath = join(repoPath, 'fixture.js')
  const logPath = join(repoPath, 'events.jsonl')
  writeFileSync(
    scriptPath,
    `
    const fs = require('node:fs')
    if (process.env.ORCA_VM_MODE !== undefined || process.env.ORCA_VM_INSTANCE_ID !== undefined) process.exit(21)
    const mode = process.env.ZKYQ_VM_MODE
    fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({mode, id: process.env.ZKYQ_VM_INSTANCE_ID}) + '\\n')
    if (mode === 'create' || mode === 'resume') console.log(JSON.stringify({schemaVersion: 1, connection: {type: 'ssh', target: {label: 'fixture', host: '127.0.0.1', port: 22, username: 'fixture'}, projectRoot: '/fixture'}}))
  `
  )
  const command = `"${process.execPath}" "${scriptPath}"`
  const yaml = [
    'environmentRecipes:',
    '  - id: fixture',
    '    name: Fixture',
    '    environmentContract: zkyq',
    ...['create', 'suspend', 'resume', 'destroy'].map(
      (key) => `    ${key}: ${JSON.stringify(command)}`
    )
  ].join('\n')
  const recipe = parseOrcaYaml(yaml)?.environmentRecipes?.[0]
  expect(recipe?.environmentContract).toBe('zkyq')
  if (!recipe) throw new Error('recipe parsing failed')
  vi.stubEnv('ORCA_VM_MODE', 'inherited-old-mode')
  vi.stubEnv('ORCA_VM_INSTANCE_ID', 'inherited-old-id')
  const created = await provisionEphemeralVmRuntime({ userDataPath, repoPath, recipe })
  expect(created.ok).toBe(true)
  if (!created.ok) throw new Error(created.start.error)
  const stored = listEphemeralVmRuntimes(userDataPath)[0]
  expect(stored.recipe?.environmentContract).toBe('zkyq')
  const args = { userDataPath, repoPath, recipe: stored.recipe!, runtimeId: stored.id }
  expect((await suspendEphemeralVmRuntime(args)).ok).toBe(true)
  expect((await resumeEphemeralVmRuntime(args)).ok).toBe(true)
  expect((await cleanupEphemeralVmRuntime(args)).ok).toBe(true)
  const events = readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(events).toEqual(
    ['create', 'suspend', 'resume', 'destroy'].map((mode) => ({ mode, id: stored.id }))
  )
})

it('refuses to provision before running a script when contract metadata cannot be saved', async () => {
  const userDataPath = directory()
  const repoPath = directory()
  writeFileSync(getEphemeralVmRuntimeFeatureStorePath(userDataPath), '{invalid')
  const marker = join(repoPath, 'ran')
  const scriptPath = join(repoPath, 'fixture.js')
  writeFileSync(scriptPath, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)
  const recipe = {
    id: 'fixture',
    name: 'Fixture',
    create: `"${process.execPath}" "${scriptPath}"`,
    environmentContract: 'zkyq' as const
  }
  await expect(provisionEphemeralVmRuntime({ userDataPath, repoPath, recipe })).rejects.toThrow(
    'compatibility metadata'
  )
  expect(existsSync(marker)).toBe(false)
})

it('rejects an unknown environment contract while parsing project configuration', () => {
  const parsed = parseOrcaYaml(
    'environmentRecipes:\n  - id: fixture\n    name: Fixture\n    create: ./create.sh\n    environmentContract: future\n'
  )
  expect(parsed?.environmentRecipes ?? []).toEqual([])
  expect(parsed?.environmentRecipeDiagnostics).toContainEqual(
    expect.objectContaining({ field: 'environmentContract' })
  )
})
