import { describe, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { COMMAND_SPECS } from './specs'
import { TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY } from '../shared/protocol-version'
import { RuntimeClientError, type RuntimeClient } from './runtime-client'
import { TERMINAL_HANDLERS } from './handlers/terminal'
import { ORCHESTRATION_HANDLERS } from './handlers/orchestration'
import { readRetryRequestFlag } from './retry-request-flag'

const PATHS = COMMAND_SPECS.map((spec) => spec.path)

function promptClient() {
  const call = vi.fn().mockResolvedValue({
    result: {
      send: {
        handle: 'term-1',
        accepted: true,
        bytesWritten: 2,
        prompt: {
          requestId: '11111111-1111-4111-8111-111111111111',
          stages: ['input_accepted', 'turn_started'],
          provider: 'claude',
          observation: 'supported',
          processIncarnation: 'inc-1',
          generation: 1,
          baselineWorkingSequence: 3
        }
      }
    },
    _meta: { runtimeId: 'runtime-1' }
  })
  const client = {
    call,
    getCliStatus: vi.fn().mockResolvedValue({
      result: {
        runtime: {
          reachable: true,
          runtimeId: 'runtime-1',
          capabilities: [TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY]
        }
      }
    })
  } as unknown as RuntimeClient
  return { client, call }
}

async function sendWith(
  argv: string[]
): Promise<{ error: unknown; call: ReturnType<typeof vi.fn> }> {
  const { client, call } = promptClient()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const error = await TERMINAL_HANDLERS['terminal send']({
    flags: parseArgs(argv, PATHS).flags,
    client,
    cwd: '/tmp/worktree',
    json: true
  })
    .then(() => undefined)
    .catch((caught: unknown) => caught)
  return { error, call }
}

describe('--retry-request and --wait-submit value damage', () => {
  it('parses a value-less flag as boolean true', () => {
    const parsed = parseArgs(
      ['terminal', 'send', '--terminal', 'term-1', '--text', 'hi', '--enter', '--retry-request'],
      PATHS
    )
    expect(parsed.flags.get('retry-request')).toBe(true)
  })

  it('rejects a value-less --retry-request instead of minting a fresh identity', async () => {
    const { error, call } = await sendWith([
      'terminal',
      'send',
      '--terminal',
      'term-1',
      '--text',
      'hi',
      '--enter',
      '--retry-request'
    ])
    expect(error).toMatchObject({ code: 'invalid_argument' })
    expect((error as Error).message).toContain('--retry-request requires a value')
    expect(call).not.toHaveBeenCalled()
  })

  it('rejects an empty --retry-request= value', async () => {
    const { error, call } = await sendWith([
      'terminal',
      'send',
      '--terminal',
      'term-1',
      '--text',
      'hi',
      '--enter',
      '--retry-request='
    ])
    expect(error).toMatchObject({ code: 'invalid_argument' })
    expect((error as Error).message).toContain('--retry-request must be the UUID')
    expect(call).not.toHaveBeenCalled()
  })

  it('rejects a non-UUID --retry-request value', () => {
    expect(() => readRetryRequestFlag(new Map([['retry-request', 'prompt-1']]))).toThrow(
      '--retry-request must be the UUID'
    )
    expect(
      readRetryRequestFlag(new Map([['retry-request', '11111111-1111-4111-8111-111111111111']]))
    ).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rejects a value-less --wait-submit instead of silently not waiting', async () => {
    const { error, call } = await sendWith([
      'terminal',
      'send',
      '--terminal',
      'term-1',
      '--text',
      'hi',
      '--enter',
      '--wait-submit'
    ])
    expect(error).toMatchObject({ code: 'invalid_argument' })
    expect((error as Error).message).toContain('--wait-submit requires a value')
    expect(call).not.toHaveBeenCalled()
  })

  it('rejects a damaged --retry-request on an orchestration verb', async () => {
    const call = vi.fn()
    const client = { call } as unknown as RuntimeClient
    for (const value of [true as const, 'worker-stop-1']) {
      const error = await ORCHESTRATION_HANDLERS['orchestration worker-stop']({
        flags: new Map<string, string | boolean>([
          ['dispatch', 'ctx_1'],
          ['retry-request', value]
        ]),
        client,
        cwd: '/tmp/worktree',
        json: true
      })
        .then(() => undefined)
        .catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: 'invalid_argument' })
    }
    expect(call).not.toHaveBeenCalled()
  })
})

describe('terminal compatibility guidance', () => {
  it.each([
    [
      'unreachable',
      false,
      [],
      new Map<string, string | boolean>(),
      'runtime_unavailable',
      'no input was sent'
    ],
    [
      'unsupported retry',
      true,
      [],
      new Map<string, string | boolean>([
        ['retry-request', '11111111-1111-4111-8111-111111111111']
      ]),
      'incompatible_runtime',
      'an earlier prompt may have been delivered'
    ],
    [
      'unsupported wait',
      true,
      [],
      new Map<string, string | boolean>([['wait-submit', '5']]),
      'incompatible_runtime',
      'No input was sent'
    ]
  ])(
    'preserves the %s send safeguard',
    async (_name, reachable, capabilities, extra, code, detail) => {
      const call = vi.fn()
      const client = {
        call,
        getCliStatus: vi
          .fn()
          .mockResolvedValue({ result: { runtime: { reachable, capabilities } } })
      } as unknown as RuntimeClient
      const flags = new Map<string, string | boolean>([
        ['terminal', 'term-1'],
        ['text', 'hello'],
        ['enter', true],
        ...extra
      ])
      const error = await TERMINAL_HANDLERS['terminal send']({
        flags,
        client,
        cwd: '/repo',
        json: true
      }).catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code })
      expect((error as Error).message).toContain('Control Everything')
      expect((error as Error).message).toContain(detail)
      expect((error as Error).message).not.toContain('Orca')
      expect(call).not.toHaveBeenCalled()
    }
  )

  it.each([false, true])('refuses shell selection when host reachable is %s', async (reachable) => {
    const call = vi.fn()
    const client = {
      call,
      getCliStatus: vi
        .fn()
        .mockResolvedValue({ result: { runtime: { reachable, capabilities: [] } } })
    } as unknown as RuntimeClient
    const error = await TERMINAL_HANDLERS['terminal create']({
      flags: new Map([['shell', 'cmd']]),
      client,
      cwd: '/repo',
      json: true
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      code: reachable ? 'incompatible_runtime' : 'runtime_unavailable'
    })
    expect((error as Error).message).toContain('Control Everything')
    expect((error as Error).message).toMatch(/no terminal was created/i)
    expect(call).not.toHaveBeenCalled()
  })

  it('reports an accepted prompt with no durable receipt without sending again', async () => {
    const { client, call } = promptClient()
    call.mockResolvedValueOnce({
      result: { send: { handle: 'term-1', accepted: true, bytesWritten: 5 } }
    })
    const error = await TERMINAL_HANDLERS['terminal send']({
      flags: new Map<string, string | boolean>([
        ['terminal', 'term-1'],
        ['text', 'hello'],
        ['enter', true]
      ]),
      client,
      cwd: '/repo',
      json: true
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'incompatible_runtime' })
    expect((error as Error).message).toContain('Control Everything')
    expect((error as Error).message).toContain('without returning a durable prompt receipt')
    expect(call).toHaveBeenCalledOnce()
  })

  it('explains when the host cannot close all terminals', async () => {
    const call = vi
      .fn()
      .mockRejectedValue(new RuntimeClientError('method_not_found', 'unknown method'))
    const client = { call } as unknown as RuntimeClient
    const error = await TERMINAL_HANDLERS['terminal close']({
      flags: new Map<string, string | boolean>([
        ['all', true],
        ['worktree', 'id:worktree-1']
      ]),
      client,
      cwd: '/repo',
      json: true
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'incompatible_runtime' })
    expect((error as Error).message).toContain('Control Everything')
    expect((error as Error).message).not.toContain('Orca')
    expect(call).toHaveBeenCalledOnce()
  })
})
