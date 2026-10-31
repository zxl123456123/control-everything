import { parseAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'

const CURRENT_DIGEST = /^[\s\S]{0,40}~zkyq-oversized~[1-9]\d*~[0-9a-f]{16}$/

/** Only the explicit downgrade export emits this retired address domain. */
export function journalV3Key(key: string): string {
  const identity = parseAgentJournalItemKey(key)
  if (!identity) return key
  const parts = key.split(':')
  if (identity.provider === 'zkyq') parts[0] = 'orca'
  return parts
    .map((part) => {
      if (part.startsWith('%FE')) {
        const value = decodeURIComponent(part.slice(3))
        return encodeURIComponent(
          value.replace(/~zkyq-oversized~(?=[1-9]\d*~[0-9a-f]{16}$)/, '~orca-oversized~')
        )
      }
      if (part.startsWith('%FF') && CURRENT_DIGEST.test(decodeURIComponent(part.slice(3)))) {
        // The v3 encoder never tagged a raw string using the then-unreserved marker.
        return part.slice(3)
      }
      return part
    })
    .join(':')
}
