import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Upstream compatibility identity; the host commit is separate build provenance. */
export function resolveBuildSourceCommit() {
  const origin = JSON.parse(
    readFileSync(new URL('../../build-origin.json', import.meta.url), 'utf8')
  )
  if (
    origin.repository !== 'https://github.com/stablyai/orca' ||
    !/^[0-9a-f]{40}$/.test(origin.upstreamCommit)
  ) {
    throw new Error('invalid_upstream_commit')
  }
  return origin.upstreamCommit
}

/** The platform checkout supplies the adapted skills; never install them from the upstream pin. */
export function resolveWorkbenchBuildCommit() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true
  }).trim()
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('invalid_workbench_commit')
  }
  return commit
}
