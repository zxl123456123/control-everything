import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build, resolveConfig } from 'vite'
import { expect, it } from 'vitest'

it('bundles the configured ligatures entry for a browser without Node globals', async () => {
  const config = await resolveConfig(
    { configFile: resolve('vite.web.config.ts'), logLevel: 'silent' }, 'build'
  )
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: config.resolve.alias },
    plugins: [{
      name: 'ligatures-browser-probe',
      resolveId(id) { return id === 'virtual:ligatures-probe' ? '\0ligatures-probe' : undefined },
      load(id) { return id === '\0ligatures-probe' ? "export { LigaturesAddon } from '@xterm/addon-ligatures'" : undefined }
    }],
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: 'virtual:ligatures-probe',
        output: { format: 'iife', name: 'LigaturesBrowserProbe' },
        preserveEntrySignatures: 'strict'
      }
    }
  })
  if (Array.isArray(result) || !('output' in result)) throw new Error('expected one in-memory bundle')
  const chunk = result.output.find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('missing browser chunk')
  const context = { console, setTimeout, clearTimeout, performance }
  runInNewContext(chunk.code, context, { timeout: 5_000 })
  const probe = context as typeof context & {
    LigaturesBrowserProbe: { LigaturesAddon: new () => { activate: unknown } }
  }
  expect(typeof new probe.LigaturesBrowserProbe.LigaturesAddon().activate).toBe('function')
  expect(Object.keys(chunk.modules).some(id => id.includes('addon-ligatures/lib/addon-ligatures.js'))).toBe(true)
  expect(Object.keys(chunk.modules).some(id => id.includes('browser-external'))).toBe(false)
  expect(chunk.code).not.toContain('diagnostics_channel')
})
