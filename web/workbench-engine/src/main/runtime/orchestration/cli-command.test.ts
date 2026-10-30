import { describe, expect, it, vi } from 'vitest'
import { runtimeOrchestrationCliCommand, localOrchestrationCliCommand, resolveTerminalOrchestrationCliCommand } from './cli-command'
import { buildDispatchPreamble } from './preamble'
import { formatMessagePointer } from './formatter'
import { compactDispatchPromptForStatus, ORCA_DISPATCH_PROMPT_LEAD_LINE } from '../../../shared/orca-dispatch-status-prompt'

const host = vi.hoisted(() => ({ packaged: true }))
vi.mock('../../../shared/app-environment', () => ({
  hasAppEnvironment: () => true,
  getAppEnvironment: () => ({ isPackaged: () => host.packaged, getCliAccountCommand: () => 'zkyq' })
}))

describe('installed workbench command in agent instructions', () => {
  it('selects zkyq for WSL while preserving an explicit dev command', () => {
    const worker = { connectionId: null, isWsl: true, worktreeId: 'repo::/repo' }
    expect(resolveTerminalOrchestrationCliCommand(worker)).toBe('zkyq')
    expect(resolveTerminalOrchestrationCliCommand({ ...worker, runtimeCliCommand: 'zkyq-dev' })).toBe('zkyq-dev')
  })
  it('keeps historical stored briefs readable while emitting current status wording', () => {
    const stored = 'Please carry out this task from my Orca coordinator by following the brief I pasted below.\n' +
      '<pasted_content>\nYou are working inside Orca, a multi-agent IDE.\nYour task ID is: task_old\n=== TASK ===\nPreserve Orca user text\n</pasted_content>'
    const compact = compactDispatchPromptForStatus(stored, 200, (value, limit) => value.slice(0, limit))
    expect(compact).toContain('Control Everything')
    expect(compact).toContain('Your task ID is: task_old')
    expect(compact).toContain('=== TASK === Preserve Orca user text')
  })
  it.each([true, false])('uses the installed command for a packaged=%s host', (packaged) => {
    host.packaged = packaged
    expect(runtimeOrchestrationCliCommand()).toBe('zkyq')
    expect(localOrchestrationCliCommand()).toBe('zkyq')
    const command = resolveTerminalOrchestrationCliCommand({
      connectionId: null, isWsl: false, worktreeId: 'repo::/repo',
      runtimeCliCommand: runtimeOrchestrationCliCommand()
    })
    const text = buildDispatchPreamble({
      taskId: 'task_test', dispatchId: 'dispatch_test', taskSpec: 'Preserve Orca user text',
      coordinatorHandle: 'term_coordinator', workerHandle: 'term_worker', devMode: !packaged,
      cliCommand: command
    })
    expect(text).toContain('Control Everything')
    expect(text).toContain('zkyq orchestration send')
    expect(text).toContain('Preserve Orca user text')
    expect(text).not.toMatch(/orca(?:-dev|-ide)? orchestration/)
    expect(formatMessagePointer(1, 'run:test', command)).toContain('zkyq orchestration check')
    const compact = compactDispatchPromptForStatus(
      `${ORCA_DISPATCH_PROMPT_LEAD_LINE}\n<pasted_content>\n${text}\n</pasted_content>`,
      200, (value, maxLength) => value.slice(0, maxLength)
    )
    expect(compact).toContain('Control Everything')
    expect(compact).toContain('Your task ID is: task_test')
    expect(compact).toContain('=== TASK === Preserve Orca user text')
  })
})
