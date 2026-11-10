import { existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

export const PROJECT_YAML_NAME = 'zkyq.yaml'
export const LEGACY_PROJECT_YAML_NAME = 'orca.yaml'

function mayExist(path: string): boolean {
  if (existsSync(path)) return true
  try {
    lstatSync(path)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code !== 'ENOENT' && code !== 'ENOTDIR'
  }
}

/** The new file wins when both exist, even if it cannot be parsed. */
export function inspectProjectYaml(repoPath: string): {
  name: typeof PROJECT_YAML_NAME | typeof LEGACY_PROJECT_YAML_NAME | null
  conflict: boolean
} {
  const current = mayExist(join(repoPath, PROJECT_YAML_NAME))
  const legacy = mayExist(join(repoPath, LEGACY_PROJECT_YAML_NAME))
  return {
    name: current ? PROJECT_YAML_NAME : legacy ? LEGACY_PROJECT_YAML_NAME : null,
    conflict: current && legacy
  }
}

export function findProjectYamlName(
  repoPath: string
): ReturnType<typeof inspectProjectYaml>['name'] {
  return inspectProjectYaml(repoPath).name
}

export function findProjectYaml(repoPath: string): string | null {
  const name = findProjectYamlName(repoPath)
  return name ? join(repoPath, name) : null
}
