import { clampUtf8TextPrefix } from '../../../src/shared/utf8-byte-limits'

const MAX_SUBMISSION_BYTES = 64 * 1024

export type ConnectionDiagnosticsSubmission = {
  report: string
  appVersion: string
  platform: string
}

export type ConnectionDiagnosticsSubmissionResult = { ok: true } | { ok: false; error: string }

/** No diagnostic submission channel is configured for this platform. */
export async function submitConnectionDiagnostics(
  _submission: ConnectionDiagnosticsSubmission,
  _fetchImpl?: typeof fetch
): Promise<ConnectionDiagnosticsSubmissionResult> {
  return { ok: false, error: '本平台诊断提交渠道未配置' }
}

export function boundConnectionDiagnosticsReport(
  report: string,
  maxBytes: number = MAX_SUBMISSION_BYTES
): string {
  if (utf8Bytes(report) <= maxBytes) {
    return report
  }
  const lines = report.split('\n')
  const historyIndex = lines.findIndex((line) => line.startsWith('Recent connection history ('))
  if (historyIndex === -1) {
    return clampUtf8TextPrefix(report, maxBytes)
  }
  const header = lines.slice(0, historyIndex)
  const events = lines.slice(historyIndex + 1)
  let kept: string[] = []
  for (let index = events.length - 1; index >= 0; index--) {
    const candidateEvents = [events[index]!, ...kept]
    const candidate = formatBoundedReport(header, candidateEvents, events.length)
    if (utf8Bytes(candidate) > maxBytes) {
      break
    }
    kept = candidateEvents
  }
  if (kept.length === 0 && events.length > 0) {
    return formatReportWithTruncatedNewestEvent(header, events, maxBytes)
  }
  return clampUtf8TextPrefix(formatBoundedReport(header, kept, events.length), maxBytes)
}

function formatReportWithTruncatedNewestEvent(
  header: string[],
  events: string[],
  maxBytes: number
): string {
  const history = `Recent connection history (1 newest event; ${events.length - 1} older omitted):`
  const prefix = [...header, history].join('\n') + '\n'
  const availableBytes = maxBytes - utf8Bytes(prefix)
  if (availableBytes <= 0) {
    return clampUtf8TextPrefix(prefix, maxBytes)
  }
  const marker = ' … [truncated]'
  const markerBytes = utf8Bytes(marker)
  if (availableBytes <= markerBytes) {
    return clampUtf8TextPrefix(prefix, maxBytes)
  }
  return `${prefix}${clampUtf8TextPrefix(events.at(-1)!, availableBytes - markerBytes)}${marker}`
}

function formatBoundedReport(header: string[], events: string[], totalEvents: number): string {
  const omitted = totalEvents - events.length
  return [
    ...header,
    `Recent connection history (${events.length} newest events; ${omitted} older omitted):`,
    ...events
  ].join('\n')
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
