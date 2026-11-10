import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'
import { getAppEnvironment, hasAppEnvironment } from '../../../shared/app-environment'

export type OrchestrationCliCommand = 'zkyq' | 'zkyq-dev'

/** Dev builds run the CLI as `zkyq-dev`; a packaged app, or a process with no app, must not advertise it. */
export function runtimeOrchestrationCliCommand(): OrchestrationCliCommand | undefined {
  const app = hasAppEnvironment() ? getAppEnvironment() : null
  if (app?.getCliAccountCommand?.() === 'zkyq') {
    return 'zkyq'
  }
  return app && !app.isPackaged() ? 'zkyq-dev' : undefined
}

/** What a local, non-WSL terminal is told to run; a structured session is always one. */
export function localOrchestrationCliCommand(): OrchestrationCliCommand {
  return runtimeOrchestrationCliCommand() ?? 'zkyq'
}

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
  runtimeCliCommand?: OrchestrationCliCommand
}): OrchestrationCliCommand {
  if (args.connectionId) {
    return 'zkyq'
  }
  if (args.runtimeCliCommand) {
    return args.runtimeCliCommand
  }
  return 'zkyq'
}
