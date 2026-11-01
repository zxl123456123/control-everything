import { createHash } from 'node:crypto'
import {
  RELAY_REMOTE_DIR,
  RETIRED_RELAY_REMOTE_DIR
} from '../../ssh/remote-exec/remote-frame-protocol'

export const REMOTE_ROOT_IDENTITY_LOCK = '.zkyq-remote-identity.lock'
export const REMOTE_ROOT_IDENTITY_OWNER = '.identity-owner'
export const REMOTE_ROOT_IDENTITY_RECORD = '.zkyq-root-identity.json'
export const REMOTE_ROOT_IDENTITY_SCHEMA_VERSION = 2

/** Runs under the existing install lock; Windows moves the root before entry. */
export const REMOTE_ROOT_IDENTITY_SCRIPT = String.raw`'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const [homeArg, scopeArg, expectedArg, token, mode = 'finalize', aliasesArg] = process.argv.slice(2)
const home = path.resolve(homeArg)
const current = path.join(home, ${JSON.stringify(RELAY_REMOTE_DIR)})
const retired = path.join(home, ${JSON.stringify(RETIRED_RELAY_REMOTE_DIR)})
const lock = path.join(home, ${JSON.stringify(REMOTE_ROOT_IDENTITY_LOCK)})
const owner = path.join(lock, ${JSON.stringify(REMOTE_ROOT_IDENTITY_OWNER)})
const recordPath = path.join(current, ${JSON.stringify(REMOTE_ROOT_IDENTITY_RECORD)})
const stat = file => fs.lstatSync(file, { throwIfNoEntry: false })
const answer = result => console.log(JSON.stringify(result))
const scope = JSON.parse(Buffer.from(scopeArg, 'base64').toString('utf8'))
const expected = JSON.parse(Buffer.from(expectedArg, 'base64').toString('utf8'))
const aliases = aliasesArg === undefined ? [] : JSON.parse(Buffer.from(aliasesArg, 'base64').toString('utf8'))
const validKey = key => typeof key === 'string' && /^(?:[a-f0-9]{16}|local|unattributed)$/.test(key)
if (!path.isAbsolute(homeArg) || (scope !== null && !validKey(scope)) || !Array.isArray(expected) || !expected.every(validKey) || !Array.isArray(aliases) || !aliases.every(key => key !== 'unattributed' && validKey(key)) || (scope === null && aliases.length)) throw Error('Invalid remote root identity coordinates')
function readRecord(file) {
  const saved = stat(file)
  if (!saved) return null
  if (!saved.isFile() || saved.size > 65536) throw Error('Remote root identity record is not a regular bounded file')
  const record = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (![1, ${REMOTE_ROOT_IDENTITY_SCHEMA_VERSION}].includes(record.schemaVersion) || typeof record.generation !== 'string' || !Array.isArray(record.expectedScopes) || !record.expectedScopes.every(validKey) || !Array.isArray(record.retiredScopes) || !record.retiredScopes.every(validKey)) throw Error('Unsupported remote root identity record')
  if (record.schemaVersion === ${REMOTE_ROOT_IDENTITY_SCHEMA_VERSION} && (!record.rootIdentities || typeof record.rootIdentities !== 'object' || Array.isArray(record.rootIdentities) || !Object.entries(record.rootIdentities).every(([key,value]) => validKey(key) && typeof value === 'string' && /^\d+:\d+$/.test(value)))) throw Error('Unsupported remote root identity record')
  return record
}
function assertOwner() {
  const entry = stat(lock), file = stat(owner)
  if (!entry || !entry.isDirectory() || entry.isSymbolicLink() || !file || !file.isFile() || fs.readFileSync(owner, 'utf8') !== token) throw Error('Remote root identity lock ownership changed')
  const now = new Date()
  fs.utimesSync(lock, now, now)
}
function sameLink(file, target) {
  if (!stat(file)?.isSymbolicLink()) return false
  const actual = path.resolve(path.dirname(file), fs.readlinkSync(file))
  return process.platform === 'win32' ? actual.toLowerCase() === target.toLowerCase() : actual === target
}
function under(base, candidate) {
  const relative = path.relative(base, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) ? relative : null
}
function setupAncestors(rows) {
  const byPid = new Map(rows.map(row => [row.pid, row]))
  const ignored = new Set([process.pid])
  let parent = process.ppid
  while (byPid.has(parent) && !ignored.has(parent)) {
    const row = byPid.get(parent)
    if (!['sh','bash','dash','zsh','fish','cmd.exe','powershell.exe','pwsh.exe'].includes(row.name.toLowerCase())) break
    ignored.add(parent)
    parent = row.ppid
  }
  return ignored
}
function oldReaders() {
  if (process.platform === 'win32') {
    const code = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath) | ConvertTo-Json -Compress'
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 })
    if (result.status !== 0) return 'unverifiable'
    let rows
    try { rows = JSON.parse(result.stdout) } catch { return 'unverifiable' }
    if (!Array.isArray(rows) || rows.length === 0) return 'unverifiable'
    if (rows.some(row => !Number.isSafeInteger(row.ProcessId) || !Number.isSafeInteger(row.ParentProcessId) || typeof row.Name !== 'string')) return 'unverifiable'
    const ignored = setupAncestors(rows.map(row => ({ pid: row.ProcessId, ppid: row.ParentProcessId, name: row.Name })))
    let unknown = false
    for (const row of rows) {
      if (ignored.has(row.ProcessId)) continue
      const fields = [row.CommandLine, row.ExecutablePath]
      if (fields.some(value => typeof value === 'string' && [retired, current].some(root => value.toLowerCase().includes(root.toLowerCase() + path.sep)))) return 'live'
      if (/^(?:node|bun-runtime)\.exe$/i.test(row.Name) && typeof row.CommandLine !== 'string') unknown = true
    }
    return unknown ? 'unverifiable' : 'exited'
  }
  const result = spawnSync('ps', ['-Aww', '-o', 'uid=,pid=,ppid=,comm=,args='], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0 || !result.stdout.trim()) return 'unverifiable'
  const rows = []
  for (const line of result.stdout.trim().split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)
    if (!match) return 'unverifiable'
    rows.push({ uid: Number(match[1]), pid: Number(match[2]), ppid: Number(match[3]), name: match[4], args: match[5] })
  }
  const ignored = setupAncestors(rows)
  for (const row of rows) {
    if (row.uid !== process.getuid() || ignored.has(row.pid)) continue
    if (!row.args) return 'unverifiable'
    if ([retired, current].some(root => row.args.includes(root + path.sep))) return 'live'
  }
  return 'exited'
}
function writeRecord(record) {
  assertOwner()
  const temporary = recordPath + '.' + randomUUID() + '.tmp'
  try {
    fs.writeFileSync(temporary, JSON.stringify(record) + '\n', { mode: 0o600, flag: 'wx' })
    fs.renameSync(temporary, recordPath)
  } finally { if (stat(temporary)) fs.unlinkSync(temporary) }
}
function rewriteReferences(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(file)
      const relative = under(retired, path.resolve(path.dirname(file), target))
      if (relative === null) continue
      const mapped = path.join(current, relative)
      const directoryTarget = stat(mapped)?.isDirectory()
      const linkType = process.platform === 'win32' && directoryTarget ? 'junction' : directoryTarget ? 'dir' : 'file'
      const next = linkType === 'junction' || path.isAbsolute(target) ? mapped : path.relative(path.dirname(file), mapped)
      const temporary = path.join(directory, '.zkyq-link-' + randomUUID() + '.tmp')
      try {
        assertOwner()
        fs.symlinkSync(next, temporary, linkType)
        try { fs.renameSync(temporary, file) } catch (error) {
          if (process.platform !== 'win32' || linkType !== 'junction' || !['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error
          if (!sameLink(file, path.resolve(path.dirname(file), target))) throw Error('Remote root reference changed before replacement')
          const previous = file + '.zkyq-before-' + randomUUID()
          fs.renameSync(file, previous)
          try {
            assertOwner()
            fs.renameSync(temporary, file)
          } catch (publishError) {
            if (!stat(file)) fs.renameSync(previous, file)
            throw publishError
          }
          fs.unlinkSync(previous)
        }
      } finally { if (stat(temporary)) fs.unlinkSync(temporary) }
    } else if (entry.isDirectory()) {
      assertOwner()
      rewriteReferences(file)
    }
  }
}
assertOwner()
if (mode === 'prepare') {
  if (process.platform === 'win32') throw Error('Windows root moves must run outside the installed runtime')
  const old = stat(retired), present = stat(current)
  if (old?.isDirectory() && !old.isSymbolicLink()) {
    const deferred = sameLink(current, retired)
    if (present && !deferred) throw Error('Both current and retired remote directories exist')
    const priorRecord = path.join(retired, ${JSON.stringify(REMOTE_ROOT_IDENTITY_RECORD)})
    const prior = stat(priorRecord)
    if (prior) {
      readRecord(priorRecord)
      fs.renameSync(priorRecord, path.join(retired, '.zkyq-root-identity-previous-' + randomUUID() + '.json'))
    }
    if (deferred) fs.unlinkSync(current)
    try { fs.renameSync(retired, current) } catch (error) {
      if (deferred || ['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) fs.symlinkSync(retired, current, 'dir')
      if (!['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) throw error
      answer({ state: 'deferred', reason: 'open-files' })
      process.exit(0)
    }
    try { fs.symlinkSync(current, retired, 'dir') } catch (error) {
      if (!stat(retired)) fs.renameSync(current, retired)
      throw error
    }
  }
}
let record = readRecord(recordPath)
let old = stat(retired)
const present = stat(current)
// Version 1 could retire before a foreign profile owner was registered. Revalidate its receipts.
if (!old && record?.schemaVersion === 1 && present?.isDirectory() && !present.isSymbolicLink()) {
  fs.symlinkSync(current, retired, process.platform === 'win32' ? 'junction' : 'dir')
  old = stat(retired)
}
if (!old) {
  answer({ state: 'current' })
} else if (sameLink(current, retired) && old.isDirectory() && !old.isSymbolicLink()) {
  answer({ state: 'deferred', reason: 'open-files' })
} else {
  if (!sameLink(retired, current) || !present?.isDirectory() || present.isSymbolicLink()) throw Error('Remote root bridge has an unexpected target')
  const rootStat = fs.statSync(current, { bigint: true })
  const rootIdentity = rootStat.dev.toString() + ':' + rootStat.ino.toString()
  if (record?.schemaVersion === 1) {
    fs.copyFileSync(recordPath, path.join(current, '.zkyq-root-identity-previous-' + randomUUID() + '.json'), fs.constants.COPYFILE_EXCL)
    record = { ...record, schemaVersion: ${REMOTE_ROOT_IDENTITY_SCHEMA_VERSION}, generation: randomUUID(), rootIdentities: {}, retiredScopes: [] }
  }
  if (!record) record = { schemaVersion: ${REMOTE_ROOT_IDENTITY_SCHEMA_VERSION}, generation: randomUUID(), rootIdentities: {}, expectedScopes: [], retiredScopes: [] }
  if (scope !== null && record.rootIdentities[scope] && record.rootIdentities[scope] !== rootIdentity) record = { ...record, generation: randomUUID(), rootIdentities: {}, retiredScopes: [] }
  // Device numbers are local to each client's mount, not a shared export identity.
  record.rootIdentity = rootIdentity
  if (scope !== null) record.rootIdentities[scope] = rootIdentity
  record.expectedScopes = [...new Set([...record.expectedScopes.filter(key => key !== 'unattributed' || expected.includes(key)), ...expected])]
  if (record.expectedScopes.length === 0) record.expectedScopes.push('unattributed')
  const verdict = oldReaders()
  if (scope !== null) {
    const receipts = new Set([scope, ...aliases])
    record.retiredScopes = record.retiredScopes.filter(key => !receipts.has(key))
    if (verdict === 'exited') record.retiredScopes.push(...[...receipts].filter(key => record.expectedScopes.includes(key)))
  }
  writeRecord(record)
  if (scope === null || verdict !== 'exited' || !record.expectedScopes.every(key => key !== 'unattributed' && record.retiredScopes.includes(key))) {
    answer({ state: 'bridged', reason: verdict === 'exited' ? 'other-machines' : verdict })
  } else {
    try {
      rewriteReferences(current)
      assertOwner()
      if (!sameLink(retired, current)) throw Error('Remote root bridge changed before retirement')
      fs.unlinkSync(retired)
      answer({ state: 'current' })
    } catch (error) {
      if (!['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) throw error
      answer({ state: 'bridged', reason: 'link-permissions' })
    }
  }
}
`

export const REMOTE_ROOT_IDENTITY_SCRIPT_FILENAME = `.zkyq-root-identity-${createHash('sha256').update(REMOTE_ROOT_IDENTITY_SCRIPT).digest('hex').slice(0, 16)}.cjs`
