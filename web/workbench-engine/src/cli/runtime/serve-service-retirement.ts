import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  RETIRED_SERVE_LAUNCHD_LABEL_PREFIX,
  SERVE_LAUNCHD_LABEL_PREFIX
} from '../../shared/serve-bundle-coordination'
import { RuntimeClientError } from './types'
import type { ServeServiceSpec } from './serve-service-unit'

export type RetiredServeService = Pick<ServeServiceSpec, 'name' | 'unitPath' | 'manager'> & {
  content: string
  port: string | null
  pairingAddress: string | null
}

/** Only the selected profile's former generated unit is eligible for retirement. */
export function findRetiredServeService(spec: ServeServiceSpec): RetiredServeService | null {
  const name =
    spec.manager === 'launchd'
      ? spec.name.replace(SERVE_LAUNCHD_LABEL_PREFIX, RETIRED_SERVE_LAUNCHD_LABEL_PREFIX)
      : spec.name.replace(/^zkyq-serve/, 'orca-serve')
  const unitPath = join(dirname(spec.unitPath), name + (spec.manager === 'launchd' ? '.plist' : ''))
  let file
  try {
    file = lstatSync(unitPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  if (!file.isFile()) throw migrationConflict(unitPath)
  const content = readFileSync(unitPath, 'utf8')
  const profile =
    spec.manager === 'launchd'
      ? /<key>ZKYQ_USER_DATA_PATH<\/key>\n    <string>[\s\S]*?<\/string>/.exec(spec.content)?.[0]
      : spec.content
          .split('\n')
          .find((line) => line.startsWith('Environment=') && line.includes('ZKYQ_USER_DATA_PATH='))
  const marker =
    spec.manager === 'launchd'
      ? content.includes(`<key>Label</key>\n  <string>${name}</string>`) &&
        content.includes(
          '<string>serve</string>\n    <string>--supervise</string>\n    <string>--no-pairing</string>'
        )
      : /^ExecStart=.+ serve --supervise --no-pairing(?: |$)/m.test(content) &&
        content.includes('\nKillMode=process\n')
  const profiles =
    spec.manager === 'launchd'
      ? [
          ...content.matchAll(
            /<key>(?:ZKYQ|ORCA)_USER_DATA_PATH<\/key>\n    <string>[\s\S]*?<\/string>/g
          )
        ].map((match) => match[0])
      : content
          .split('\n')
          .filter((line) => /^Environment="?(?:ZKYQ|ORCA)_USER_DATA_PATH=/.test(line))
  const profileMatches =
    profile &&
    profiles.length === 1 &&
    (profiles[0] === profile ||
      profiles[0] === profile.replace('ZKYQ_USER_DATA_PATH', 'ORCA_USER_DATA_PATH'))
  if (!profile || !marker || !profileMatches) {
    throw migrationConflict(unitPath)
  }
  return {
    name,
    unitPath,
    manager: spec.manager,
    content,
    ...previousOptions(content, spec.manager, unitPath)
  }
}

/** Decode only arguments emitted by the former service renderer; never execute unit content. */
function previousOptions(content: string, manager: ServeServiceSpec['manager'], path: string) {
  let args: string[]
  try {
    if (manager === 'launchd') {
      const array =
        /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(content)?.[1] ?? ''
      args = [...array.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) =>
        match[1]
          .replaceAll('&quot;', '"')
          .replaceAll('&gt;', '>')
          .replaceAll('&lt;', '<')
          .replaceAll('&amp;', '&')
      )
    } else {
      const command = /^ExecStart=(.+)$/m.exec(content)?.[1] ?? ''
      args = (command.match(/"(?:\\.|[^"\\])*"|[^\s]+/g) ?? []).map((token) =>
        (token.startsWith('"') ? (JSON.parse(token) as string) : token).replaceAll('%%', '%')
      )
    }
    if (args.slice(1, 4).join(' ') !== 'serve --supervise --no-pairing')
      throw new Error('unexpected arguments')
    let port: string | null = null
    let pairingAddress: string | null = null
    for (let index = 4; index < args.length; index += 2) {
      const value = args[index + 1]
      if (!value) throw new Error('missing value')
      if (args[index] === '--port' && port === null) port = value
      else if (args[index] === '--pairing-address' && pairingAddress === null)
        pairingAddress = value
      else throw new Error('unexpected option')
    }
    return { port, pairingAddress }
  } catch {
    throw migrationConflict(path)
  }
}

function migrationConflict(path: string): RuntimeClientError {
  return new RuntimeClientError(
    'service_migration_conflict',
    `Cannot verify the previous service at ${path}. Keep its configuration and stop or migrate it before installing the new service.`
  )
}

/** Preserve the original unit after the manager confirms it is no longer enabled/running. */
export async function retireServeService(
  retired: RetiredServeService | null,
  current: ServeServiceSpec,
  deps: {
    uid: number
    run: (program: string, args: string[]) => Promise<{ code: number | null; out: string }>
  }
): Promise<string | null> {
  if (!retired) return null
  // Keep archived plists outside LaunchAgents and systemd's unit search directories.
  const archiveDir = join(dirname(dirname(current.unitPath)), 'zkyq-service-history')
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 })
  const result =
    retired.manager === 'launchd'
      ? await deps.run('launchctl', ['bootout', `gui/${deps.uid}/${retired.name}`])
      : await deps.run('systemctl', ['--user', 'disable', '--now', retired.name])
  if (result.code !== 0 && !(retired.manager === 'launchd' && result.code === 113)) {
    throw new RuntimeClientError(
      'service_manager_failed',
      `Could not stop the previous service ${retired.name}: ${result.out.trim() || `exit ${String(result.code)}`}`
    )
  }
  // A user may have edited the unit while the manager was stopping it.
  if (
    !lstatSync(retired.unitPath).isFile() ||
    readFileSync(retired.unitPath, 'utf8') !== retired.content
  ) {
    throw migrationConflict(retired.unitPath)
  }
  const archive = join(archiveDir, `${basename(current.unitPath)}.${randomUUID()}.retired`)
  renameSync(retired.unitPath, archive)
  return archive
}
