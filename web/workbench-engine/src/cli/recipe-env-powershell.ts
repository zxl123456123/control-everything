import { join } from 'node:path'
import { runProcessSync } from '@orca/process-host'
import { RuntimeClientError } from './runtime/types'

// Parse the supplied text as data; the user's script is never evaluated.
const PARSER = String.raw`
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$source = [Console]::In.ReadToEnd()
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { exit 2 }
$nodes = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.VariableExpressionAst] -and $node.VariablePath.UserPath -match '^env:ORCA_' }, $true)
$items = @($nodes | ForEach-Object {
  $node = $_
  $writes = $false
  $parent = $node.Parent
  while ($null -ne $parent) {
    if ($parent -is [System.Management.Automation.Language.AssignmentStatementAst] -and
        $node.Extent.StartOffset -ge $parent.Left.Extent.StartOffset -and
        $node.Extent.EndOffset -le $parent.Left.Extent.EndOffset) { $writes = $true }
    if ($parent -is [System.Management.Automation.Language.UnaryExpressionAst] -and
        $parent.TokenKind.ToString() -match '(PlusPlus|MinusMinus)') { $writes = $true }
    if ($parent -is [System.Management.Automation.Language.ConvertExpressionAst] -and
        $parent.Type.TypeName.FullName -eq 'ref') { $writes = $true }
    $parent = $parent.Parent
  }
  @{ start = $node.Extent.StartOffset; end = $node.Extent.EndOffset; writes = $writes }
})
ConvertTo-Json -InputObject $items -Compress
`

type VariableExtent = { start: number; end: number; writes: boolean }

/** Locate PowerShell environment variables with the platform parser, without executing them. */
export function powerShellEnvironmentReads(content: string): VariableExtent[] {
  const program =
    process.platform === 'win32' && process.env.SystemRoot
      ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'pwsh'
  try {
    const result = runProcessSync({
      program,
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(PARSER, 'utf16le').toString('base64')
      ],
      input: content,
      timeoutMs: 15_000,
      maxOutputBytes: 256 * 1024
    })
    if (result.code !== 0 || result.timedOut) throw new Error('parser failed')
    const parsed: unknown = JSON.parse(result.stdout)
    if (!Array.isArray(parsed)) throw new Error('invalid parser output')
    return parsed.map((item: unknown) => {
      if (
        !item ||
        typeof item !== 'object' ||
        !('start' in item) ||
        typeof item.start !== 'number' ||
        !Number.isInteger(item.start) ||
        !('end' in item) ||
        typeof item.end !== 'number' ||
        !Number.isInteger(item.end) ||
        !('writes' in item) ||
        typeof item.writes !== 'boolean'
      )
        throw new Error('invalid parser output')
      return { start: item.start, end: item.end, writes: item.writes }
    })
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      'PowerShell syntax could not be inspected; review the script manually.'
    )
  }
}
