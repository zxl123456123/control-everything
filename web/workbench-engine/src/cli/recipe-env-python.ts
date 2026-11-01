import { runProcessSync } from '@orca/process-host'
import { RuntimeClientError } from './runtime/types'

// Parse source as data; never import or run the user's script.
const PARSER = String.raw`
import ast, json, sys
if sys.version_info < (3, 9):
    raise RuntimeError('Python 3.9 or newer is required')
source = sys.stdin.buffer.read().decode('utf-8')
bom = source.startswith('\ufeff')
if bom:
    source = source[1:]
tree = ast.parse(source)
nodes = list(ast.walk(tree))
if not any(isinstance(n, ast.Import) and any(a.name == 'os' and a.asname in (None, 'os') for a in n.names) for n in nodes):
    raise ValueError('os import required')
if any(isinstance(n, ast.Name) and n.id == 'os' and isinstance(n.ctx, (ast.Store, ast.Del)) for n in nodes):
    raise ValueError('os is reassigned')
if any(isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == 'os' and n.attr == 'environ' and isinstance(n.ctx, (ast.Store, ast.Del)) for n in nodes):
    raise ValueError('os.environ is reassigned')
def environ(node):
    return isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == 'os' and node.attr == 'environ'
def getenv(node):
    return isinstance(node, ast.Attribute) and ((isinstance(node.value, ast.Name) and node.value.id == 'os' and node.attr == 'getenv') or (environ(node.value) and node.attr == 'get'))
lines = source.splitlines(keepends=True)
offsets = []
offset = 3 if bom else 0
for line in lines:
    offsets.append(offset)
    offset += len(line.encode('utf-8'))
result = []
for node in nodes:
    value = None
    if isinstance(node, ast.Subscript) and environ(node.value) and isinstance(node.ctx, ast.Load):
        value = node.slice
    elif isinstance(node, ast.Call) and getenv(node.func) and node.args:
        value = node.args[0]
    if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
        continue
    text = ast.get_source_segment(source, value)
    if text not in ("'" + value.value + "'", '"' + value.value + '"'):
        continue
    result.append(offsets[value.lineno - 1] + value.col_offset + 1)
print(json.dumps(result))
`

/** Locate direct Python environment reads as byte offsets without evaluating source. */
export function pythonEnvironmentReads(content: string): number[] {
  try {
    const result = runProcessSync({
      program: process.platform === 'win32' ? 'python' : 'python3',
      args: ['-I', '-S', '-c', PARSER],
      input: content,
      timeoutMs: 15_000,
      maxOutputBytes: 256 * 1024
    })
    if (result.code !== 0 || result.timedOut) throw new Error('parser failed')
    const parsed: unknown = JSON.parse(result.stdout)
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (value) => Number.isSafeInteger(value) && value >= 0 && value < Buffer.byteLength(content)
      )
    ) {
      throw new Error('invalid parser output')
    }
    return parsed
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      'Python syntax could not be inspected; verify Python 3.9 or newer is installed and review the script manually.'
    )
  }
}
