import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe.skipIf(process.platform !== 'win32')('platform owner client real pipe transport', () => {
  let directory: string, helper: string
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ce-owner-client-'))
    helper = join(directory, 'owner.cjs')
    await build({
      entryPoints: ['src/main/orcad/platform-owner-client.ts'],
      outfile: helper,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      logLevel: 'silent'
    })
  })
  afterAll(async () => {
    if (
      directory &&
      resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith('ce-owner-client-')
    )
      await rm(directory, { recursive: true, force: true })
  })

  async function roundTrip(method: string, params: unknown, replyRuntimeId = 'fixture-runtime') {
    const endpoint = `\\\\.\\pipe\\ce-owner-client-${randomUUID()}`
    const received: { id: string; method: string; params: unknown; authToken: string }[] = []
    const server = createServer((socket) => {
      let buffer = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => {
        buffer += chunk
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        const request = JSON.parse(buffer.slice(0, newline))
        received.push(request)
        socket.end(
          JSON.stringify({
            id: request.id,
            ok: true,
            result: {
              repo: { id: 'fixture-repo', displayName: request.params.updates?.displayName }
            },
            _meta: { runtimeId: replyRuntimeId }
          }) + '\n'
        )
      })
    })
    await new Promise<void>((ready, reject) => {
      server.once('error', reject)
      server.listen(endpoint, ready)
    })
    try {
      const result = await new Promise<{ code: number | null; stdout: string }>(
        (resolveResult, reject) => {
          const child = spawn(process.execPath, [helper], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { SystemRoot: process.env.SystemRoot, TEMP: directory, TMP: directory }
          })
          let stdout = ''
          const timeout = setTimeout(() => {
            child.kill()
            reject(new Error('fixture helper timeout'))
          }, 5000)
          child.stdout.setEncoding('utf8')
          child.stdout.on('data', (chunk) => {
            stdout += chunk
          })
          child.stderr.resume()
          child.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })
          child.once('close', (code) => {
            clearTimeout(timeout)
            resolveResult({ code, stdout })
          })
          child.stdin.end(
            JSON.stringify({
              method,
              params,
              endpoint,
              authToken: 'fixture-owner-token',
              expectedRuntimeId: 'fixture-runtime'
            }) + '\n'
          )
        }
      )
      return { ...result, received, response: JSON.parse(result.stdout) }
    } finally {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done()))
      )
    }
  }

  it('delivers the real rename RPC and preserves the owner identity check', async () => {
    const params = { repo: 'id:fixture-repo', updates: { displayName: '项目新名称' } }
    const result = await roundTrip('repo.update', params)
    expect(result.code).toBe(0)
    expect(result.received).toHaveLength(1)
    expect(result.received[0]).toMatchObject({
      method: 'repo.update',
      params,
      authToken: 'fixture-owner-token'
    })
    expect(result.response).toMatchObject({
      ok: true,
      result: { repo: { id: 'fixture-repo', displayName: '项目新名称' } }
    })
    const wrongOwner = await roundTrip('repo.update', params, 'other-runtime')
    expect(wrongOwner.code).toBe(1)
    expect(wrongOwner.response.ok).toBe(false)
  })

  it.each([
    { repo: 'id:fixture-repo', updates: { displayName: 'Name', kind: 'folder' } },
    { repo: 'id:fixture-repo', updates: { worktreeBasePath: 'C:/example/fixture/elsewhere' } },
    { repo: 'id:fixture-repo', updates: { displayName: 'Name' }, repoHostId: 'runtime:other' },
    { repo: 'path:C:/example/fixture/repo', updates: { displayName: 'Name' } },
    { repo: 'id:', updates: { displayName: 'Name' } },
    { repo: 'id:fixture-repo', updates: { displayName: ' ' } },
    { repo: 'id:fixture-repo', updates: null }
  ])(
    'rejects wider or malformed repository updates before opening the pipe: %j',
    async (params) => {
      const result = await roundTrip('repo.update', params)
      expect(result.code).toBe(1)
      expect(result.received).toEqual([])
      expect(result.response.ok).toBe(false)
    }
  )

  it('does not grant repository removal', async () => {
    const result = await roundTrip('repo.rm', { repo: 'id:fixture-repo' })
    expect(result.code).toBe(1)
    expect(result.received).toEqual([])
  })
})
