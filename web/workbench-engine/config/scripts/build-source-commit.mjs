import { readFileSync } from 'node:fs'

/** Upstream compatibility identity; the host commit is separate build provenance. */
export function resolveBuildSourceCommit() {
  const origin = JSON.parse(readFileSync(new URL('../../build-origin.json', import.meta.url), 'utf8'))
  if (origin.repository !== 'https://github.com/stablyai/orca' || !/^[0-9a-f]{40}$/.test(origin.upstreamCommit)) {
    throw new Error('invalid_upstream_commit')
  }
  return origin.upstreamCommit
}
