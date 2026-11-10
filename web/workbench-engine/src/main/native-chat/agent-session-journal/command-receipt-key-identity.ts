import { canonicalAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import type { CommandReceipt, CommandReceiptResult } from './command-receipt-schema'

export function mapCommandReceiptResultKeys(
  result: CommandReceiptResult,
  mapKey: (key: string) => string
): CommandReceiptResult {
  return result.kind === 'prompt-answer' ? { ...result, itemId: mapKey(result.itemId) } : result
}

/** Result addresses migrate; the fingerprint still identifies the exact original request. */
export function canonicalCommandReceipt(receipt: CommandReceipt): CommandReceipt {
  return receipt.status === 'accepted'
    ? {
        ...receipt,
        result: mapCommandReceiptResultKeys(receipt.result, canonicalAgentJournalItemKey)
      }
    : receipt
}
