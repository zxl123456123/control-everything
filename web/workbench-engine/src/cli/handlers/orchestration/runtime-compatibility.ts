import { RuntimeClientError } from '../../runtime-client'

export function resolveCompatibilityCliCommand(): 'zkyq' | 'orca' | 'orca-ide' | 'zkyq-dev' {
  const configured = process.env.ORCA_CLI_COMMAND
  if (configured && /(?:^|[/\\])zkyq(?:\.exe|\.cmd)?$/i.test(configured)) {
    return 'zkyq'
  }
  if (configured && /(?:^|[/\\])zkyq-dev(?:\.cmd)?$/i.test(configured)) {
    return 'zkyq-dev'
  }
  if (configured === 'orca' || configured === 'orca-ide' || configured === 'zkyq-dev') {
    return configured
  }
  return 'zkyq'
}

export function resolvePackagedWindowsCompatibilityCommand(): 'zkyq' | 'orca' | 'orca-ide' | undefined {
  if (process.env.ORCA_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.ORCA_CLI_COMMAND
  if (command === 'zkyq' || command === 'orca' || command === 'orca-ide') {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'The packaged Orca launcher did not provide a valid resume command. No question was created.'
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.ORCA_DEV_CLI_INVOCATION === '1' ||
    (process.env.ORCA_USER_DATA_PATH?.includes('orca-dev') ?? false)
  )
}
