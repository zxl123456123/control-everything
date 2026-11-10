import { describe, expect, it, vi } from 'vitest'
import {
  boundConnectionDiagnosticsReport,
  submitConnectionDiagnostics
} from './connection-diagnostics-submission'

describe('submitConnectionDiagnostics', () => {
  it('bounds a long report without encoding each retained character', () => {
    const encode = vi.spyOn(TextEncoder.prototype, 'encode')
    let output: string
    let calls: number
    try {
      output = boundConnectionDiagnosticsReport('x'.repeat(100_000))
      calls = encode.mock.calls.length
    } finally {
      encode.mockRestore()
    }
    expect(output).toBe('x'.repeat(64 * 1024))
    expect(calls).toBeLessThanOrEqual(1)
  })

  it.each([
    ['a'.repeat(1000), 511, 'a'.repeat(511)],
    ['é'.repeat(1000), 511, 'é'.repeat(255)],
    ['界'.repeat(1000), 511, '界'.repeat(170)],
    ['😀'.repeat(1000), 511, '😀'.repeat(127)],
    ['\ud800'.repeat(1000), 511, '\ud800'.repeat(170)],
    ['a\udc00b'.repeat(1000), 8, 'a\udc00ba'],
    ['a'.repeat(1000), 2.5, 'aa'],
    ['a'.repeat(1000), -1, ''],
    ['a'.repeat(1000), Number.NaN, 'a'.repeat(1000)],
    ['a'.repeat(1000), Number.NEGATIVE_INFINITY, ''],
    ['a'.repeat(1000), Number.POSITIVE_INFINITY, 'a'.repeat(1000)]
  ])('preserves UTF-8 prefix case %#', (input, limit, expected) => {
    expect(boundConnectionDiagnosticsReport(input, limit)).toBe(expected)
  })

  it('refuses direct submission before creating any network request', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(
      submitConnectionDiagnostics(
        { report: 'synthetic report', appVersion: '0.0.47', platform: 'android' },
        fetchImpl
      )
    ).resolves.toEqual({ ok: false, error: '本平台诊断提交渠道未配置' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves the newest complete events when bounding a UTF-8 report', () => {
    const report = [
      'Orca Mobile connection diagnostics',
      'State: reconnecting',
      '',
      'Recent connection history (3 events, oldest first):',
      `oldest ${'😀'.repeat(20)}`,
      `middle ${'😀'.repeat(20)}`,
      `newest ${'😀'.repeat(20)}`
    ].join('\n')

    const bounded = boundConnectionDiagnosticsReport(report, 180)

    expect(new TextEncoder().encode(bounded).byteLength).toBeLessThanOrEqual(180)
    expect(bounded).toContain('newest')
    expect(bounded).not.toContain('oldest')
    expect(bounded).toMatch(/older omitted/)
  })

  it('retains a bounded form of the newest event when that event exceeds the budget', () => {
    const report = [
      'Orca Mobile connection diagnostics',
      'State: reconnecting',
      '',
      'Recent connection history (2 events, oldest first):',
      'old event',
      `newest oversized ${'😀'.repeat(1_000)}`
    ].join('\n')

    const bounded = boundConnectionDiagnosticsReport(report, 220)

    expect(new TextEncoder().encode(bounded).byteLength).toBeLessThanOrEqual(220)
    expect(bounded).toContain('newest oversized')
    expect(bounded).toContain('[truncated]')
  })
})
