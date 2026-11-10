import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const [sourceArg, outputArg, ...extra] = process.argv.slice(2)
if (!sourceArg || !outputArg || extra.length) {
  throw new Error(
    'Usage: node tools/packaging/export_workbench_journal_v3.mjs <source-db> <new-output-directory>'
  )
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const engine = join(root, 'web/workbench-engine')
const require = createRequire(join(engine, 'package.json'))
const { build } = require('esbuild')
const output = resolve(outputArg)
mkdirSync(output, { mode: 0o700 })
const runner = join(output, 'journal-v3-export.cjs')
const implementation = join(
  engine,
  'src/main/native-chat/agent-session-journal/journal-v3-export.ts'
)
await build({
  stdin: {
    contents: `import { exportJournalV3 } from ${JSON.stringify(implementation)};
exportJournalV3(process.argv[2], process.argv[3]).then(result => {
  process.stdout.write(JSON.stringify(result) + '\\n');
}).catch(error => { console.error(error.message); process.exitCode = 1; });`,
    resolveDir: engine,
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: runner
})
const result = spawnSync(
  process.execPath,
  [runner, resolve(sourceArg), join(output, 'agent-session-journal.db')],
  {
    stdio: 'inherit',
    windowsHide: true
  }
)
process.exitCode = result.status ?? 1
