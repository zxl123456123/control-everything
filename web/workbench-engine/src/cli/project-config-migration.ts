import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { runProcessSync } from '@orca/process-host'
import { LEGACY_PROJECT_YAML_NAME, PROJECT_YAML_NAME } from '../shared/project-yaml-path'
import { RuntimeClientError } from './runtime/types'

/** Explicitly move a tracked project configuration using Git's index-aware move. */
export function migrateProjectConfig(
  path: string,
  dryRun: boolean
): { path: string; dryRun: boolean } {
  if (!isAbsolute(path)) {
    throw new RuntimeClientError('invalid_argument', 'Pass an absolute project root with --path.')
  }
  const root = realpathSync(path)
  const source = join(root, LEGACY_PROJECT_YAML_NAME)
  const target = join(root, PROJECT_YAML_NAME)
  let sourceInfo
  try {
    sourceInfo = lstatSync(source)
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      `No ${LEGACY_PROJECT_YAML_NAME} file at the project root.`
    )
  }
  if (!sourceInfo.isFile()) {
    throw new RuntimeClientError(
      'invalid_argument',
      'The old project configuration must be a regular file.'
    )
  }
  try {
    lstatSync(target)
    throw new RuntimeClientError(
      'invalid_argument',
      `${PROJECT_YAML_NAME} already exists; compare both files first.`
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  // Git location overrides could otherwise redirect the index outside the requested project.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
  )
  const run = (args: string[]) =>
    runProcessSync({ program: 'git', args: ['-C', root, ...args], env, timeoutMs: 30_000 })
  const top = run(['rev-parse', '--show-toplevel'])
  if (top.code !== 0 || realpathSync(top.stdout.trim()) !== root) {
    throw new RuntimeClientError('invalid_argument', '--path must name the Git worktree root.')
  }
  const indexedTarget = run(['ls-files', '-z', '--', PROJECT_YAML_NAME])
  if (indexedTarget.code !== 0 || indexedTarget.stdout.length > 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      `${PROJECT_YAML_NAME} already exists in the Git index or the index could not be checked.`
    )
  }
  const result = run([
    'mv',
    ...(dryRun ? ['--dry-run'] : []),
    '--',
    LEGACY_PROJECT_YAML_NAME,
    PROJECT_YAML_NAME
  ])
  if (result.code !== 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Git could not move the tracked configuration: ${result.stderr.trim() || 'check the project status.'}`
    )
  }
  return { path: root, dryRun }
}
