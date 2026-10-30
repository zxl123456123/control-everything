import {
  accessSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync
} from 'node:fs'
import { isAbsolute, join, normalize, relative, resolve } from 'node:path'
import type {
  EphemeralVmRecipeDoctorCheck,
  EphemeralVmRecipeDoctorResult
} from './ephemeral-vm-recipes'
import type { OrcaVmRecipe } from './orca-yaml-hook-types'

export function doctorEphemeralVmRecipe(args: {
  repoPath: string
  recipeId: string
  recipes: readonly OrcaVmRecipe[]
  localExecutionSupported?: boolean
}): EphemeralVmRecipeDoctorResult {
  const checks: EphemeralVmRecipeDoctorCheck[] = []
  if (!args.localExecutionSupported) {
    checks.push({
      id: 'recipe.execution_target',
      status: 'fail',
      message: 'Ephemeral VM recipes run on the local desktop host in v1.',
      remediation: 'Use a local repo checkout for the recipe, or add remote recipe execution later.'
    })
    return buildDoctorResult(args.recipeId, args.repoPath, checks)
  }
  if (!existsSync(args.repoPath) || !statSync(args.repoPath).isDirectory()) {
    checks.push({
      id: 'repo.path',
      status: 'fail',
      message: `Repo path does not exist or is not a directory: ${args.repoPath}`,
      remediation: 'Pass the local repo that contains the project configuration.'
    })
    return buildDoctorResult(args.recipeId, args.repoPath, checks)
  }

  const recipe = args.recipes.find((entry) => entry.id === args.recipeId)
  checks.push({
    id: 'recipe.exists',
    status: recipe ? 'pass' : 'fail',
    message: recipe
      ? `Found recipe "${recipe.name}".`
      : `Recipe "${args.recipeId}" was not found in environmentRecipes.`,
    ...(recipe ? {} : { remediation: 'Check the recipe id or add it to environmentRecipes.' })
  })
  if (!recipe) {
    return buildDoctorResult(args.recipeId, args.repoPath, checks)
  }

  checks.push(checkCommandPath(args.repoPath, recipe.create, 'recipe.create'))
  if (recipe.destroyDisabled) {
    checks.push({
      id: 'recipe.destroy',
      status: 'warn',
      message: 'Destroy is explicitly disabled.',
      remediation: 'Only use destroy: none when provider resources are cleaned up elsewhere.'
    })
  } else if (recipe.destroy) {
    checks.push(checkCommandPath(args.repoPath, recipe.destroy, 'recipe.destroy'))
  } else {
    checks.push({
      id: 'recipe.destroy',
      status: 'warn',
      message: 'No destroy action is configured.',
      remediation: 'Add destroy or explicitly set destroy: none.'
    })
  }

  if (recipe.suspend) {
    checks.push(checkCommandPath(args.repoPath, recipe.suspend, 'recipe.suspend'))
  }
  if (recipe.resume) {
    checks.push(checkCommandPath(args.repoPath, recipe.resume, 'recipe.resume'))
  }
  // Why: a workspace suspended by `suspend` can only be woken if `resume` exists;
  // defining one without the other strands the workspace asleep.
  if (Boolean(recipe.suspend) !== Boolean(recipe.resume)) {
    checks.push({
      id: 'recipe.suspend_resume_pairing',
      status: 'warn',
      message: 'Recipe defines only one of suspend/resume.',
      remediation: 'Define both so a suspended workspace can be resumed, or neither.'
    })
  }

  for (const [phase, command] of [
    ['create', recipe.create],
    ['suspend', recipe.suspend],
    ['resume', recipe.resume],
    ['destroy', recipe.destroy]
  ] as const) {
    if (command) checks.push(...inspectLegacyRecipeEnvironment(args.repoPath, phase, command))
  }
  checks.push({
    id: 'recipe.environment_inspection_scope',
    status: 'warn',
    message: 'Only explicit commands and identifiable entry scripts are inspected.',
    remediation: 'Also review indirectly called scripts and dynamically constructed variable names.'
  })

  return buildDoctorResult(args.recipeId, args.repoPath, checks)
}

const LEGACY_RECIPE_VARIABLE =
  /(?<![A-Za-z0-9_])ORCA_(?:VM_MODE|VM_INSTANCE_ID|RECIPE_ID|PROJECT_ID|WORKSPACE_ID|WORKSPACE_NAME|REPO_PATH|REPO_URL|REPO_BRANCH|REPO_REF_HEAD|REPO_REF|RECIPE_RESULT_SCHEMA_VERSION|VERSION)(?![A-Za-z0-9_])/gi
const MAX_RECIPE_SCRIPT_BYTES = 256 * 1024

function inspectLegacyRecipeEnvironment(
  repoPath: string,
  phase: string,
  command: string
): EphemeralVmRecipeDoctorCheck[] {
  const names = new Set(
    (command.match(LEGACY_RECIPE_VARIABLE) ?? []).map((name) => name.toUpperCase())
  )
  let inspected = false
  const token = /^(?:"([^"]+)"|'([^']+)'|([^\s]+))(?:\s+|$)/
  let rest = command.trim()
  const first = token.exec(rest)
  let script = first?.[1] ?? first?.[2] ?? first?.[3]
  rest = first ? rest.slice(first[0].length) : ''
  if (
    script &&
    /^(?:bash|sh|zsh|node|python(?:3(?:\.\d+)?)?|pwsh|powershell)(?:\.exe)?$/i.test(script)
  ) {
    if (/^-file\s+/i.test(rest)) rest = rest.replace(/^-file\s+/i, '')
    const second = token.exec(rest)
    script = second?.[1] ?? second?.[2] ?? second?.[3]
    rest = second ? rest.slice(second[0].length) : ''
  }
  if (
    script &&
    /^\.[/\\]/.test(script) &&
    /\.(?:sh|bash|zsh|ps1|cmd|bat|js|cjs|mjs|ts|py)$/i.test(script) &&
    !/[;&|<>`$()]/.test(script) &&
    !/[;&|<>`]/.test(rest)
  ) {
    try {
      const root = realpathSync(repoPath)
      const path = realpathSync(resolve(root, script))
      const inside = relative(root, path)
      if (
        !inside ||
        inside === '..' ||
        inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
        isAbsolute(inside)
      ) {
        throw new Error('outside repo')
      }
      const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK ?? 0))
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || stat.size > MAX_RECIPE_SCRIPT_BYTES)
          throw new Error('not a bounded file')
        const buffer = Buffer.alloc(MAX_RECIPE_SCRIPT_BYTES + 1)
        let length = 0
        while (length < buffer.length) {
          const read = readSync(fd, buffer, length, buffer.length - length, null)
          if (!read) break
          length += read
        }
        if (length > MAX_RECIPE_SCRIPT_BYTES || buffer.subarray(0, length).includes(0))
          throw new Error('not text')
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))
        for (const name of content.match(LEGACY_RECIPE_VARIABLE) ?? [])
          names.add(name.toUpperCase())
        inspected = true
      } finally {
        closeSync(fd)
      }
    } catch {
      // A diagnostic must not execute or rewrite an uninspectable recipe.
    }
  }
  const checks: EphemeralVmRecipeDoctorCheck[] = []
  if (names.size) {
    const mappings = [...names].sort().map((name) => `${name} → ${name.replace(/^ORCA_/, 'ZKYQ_')}`)
    checks.push({
      id: `recipe.${phase}.legacy_environment`,
      status: 'warn',
      message: `Possible legacy recipe variables: ${mappings.join(', ')}.`,
      remediation:
        'For a simple local shell script, run `zkyq vm recipe migrate-env --path <absolute-script-path> --dry-run`; review indirect calls separately.'
    })
  }
  if (!inspected) {
    checks.push({
      id: `recipe.${phase}.environment_uninspected`,
      status: 'warn',
      message: 'Could not inspect this recipe script for legacy environment variables.',
      remediation: 'Review its commands and any scripts they call; no files were changed.'
    })
  }
  return checks
}

export function firstRecipeCommandToken(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed) {
    return null
  }
  const quoted = trimmed.match(/^"([^"]+)"/) ?? trimmed.match(/^'([^']+)'/)
  if (quoted) {
    return quoted[1] ?? null
  }
  return trimmed.split(/\s+/)[0] ?? null
}

function checkCommandPath(
  repoPath: string,
  command: string,
  id: string
): EphemeralVmRecipeDoctorCheck {
  const executable = firstRecipeCommandToken(command)
  if (!executable) {
    return {
      id,
      status: 'fail',
      message: 'Command is empty.',
      remediation: 'Set a repo-relative command path.'
    }
  }
  if (isAbsolute(executable)) {
    return {
      id,
      status: 'warn',
      message: `Command uses an absolute path: ${executable}`,
      remediation: 'Prefer a repo-relative script so the recipe works across machines.'
    }
  }
  if (!executable.startsWith('./') && !executable.startsWith('.\\')) {
    return {
      id,
      status: 'warn',
      message: `Command is not a repo-relative path: ${executable}`,
      remediation: 'Use a repo-relative script such as ./scripts/zkyq-vm/start.sh.'
    }
  }
  const scriptPath = join(repoPath, normalize(executable))
  if (!existsSync(scriptPath)) {
    return {
      id,
      status: 'fail',
      message: `Command path does not exist: ${executable}`,
      remediation: 'Create the script or update the recipe command path.'
    }
  }
  // Why: a non-executable script fails create with a confusing EACCES. The exec
  // bit is a POSIX concept — skip on Windows, where it does not apply.
  if (process.platform !== 'win32') {
    try {
      accessSync(scriptPath, fsConstants.X_OK)
    } catch {
      return {
        id,
        status: 'warn',
        message: `Command exists but is not executable: ${executable}`,
        remediation: 'Make it executable: chmod +x (git: git update-index --chmod=+x).'
      }
    }
  }
  return {
    id,
    status: 'pass',
    message: `Command path exists: ${executable}`
  }
}

function buildDoctorResult(
  recipeId: string,
  repoPath: string,
  checks: EphemeralVmRecipeDoctorCheck[]
): EphemeralVmRecipeDoctorResult {
  return {
    recipeId,
    repoPath,
    ok: checks.every((check) => check.status !== 'fail'),
    checks
  }
}
