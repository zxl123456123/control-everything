// Builds the browser preview of the account/device screens with esbuild + react-native-web.
// Usage: node scripts/ce-ui-preview/build.mjs [outDir]   (default: work/ce-ui-preview)
import { build, transform } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mobile = resolve(here, '../..')
const out = resolve(process.argv[2] ?? resolve(mobile, '../../../work/ce-ui-preview'))
mkdirSync(out, { recursive: true })

const require = createRequire(resolve(mobile, 'package.json'))
// Reanimated on the web needs its Babel plugin (worklet capture, dependency arrays). @babel/core is a
// transitive dependency, so it is located through the pnpm store.
const pnpm = resolve(mobile, 'node_modules/.pnpm')
const babelDir = readdirSync(pnpm).find((name) => name.startsWith('@babel+core@'))
const babelCore = createRequire(
  resolve(pnpm, babelDir, 'node_modules', '@babel/core/package.json')
)('@babel/core')
const workletsPlugin = require.resolve('react-native-worklets/plugin')
const worklets = {
  name: 'ce-preview-worklets',
  setup(b) {
    b.onLoad({ filter: /src\/ce-ui\/.*\.tsx?$/ }, async (args) => {
      const js = await transform(readFileSync(args.path, 'utf8'), {
        loader: args.path.endsWith('x') ? 'tsx' : 'ts',
        jsx: 'automatic',
        sourcefile: args.path
      })
      const result = babelCore.transformSync(js.code, {
        babelrc: false,
        configFile: false,
        filename: args.path,
        sourceMaps: false,
        parserOpts: { plugins: ['jsx'] },
        plugins: [workletsPlugin]
      })
      return { contents: result.code, loader: 'js' }
    })
  }
}
const stub = (file) => resolve(here, 'stubs', file)
const exact = {
  // lucide's ESM entry re-exports a symbol its own context module lacks, so use its CJS build.
  'lucide-react-native': require.resolve('lucide-react-native'),
  'react-native': 'react-native-web',
  'expo-router': stub('expo-router.tsx'),
  'react-native-safe-area-context': stub('safe-area.tsx'),
  'expo-haptics': stub('expo-haptics.ts'),
  'expo-constants': stub('expo-misc.ts'),
  'expo-clipboard': stub('expo-misc.ts'),
  'expo-linking': stub('expo-misc.ts'),
  'expo-camera': stub('expo-misc.ts')
}
const stubPlugin = {
  name: 'ce-preview-stubs',
  setup(b) {
    b.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData === 'skip') return null
      if (exact[args.path]) {
        return b.resolve(exact[args.path], {
          resolveDir: mobile,
          kind: args.kind,
          pluginData: 'skip'
        })
      }
      if (/platform-account\/controller$/.test(args.path))
        return { path: stub('account-controller.ts') }
      if (/\/use-pair-flow$/.test(args.path)) return { path: stub('use-pair-flow.ts') }
      return null
    })
  }
}

await build({
  entryPoints: [resolve(here, 'main.jsx')],
  bundle: true,
  outfile: resolve(out, 'bundle.js'),
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  logLevel: 'info',
  sourcemap: false,
  banner: {
    js: "globalThis.process = globalThis.process || { env: { NODE_ENV: 'development' } };"
  },
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"', global: 'globalThis' },
  resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.jsx', '.js', '.mjs'],
  loader: { '.js': 'jsx' },
  nodePaths: [resolve(mobile, 'node_modules')],
  plugins: [stubPlugin, worklets]
})
writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}body{background:#888}</style></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`
)
console.log('preview built in', out)
