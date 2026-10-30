import { closeSync, fstatSync, lstatSync, openSync, readSync, writeSync } from 'node:fs'
import { extname, isAbsolute } from 'node:path'
import { RuntimeClientError } from './runtime/types'

const LEGACY_RECIPE_VARIABLE =
  /(?<![A-Za-z0-9_])ORCA_(?:VM_MODE|VM_INSTANCE_ID|RECIPE_ID|PROJECT_ID|WORKSPACE_ID|WORKSPACE_NAME|REPO_PATH|REPO_URL|REPO_BRANCH|REPO_REF_HEAD|REPO_REF|RECIPE_RESULT_SCHEMA_VERSION|VERSION)(?![A-Za-z0-9_])/g
const MAX_SCRIPT_BYTES = 256 * 1024

type Replacement = { oldName: string; newName: string; line: number; offset: number }

/** Explicitly migrate unambiguous shell environment reads without changing other file bytes. */
export function migrateRecipeEnvironment(
  path: string,
  dryRun: boolean
): {
  path: string
  dryRun: boolean
  replacements: Omit<Replacement, 'offset'>[]
} {
  if (!isAbsolute(path) || !['.sh', '.bash', '.zsh'].includes(extname(path).toLowerCase())) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass an absolute shell script path with --path.'
    )
  }
  const info = lstatSync(path)
  if (!info.isFile() || info.nlink !== 1 || info.size > MAX_SCRIPT_BYTES) {
    throw new RuntimeClientError(
      'invalid_argument',
      'The script must be a bounded regular file with one link.'
    )
  }
  const fd = openSync(path, dryRun ? 'r' : 'r+')
  try {
    const opened = fstatSync(fd)
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > MAX_SCRIPT_BYTES ||
      opened.dev !== info.dev ||
      opened.ino !== info.ino
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The script changed before it could be inspected.'
      )
    }
    const buffer = Buffer.alloc(MAX_SCRIPT_BYTES + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const count = readSync(fd, buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (!count) break
      bytesRead += count
    }
    const raw = buffer.subarray(0, bytesRead)
    if (bytesRead > MAX_SCRIPT_BYTES || raw.includes(0)) {
      throw new RuntimeClientError('invalid_argument', 'The script must be bounded UTF-8 text.')
    }
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw)
    } catch {
      throw new RuntimeClientError('invalid_argument', 'The script must be bounded UTF-8 text.')
    }
    const names = [...content.matchAll(LEGACY_RECIPE_VARIABLE)]
    if (names.length > 1024) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The script has too many references; review it manually.'
      )
    }
    if (names.length && /['\\`]|<<|\$\(/.test(content)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The script has ambiguous shell syntax; review it manually.'
      )
    }
    if (
      names.length &&
      content.split(/\r?\n/).some((line) => {
        const code = line.trimStart().startsWith('#') ? '' : line
        return (code.match(/"/g)?.length ?? 0) % 2 !== 0
      })
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The script has multiline or ambiguous quotes; review it manually.'
      )
    }
    const replacements: Replacement[] = []
    let previousIndex = 0
    let previousOffset = 0
    let lineNumber = 1
    for (const match of names) {
      const index = match.index!
      const lineStart = content.lastIndexOf('\n', index - 1) + 1
      const lineEnd = content.indexOf('\n', index)
      const line = content.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
      const before = content.slice(Math.max(lineStart, index - 2), index)
      if (line.includes('#') || !(before.endsWith('$') || before.endsWith('${'))) {
        throw new RuntimeClientError(
          'invalid_argument',
          'The script contains an ambiguous legacy name; review it manually.'
        )
      }
      const preceding = content.slice(previousIndex, index)
      const offset = previousOffset + Buffer.byteLength(preceding, 'utf8')
      lineNumber += preceding.match(/\n/g)?.length ?? 0
      replacements.push({
        oldName: match[0],
        newName: match[0].replace(/^ORCA_/, 'ZKYQ_'),
        line: lineNumber,
        offset
      })
      previousIndex = index
      previousOffset = offset
    }
    if (!dryRun && replacements.length) {
      const currentPath = lstatSync(path)
      if (
        !currentPath.isFile() ||
        currentPath.nlink !== 1 ||
        currentPath.dev !== opened.dev ||
        currentPath.ino !== opened.ino
      ) {
        throw new RuntimeClientError(
          'invalid_argument',
          'The script changed during inspection; no replacements were made.'
        )
      }
      const current = Buffer.alloc(raw.length + 1)
      let count = 0
      while (count < current.length) {
        const read = readSync(fd, current, count, current.length - count, count)
        if (!read) break
        count += read
      }
      if (count !== raw.length || !current.subarray(0, count).equals(raw)) {
        throw new RuntimeClientError(
          'invalid_argument',
          'The script changed during inspection; no replacements were made.'
        )
      }
      let completed = 0
      let partial: { offset: number; written: number } | undefined
      try {
        for (const replacement of replacements) {
          const existing = Buffer.alloc(Buffer.byteLength(replacement.oldName))
          if (
            readSync(fd, existing, 0, existing.length, replacement.offset) !== existing.length ||
            existing.toString() !== replacement.oldName
          ) {
            throw new Error('script changed during migration')
          }
          const updated = Buffer.from('ZKYQ')
          let written = 0
          partial = { offset: replacement.offset, written: 0 }
          while (written < updated.length) {
            const count = writeSync(
              fd,
              updated,
              written,
              updated.length - written,
              replacement.offset + written
            )
            if (count === 0) throw new Error('short write')
            written += count
            partial.written = written
          }
          partial = undefined
          completed += 1
        }
      } catch (error) {
        let recovery = ''
        if (partial && partial.written > 0 && partial.written < 4) {
          try {
            const observed = Buffer.alloc(4)
            const expected = Buffer.from(
              'ZKYQ'.slice(0, partial.written) + 'ORCA'.slice(partial.written)
            )
            if (readSync(fd, observed, 0, 4, partial.offset) !== 4 || !observed.equals(expected)) {
              throw new Error('reference changed during recovery')
            }
            const original = Buffer.from('ORCA')
            let restored = 0
            while (restored < original.length) {
              const count = writeSync(
                fd,
                original,
                restored,
                original.length - restored,
                partial.offset + restored
              )
              if (count === 0) throw new Error('short recovery write')
              restored += count
            }
          } catch {
            recovery = ' The last reference may be incomplete.'
          }
        }
        throw new RuntimeClientError(
          'invalid_argument',
          `Migration stopped after ${completed} replacements; inspect the script before retrying.${recovery} ${String(error)}`
        )
      }
    }
    return { path, dryRun, replacements: replacements.map(({ offset: _offset, ...item }) => item) }
  } finally {
    closeSync(fd)
  }
}
