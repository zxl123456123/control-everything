import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { platformUpgradeAllowed, platformRemoteHealth, readPlatformRuntimePolicy } from './platform-runtime-policy'

const proof = 'a'.repeat(43)
const env = { CE_WORKBENCH_ISOLATED: '1', CE_WORKBENCH_ORIGIN: 'http://127.0.0.1:8766',
  CE_WORKBENCH_PUBLIC_ORIGIN: 'https://workbench.example.test', CE_WORKBENCH_DEVICE_PROOF: proof }
const headers = ['Host','workbench.example.test','Origin',env.CE_WORKBENCH_PUBLIC_ORIGIN,'X-CE-Device-Proof',proof]
describe('per-device platform runtime admission', () => {
  it('requires isolation and proof when a public origin is enabled', () => {
    expect(() => readPlatformRuntimePolicy({ CE_WORKBENCH_PUBLIC_ORIGIN: env.CE_WORKBENCH_PUBLIC_ORIGIN })).toThrow()
    expect(() => readPlatformRuntimePolicy({ ...env, CE_WORKBENCH_DEVICE_PROOF: '' })).toThrow()
    expect(() => readPlatformRuntimePolicy({ ...env, CE_WORKBENCH_PUBLIC_ORIGIN: 'https://example.test/' })).toThrow()
  })
  it('admits only the exact public origin and this device proof', () => {
    const policy = readPlatformRuntimePolicy(env)
    expect(platformUpgradeAllowed(headers,'/?orca-client=web',12345,policy)).toBe(true)
    for (const modified of [headers.slice(0,4), [...headers,'X-CE-Device-Proof',proof],
      ['Host','workbench.example.test','Origin','null','X-CE-Device-Proof',proof],
      ['Host','workbench.example.test','Origin',env.CE_WORKBENCH_PUBLIC_ORIGIN,'X-CE-Device-Proof','b'.repeat(43)],
      ['Host','other.example.test','Origin',env.CE_WORKBENCH_PUBLIC_ORIGIN,'X-CE-Device-Proof',proof]]) {
      expect(platformUpgradeAllowed(modified,'/',12345,policy)).toBe(false)
    }
    for (const url of ['/?unknown=1','/?orca-client=web&orca-client=web','/workbench-runtime','/?ce_context=x']) {
      expect(platformUpgradeAllowed(headers,url,12345,policy)).toBe(false)
    }
  })
  it('rewrites the authorized public endpoint to the native root upgrade contract', () => {
    const caddy = readFileSync(new URL('../../../../docs/examples/integrations/workbench-remote.Caddyfile.example', import.meta.url), 'utf8')
    const rewrites = [...caddy.matchAll(/^\s*rewrite @runtime (\S+)$/gm)]
    expect(rewrites).toHaveLength(1)
    const policy = readPlatformRuntimePolicy(env)
    expect(platformUpgradeAllowed(headers, '/workbench-runtime?orca-client=web', 12345, policy)).toBe(false)
    expect(platformUpgradeAllowed(headers, rewrites[0][1], 12345, policy)).toBe(true)
    expect(rewrites[0][1]).toBe('/?orca-client=web')
    expect(caddy).toContain('@runtime path /workbench-runtime')
  })
  it('keeps the exact local runtime available without exposing a LAN listener', () => {
    const policy=readPlatformRuntimePolicy(env)
    expect(platformUpgradeAllowed(['Host','127.0.0.1:12345','Origin',env.CE_WORKBENCH_ORIGIN],'/',12345,policy)).toBe(true)
    expect(platformUpgradeAllowed(['Host','192.0.2.1:12345','Origin',env.CE_WORKBENCH_ORIGIN],'/',12345,policy)).toBe(false)
  })
})
describe('strict internal health schema', () => {
  it('rejects duplicated proof and origin before returning identity', () => {
    const policy = readPlatformRuntimePolicy({...env, CE_REMOTE_DEVICE_ID: 'device-1', CE_REMOTE_GENERATION: '1', CE_REMOTE_INSTALLATION_ID: 'platform-installation-1'})
    for (const extra of [['Origin',env.CE_WORKBENCH_PUBLIC_ORIGIN],['X-CE-Device-Proof',proof],['Host','workbench.example.test']]) {
      const result=platformRemoteHealth([...headers,...extra],'/__ce_remote_health?nonce='+'A'.repeat(32),'GET',12345,true,policy)
      expect(result.status).toBe(403)
      expect(result.body).not.toHaveProperty('device_id')
    }
  })
})
