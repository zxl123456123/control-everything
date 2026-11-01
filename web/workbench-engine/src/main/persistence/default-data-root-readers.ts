import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  getFreshProcessTableSnapshot,
  getStrictProcessTableSnapshot
} from '../../shared/process-table-snapshot-reader'
import { readWindowsProcessTableFresh } from '../windows/windows-process-table'
import { inspectProcessLiveness } from '../daemon/daemon-process-inspection'
import { parseDaemonPidFile } from '../daemon/daemon-pid-file-parse'
import { compareOrcadProcessIdentity } from '../orcad/orcad-process-start-time'
import { orcadDataRootIsOnLocalDisk } from '../orcad/orcad-data-root-locality'
import { DaemonClient } from '../daemon/client'
import { getDaemonSocketPath, getDaemonTokenPath } from '../daemon/daemon-spawner'
import { defaultDataRootProcessIdentityPath } from './default-data-root-identity'

/** Ask the authenticated daemon to retire itself; busy terminals and other clients veto it. */
export async function retireIdleDefaultDataRootDaemons(root: string): Promise<void> {
  if (!orcadDataRootIsOnLocalDisk(root)) return
  let names: string[]
  try {
    names = readdirSync(join(root, 'daemon'))
  } catch {
    return
  }
  for (const name of names) {
    const version = /^daemon-v(\d+)\.pid$/.exec(name)?.[1]
    if (!version) continue
    let client: DaemonClient | undefined
    try {
      const record = parseDaemonPidFile(readFileSync(join(root, 'daemon', name), 'utf8'))
      if (!record || !Number.isSafeInteger(record.pid) || record.pid <= 0 || !record.launchNonce)
        continue
      const runtime = join(defaultDataRootProcessIdentityPath(root), 'daemon')
      client = new DaemonClient({
        socketPath: getDaemonSocketPath(runtime, Number(version)),
        tokenPath: getDaemonTokenPath(runtime, Number(version)),
        protocolVersion: Number(version)
      })
      await client.ensureConnectedWithin(1000)
      const identity = client.getDaemonIdentity()
      if (identity?.pid !== record.pid || identity.launchNonce !== record.launchNonce) continue
      const reply = await client.request<{ retiring: boolean }>('shutdownIfIdle', undefined, 1000)
      if (reply.retiring) {
        const deadline = Date.now() + 2000
        while (inspectProcessLiveness(record.pid).status !== 'exited' && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      }
    } catch {
      // Older daemons or an unproven endpoint keep the directory in its single-view bridge.
    } finally {
      client?.disconnect()
    }
  }
}

export type DefaultDataRootReaders = 'quiet' | 'live' | 'unverifiable'

/** A daemon outlives the profile owner; a profile move must fence both. */
export function defaultDataRootDaemonReaders(root: string): DefaultDataRootReaders {
  let names: string[]
  try {
    names = readdirSync(join(root, 'daemon'))
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'quiet' : 'unverifiable'
  }
  for (const name of names.filter((name) => /^daemon-v\d+\.pid$/.test(name))) {
    try {
      const record = parseDaemonPidFile(readFileSync(join(root, 'daemon', name), 'utf8'))
      if (!record || !Number.isSafeInteger(record.pid) || record.pid <= 0) return 'unverifiable'
      // A PID observed here cannot prove anything about a daemon on another machine.
      if (!orcadDataRootIsOnLocalDisk(root)) return 'unverifiable'
      const status = inspectProcessLiveness(record.pid).status
      if (status === 'exited') continue
      if (status === 'unverifiable') return 'unverifiable'
      if (compareOrcadProcessIdentity(record.pid, record) !== 'differs') return 'live'
    } catch {
      return 'unverifiable'
    }
  }
  return 'quiet'
}

/** Shared credentials also have readers in other profiles, which predate a root-wide lease. */
export async function defaultCredentialRootProcessReaders(): Promise<DefaultDataRootReaders> {
  try {
    const rows =
      process.platform === 'win32' ? await readWindowsProcessTableFresh() : await freshPosixRows()
    if (!rows.some((row) => row.pid === process.pid)) return 'unverifiable'
    const parent = rows.find((row) => row.pid === process.ppid)
    const normalized = (value: string) => value.replaceAll('\\', '/').toLowerCase()
    const launcher = normalized(join(dirname(process.argv[1] ?? ''), 'orcad.js'))
    const ownLauncher = parent?.command && normalized(parent.command).includes(launcher)
    for (const row of rows) {
      if (row.pid === process.pid || (row.pid === process.ppid && ownLauncher)) continue
      const command = normalized(row.command)
      const name = 'name' in row ? String(row.name).toLowerCase() : ''
      if (!command || command === name) {
        if (
          /^(?:node|bun-runtime|electron|orca|zkyq|control ?everything|\u638c\u63a7\u4e00\u5207)(?:\.exe)?$/.test(
            name
          )
        )
          return 'unverifiable'
        continue
      }
      if (
        /(?:^|[\\/"\s])(?:orcad(?:-server)?|daemon-entry)\.js(?:["\s]|$)/.test(command) ||
        /(?:^|[\\/"\s])(?:orca|zkyq|control ?everything|\u638c\u63a7\u4e00\u5207)\.exe(?:["\s]|$)/.test(
          command
        ) ||
        /\/(?:orca|control everything)\.app\/contents\/macos\//.test(command) ||
        /\/electron(?:\.exe)?["\s].*(?:workbench-engine|out\/main)/.test(command)
      )
        return 'live'
    }
    return 'quiet'
  } catch {
    return 'unverifiable'
  }
}

async function freshPosixRows() {
  await getFreshProcessTableSnapshot()
  return await getStrictProcessTableSnapshot()
}
