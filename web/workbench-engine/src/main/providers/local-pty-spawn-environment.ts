import { mergeGitConfigEnvProtocol } from '../../shared/git-credential-prompt-env'
import { migrateAgentHookEnvironmentIdentity } from '../../shared/agent-hook-environment-identity'
import { migrateOpenCodeEnvironmentIdentity } from '../../shared/opencode-environment-identity'
import { restoreManagedDataAccountEnvironment } from '../../shared/managed-data-account-environment'
import {
  ORCA_IMAGE_PROTOCOL_ENV,
  ORCA_IMAGE_PROTOCOL_VALUE
} from '../../shared/terminal-image-protocol'
import { removeAppImageRuntimeEnv } from '../pty/appimage-terminal-env'
import { removeChromiumDisabledSessionBus } from '../pty/chromium-session-bus-env'
import { stripInheritedBuildModeEnv } from '../pty/build-mode-env'
import { stripPiProcessOwnerEnv } from '../pty/pi-process-owner-env'
import { removeInheritedNoColor } from '../pty/terminal-color-env'
import { isWindowsGitBashShellPath } from '../git-bash'
import { applyScrubSafeAgentEnvAliases } from '../../shared/agent-hook-scrub-safe-env'
import { removeUnspecifiedPaneIdentityEnv } from './local-pty-launch-helpers'
import type { LocalPtyLaunchPlan } from './local-pty-launch-plan'
import type { LocalPtyProviderOptions } from './local-pty-provider-types'
import type { PtySpawnOptions } from './pty-provider-contract'

/** Pane ownership must be fresh even when Orca itself was launched inside an agent. */
export function buildLocalPtySpawnEnvironment(args: {
  id: string
  spawn: PtySpawnOptions
  getOptions: () => LocalPtyProviderOptions
  plan: LocalPtyLaunchPlan
}): Record<string, string> | Promise<Record<string, string>> {
  const { id, spawn, getOptions, plan } = args
  const spawnEnv = buildInheritedLocalPtyEnvironment(spawn.env, spawn.envToDelete)
  const explicitEnv = { ...spawn.env }
  migrateAgentHookEnvironmentIdentity(explicitEnv)
  migrateOpenCodeEnvironmentIdentity(explicitEnv)

  // Why: on Windows LANG doesn't set the console code page; PYTHONUTF8=1 forces Python UTF-8 stdio to avoid garbled CJK.
  if (process.platform === 'win32') {
    spawnEnv.PYTHONUTF8 ??= '1'
    if (isWindowsGitBashShellPath(plan.shellPath)) {
      // Why: Git for Windows login files otherwise cd to $HOME, ignoring node-pty's cwd for repo-scoped terminals.
      spawnEnv.CHERE_INVOKING ??= '1'
    }
  }

  if (!getOptions().buildSpawnEnv) {
    return spawnEnv
  }
  return getOptions().buildSpawnEnv!(id, spawnEnv, {
    explicitEnv,
    command: spawn.command,
    launchAgent: spawn.launchAgent,
    codexHomePathOverride: spawn.codexHomePathOverride,
    cwd: plan.cwd,
    shellPath: plan.shellPath,
    isWsl: plan.isWslShell,
    wslDistro: plan.launchWslDistro
  })
}

/** What any local PTY inherits from Orca: its terminal identity, minus build and pane leftovers. */
export function buildInheritedLocalPtyEnvironment(
  explicitEnv: Record<string, string> | undefined,
  envToDelete: readonly string[] = []
): Record<string, string> {
  const inheritedEnv = stripInheritedBuildModeEnv(process.env)
  // A parent pane cannot supply identity for this newly created terminal.
  for (const suffix of [
    'PANE_KEY',
    'TAB_ID',
    'WORKTREE_ID',
    'AGENT_LAUNCH_TOKEN',
    'AGENT_PANE',
    'AGENT_LAUNCH',
    'HOOK_AGENT_PID'
  ]) {
    delete inheritedEnv[`ORCA_${suffix}`]
    delete inheritedEnv[`ZKYQ_${suffix}`]
  }
  migrateAgentHookEnvironmentIdentity(inheritedEnv)
  migrateOpenCodeEnvironmentIdentity(inheritedEnv)
  explicitEnv = explicitEnv ? { ...explicitEnv } : undefined
  const currentDeletions = [...envToDelete]
  migrateAgentHookEnvironmentIdentity(explicitEnv ?? {}, currentDeletions)
  migrateOpenCodeEnvironmentIdentity(explicitEnv ?? {}, currentDeletions)
  restoreManagedDataAccountEnvironment(inheritedEnv)
  const spawnEnv: Record<string, string> = {
    ...mergeGitConfigEnvProtocol(inheritedEnv, explicitEnv),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'zkyq',
    // Why: TUIs feature-gate on TERM_PROGRAM_VERSION; the fallback keeps tests and non-Electron runs working.
    TERM_PROGRAM_VERSION: process.env.ZKYQ_APP_VERSION ?? '0.0.0-dev',
    // Why: tools may not recognize this terminal identifier; xterm.js supports OSC 8 links.
    FORCE_HYPERLINK: '1',
    [ORCA_IMAGE_PROTOCOL_ENV]: ORCA_IMAGE_PROTOCOL_VALUE
  } satisfies Record<string, string>
  removeUnspecifiedPaneIdentityEnv(spawnEnv, explicitEnv)
  stripPiProcessOwnerEnv(spawnEnv)
  removeAppImageRuntimeEnv(spawnEnv)
  removeChromiumDisabledSessionBus(spawnEnv)
  removeInheritedNoColor(spawnEnv)
  for (const key of currentDeletions) {
    delete spawnEnv[key]
  }
  if (explicitEnv?.TERM) {
    spawnEnv.TERM = explicitEnv.TERM
  }
  // Why after the strips and deletes: an alias must never outlive the value it mirrors.
  applyScrubSafeAgentEnvAliases(spawnEnv)

  spawnEnv.LANG ??= 'en_US.UTF-8'
  return spawnEnv
}

/** App-level env builders can reintroduce deleted keys; enforce isolation after they finish. */
export function enforceLocalPtySpawnEnvironmentOverrides(
  spawn: PtySpawnOptions,
  finalEnv: Record<string, string>
): void {
  const currentDeletions = [...(spawn.envToDelete ?? [])]
  migrateAgentHookEnvironmentIdentity(finalEnv, currentDeletions)
  migrateOpenCodeEnvironmentIdentity(finalEnv, currentDeletions)
  stripPiProcessOwnerEnv(finalEnv)
  for (const key of currentDeletions) {
    delete finalEnv[key]
  }
  if (spawn.env?.TERM) {
    finalEnv.TERM = spawn.env.TERM
  }
}
