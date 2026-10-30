import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { doctorEphemeralVmRecipe } from './ephemeral-vm-recipe-doctor'
import type { OrcaVmRecipe } from './orca-yaml-hook-types'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeRepo(scripts: Record<string, { body?: string; mode?: number }>): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-vm-doctor-'))
  roots.push(root)
  for (const [relPath, opts] of Object.entries(scripts)) {
    const full = join(root, relPath)
    writeFileSync(full, opts.body ?? '#!/usr/bin/env bash\necho hi\n')
    if (opts.mode !== undefined) {
      chmodSync(full, opts.mode)
    }
  }
  return root
}

function checkById(
  result: ReturnType<typeof doctorEphemeralVmRecipe>,
  id: string
): { status: string } | undefined {
  return result.checks.find((check) => check.id === id)
}

function run(repoPath: string, recipe: OrcaVmRecipe): ReturnType<typeof doctorEphemeralVmRecipe> {
  return doctorEphemeralVmRecipe({
    repoPath,
    recipeId: recipe.id,
    recipes: [recipe],
    localExecutionSupported: true
  })
}

describe('doctorEphemeralVmRecipe', () => {
  it('passes a fully wired recipe with executable scripts', () => {
    const repo = makeRepo({
      'create.sh': { mode: 0o755 },
      'destroy.sh': { mode: 0o755 }
    })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      destroy: './destroy.sh'
    })
    expect(result.ok).toBe(true)
    expect(checkById(result, 'recipe.create')?.status).toBe('pass')
    expect(checkById(result, 'recipe.destroy')?.status).toBe('pass')
  })

  it('checks suspend and resume command paths when both are defined', () => {
    const repo = makeRepo({
      'create.sh': { mode: 0o755 },
      'suspend.sh': { mode: 0o755 },
      'resume.sh': { mode: 0o755 }
    })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      suspend: './suspend.sh',
      resume: './resume.sh',
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.suspend')?.status).toBe('pass')
    expect(checkById(result, 'recipe.resume')?.status).toBe('pass')
    expect(checkById(result, 'recipe.suspend_resume_pairing')).toBeUndefined()
    expect(result.ok).toBe(true)
  })

  it('warns when only one of suspend/resume is defined (asymmetry strands the workspace)', () => {
    const repo = makeRepo({ 'create.sh': { mode: 0o755 }, 'suspend.sh': { mode: 0o755 } })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      suspend: './suspend.sh',
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.suspend_resume_pairing')?.status).toBe('warn')
    // warn never flips ok
    expect(result.ok).toBe(true)
  })

  it('warns (not fails) when a script exists but is not executable on POSIX', () => {
    if (process.platform === 'win32') {
      return
    }
    const repo = makeRepo({
      'create.sh': { mode: 0o644 },
      'destroy.sh': { mode: 0o755 }
    })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      destroy: './destroy.sh'
    })
    expect(checkById(result, 'recipe.create')?.status).toBe('warn')
    expect(result.ok).toBe(true)
  })

  it('fails when a referenced script does not exist', () => {
    const repo = makeRepo({ 'create.sh': { mode: 0o755 } })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      destroy: './missing.sh'
    })
    expect(checkById(result, 'recipe.destroy')?.status).toBe('fail')
    expect(result.ok).toBe(false)
  })

  it('identifies legacy variables in each lifecycle script without printing its content', () => {
    const repo = makeRepo({
      'create.sh': { body: '#!/bin/sh\necho "$ORCA_REPO_URL"\nsecret=private-fixture-value\n' },
      'suspend.js': { body: 'process.env.ORCA_VM_MODE\n' },
      'resume.ps1': { body: '$env:ORCA_VM_INSTANCE_ID\n' },
      'destroy.sh': { body: 'echo ${ORCA_RECIPE_RESULT_SCHEMA_VERSION}\n' }
    })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      suspend: 'node ./suspend.js',
      resume: 'powershell -File ./resume.ps1',
      destroy: 'bash ./destroy.sh'
    })
    expect(result.ok).toBe(true)
    for (const [phase, oldName, newName] of [
      ['create', 'ORCA_REPO_URL', 'ZKYQ_REPO_URL'],
      ['suspend', 'ORCA_VM_MODE', 'ZKYQ_VM_MODE'],
      ['resume', 'ORCA_VM_INSTANCE_ID', 'ZKYQ_VM_INSTANCE_ID'],
      ['destroy', 'ORCA_RECIPE_RESULT_SCHEMA_VERSION', 'ZKYQ_RECIPE_RESULT_SCHEMA_VERSION']
    ]) {
      expect(result.checks).toContainEqual(
        expect.objectContaining({
          id: `recipe.${phase}.legacy_environment`,
          status: 'warn',
          message: expect.stringContaining(`${oldName} → ${newName}`)
        })
      )
    }
    expect(JSON.stringify(result)).not.toContain('private-fixture-value')
    expect(result.checks.some((check) => check.id.endsWith('.environment_uninspected'))).toBe(false)
  })

  it('does not mistake longer custom variable names for managed recipe variables', () => {
    const repo = makeRepo({
      'create.sh': { body: 'echo "$ORCA_VM_MODE_EXTRA" "$MY_ORCA_VERSION" "$ORCA_VERSION2"\n' }
    })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.create.legacy_environment')).toBeUndefined()
    expect(checkById(result, 'recipe.create.environment_uninspected')).toBeUndefined()
  })

  it('inspects a repository script invoked through Python', () => {
    const repo = makeRepo({
      'create.py': { body: 'import os\nprint(os.getenv("ORCA_VERSION"))\n' }
    })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: 'python3 ./create.py',
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.create.legacy_environment')?.status).toBe('warn')
    expect(checkById(result, 'recipe.create.environment_uninspected')).toBeUndefined()
  })

  it.each([
    { body: '\0ORCA_VM_MODE', command: './create.sh' },
    { body: 'x'.repeat(256 * 1024 + 1), command: './create.sh' },
    { body: 'echo hi', command: './create.sh && ./other.sh' },
    { body: 'echo hi', command: 'bash -c "echo hello"' },
    { body: 'echo hi', command: './../outside.sh' }
  ])('warns when a recipe command cannot be safely inspected', ({ body, command }) => {
    const repo = makeRepo({ 'create.sh': { body } })
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: command,
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.create.environment_uninspected')?.status).toBe('warn')
  })

  it('reports a legacy variable in an indirect command even when its script is uninspectable', () => {
    const repo = makeRepo({})
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: 'echo "$ORCA_REPO_REF"',
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.create.legacy_environment')?.status).toBe('warn')
    expect(checkById(result, 'recipe.create.environment_uninspected')?.status).toBe('warn')
  })

  it('does not read scripts outside the project root', () => {
    const repo = makeRepo({})
    const external = makeRepo({ 'external.sh': { body: 'ORCA_REPO_URL=outside-secret\n' } })
    const command = `./${relative(repo, join(external, 'external.sh')).replaceAll('\\', '/')}`
    const result = run(repo, { id: 'cloud', name: 'Cloud', create: command, destroyDisabled: true })
    expect(checkById(result, 'recipe.create.environment_uninspected')?.status).toBe('warn')
    expect(checkById(result, 'recipe.create.legacy_environment')).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('outside-secret')
    expect(checkById(result, 'recipe.environment_inspection_scope')?.status).toBe('warn')
  })

  it('warns when a script is not valid UTF-8', () => {
    const repo = makeRepo({ 'create.sh': {} })
    writeFileSync(join(repo, 'create.sh'), Buffer.from([0xff, 0xfe]))
    const result = run(repo, {
      id: 'cloud',
      name: 'Cloud',
      create: './create.sh',
      destroyDisabled: true
    })
    expect(checkById(result, 'recipe.create.environment_uninspected')?.status).toBe('warn')
  })
})
