import { createRequire } from 'node:module'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { sourceOwner, writeDistributionRecord } from './config/scripts/distribution-record.mjs'
import { markdownParserAliases } from './config/build-plugins/markdown-parser-exports'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createPdfjsViewerAssetsPlugin } from './config/build-plugins/pdfjs-viewer-assets'
import { createViteCacheRetentionPlugin } from './config/build-plugins/vite-cache-retention'
import { resolveWorkbenchBuildCommit } from './config/scripts/build-source-commit.mjs'


export function distributionPlugin(label: string): Plugin {
  let viteRoot: string
  return {
      name: 'distribution-record-' + label,
      configResolved(config) { viteRoot = config.root },
      generateBundle: { order: 'post', handler(_options, bundle) {
        const outputs = Object.fromEntries(Object.values(bundle).filter(item => item.fileName !== '.vite/manifest.json').map(item => {
          let sources = item.type === 'chunk' ? Object.keys(item.modules) : item.originalFileNames.map(name => resolve(viteRoot, name))
          if (item.type === 'asset' && item.fileName.endsWith('.css')) {
            sources = Object.values(bundle).flatMap(chunk => {
              if (chunk.type !== 'chunk') return []
              const metadata = (chunk as typeof chunk & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata
              return metadata?.importedCss.has(item.fileName) ? Object.keys(chunk.modules) : []
            })
          }
          if (item.fileName === 'web-index.html') sources = ['src/renderer/web-index.html']
          return ['out/web/' + item.fileName,
            { sha256: createHash('sha256').update(item.type === 'chunk' ? item.code : item.source).digest('hex'),
              inputs: Object.fromEntries(sources.map(id => [id, {}])),
              ...(item.type === 'asset' && sources.length === 0 ? { sharedOutput: true } : {}),
              imports: item.type === 'chunk' ? [...item.imports, ...item.dynamicImports].map(path => ({ path })) : [] }]
        }))
        const inputs = Object.fromEntries(Object.values(outputs).flatMap(output => Object.keys(output.inputs)).map(id => [id, {}]))
        if (Object.hasOwn(inputs, '__vite-browser-external')) {
          const code = this.getModuleInfo('__vite-browser-external')?.code
          if (code !== 'module.exports = {}') throw Error('distribution_vite_browser_stub_changed')
          inputs['__vite-browser-external'] = { generated: {
            kind: 'vite-browser-external', code,
            sha256: createHash('sha256').update(code).digest('hex'),
            producer: sourceOwner(resolve('.'), 'vite.web.config.ts'),
            tool: sourceOwner(resolve('.'), 'node_modules/vite/dist/node/chunks/node.js')
          } }
        }
        writeDistributionRecord(resolve('.'), label === 'web-worker' ? label + '-' + createHash('sha256').update(Object.keys(outputs).join('\n')).digest('hex').slice(0, 16) : label, [{ inputs, outputs }])
      } }
    }
}

export function copiedWebAssetsPlugin(): Plugin {
  return {
      name: 'distribution-copied-web-assets',
      writeBundle: { order: 'post', sequential: true, handler() {
        const pdf = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
        const copies: {source: string; output: string}[] = []
        function walk(source: string, output: string) {
          for (const name of readdirSync(source)) {
            const from = join(source, name), to = join(output, name)
            if (statSync(from).isDirectory()) walk(from, to)
            else copies.push({ source: from, output: to })
          }
        }
        for (const name of ['cmaps', 'standard_fonts', 'wasm']) walk(join(pdf, name), resolve('out/web', name))
        copies.push({source: resolve('vite.web.config.ts'), output: resolve('out/web/.vite/manifest.json')})
        writeDistributionRecord(resolve('.'), 'web-copies', [], {}, copies)
      } }
    }
}

export default defineConfig({
  root: resolve('src/renderer'),
  cacheDir: resolve('.cache/vite/web'),
  // Why: pairing URLs may live under a reverse-proxy path prefix like
  // /orca/web-index.html, so built assets must resolve relative to the page.
  base: './',
  plugins: [
    distributionPlugin('web'),
    copiedWebAssetsPlugin(),
    react(),
    tailwindcss(),
    createPdfjsViewerAssetsPlugin(),
    createViteCacheRetentionPlugin()
  ],
  define: {
    ORCA_FEATURE_WALL_ENABLED: 'false',
    ORCA_BUILD_COMMIT: JSON.stringify(resolveWorkbenchBuildCommit())
  },
  resolve: {
    alias: [
      // Match the existing package patch: its UMD main is browser-safe; the ESM
      // artifact bundles Node diagnostics_channel and crashes during browser import.
      { find: /^@xterm\/addon-ligatures$/, replacement: createRequire(import.meta.url).resolve('@xterm/addon-ligatures') },
      ...Object.entries(markdownParserAliases).map(([find, replacement]) => ({ find, replacement })),
      { find: '@renderer', replacement: resolve('src/renderer/src') },
      { find: '@', replacement: resolve('src/renderer/src') }
    ]
  },
  build: {
    manifest: true,
    outDir: resolve('out/web'),
    emptyOutDir: true,
    reportCompressedSize: false,
    rollupOptions: {
      input: resolve('src/renderer/web-index.html')
    }
  },
  worker: {
    plugins: () => [distributionPlugin('web-worker')],
    format: 'es'
  }
})
