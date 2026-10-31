import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNativeChatSessionOptionCacheForTests } from './native-chat-session-option-cache'
import { createNativeChatPtySessionOptions } from './native-chat-pty-session-options'
import {
  normalizeAgentStatusPayload,
  pickParsedAgentStatusPayload
} from '../../../../shared/agent-status-types'
import { createHookListenerState } from '../../../../shared/agent-hook-listener/listener-state'
import { normalizePiCompatibleEvent } from '../../../../shared/agent-hook-listener/providers/pi-family-events'

describe('OMP model command capability', () => {
  beforeEach(() => clearNativeChatSessionOptionCacheForTests())

  it.each([undefined, 'zkyq-model', 'orca-model'] as const)(
    'only enables a live command after host advertisement: %s',
    async (ompModelSwitchCommand) => {
      const dispatchCommand = vi.fn()
      const surface = createNativeChatPtySessionOptions({
        agent: 'omp',
        scopeKey: 'omp-model-test',
        mode: 'live',
        ompModelSwitchCommand,
        initialModels: [
          { id: 'openai/a', label: 'A', options: [] },
          { id: 'openai/b', label: 'B', options: [] }
        ],
        reportedValues: { model: 'openai/a' },
        dispatchCommand
      })
      if (!surface) {
        throw new Error('expected OMP surface')
      }
      expect(surface.getSnapshot()[0].settable).toBe(ompModelSwitchCommand !== undefined)
      if (ompModelSwitchCommand) {
        await surface.setOption('model', 'openai/b')
        expect(dispatchCommand).toHaveBeenCalledWith(`/${ompModelSwitchCommand} openai/b`)
      } else {
        await expect(surface.setOption('model', 'openai/b')).rejects.toThrow()
        expect(dispatchCommand).not.toHaveBeenCalled()
      }
    }
  )

  it('preserves only the recognized capability through normalization and remote projection', () => {
    for (const command of ['zkyq-model', 'orca-model', 'arbitrary-command', undefined]) {
      const payload = normalizeAgentStatusPayload({
        state: 'done',
        agentType: 'omp',
        modelSwitchCommand: command
      })
      if (!payload) {
        throw new Error('expected status')
      }
      expect(pickParsedAgentStatusPayload(payload).modelSwitchCommand).toBe(
        command === 'zkyq-model' || command === 'orca-model' ? command : undefined
      )
      const received = normalizePiCompatibleEvent(
        createHookListenerState(),
        'omp',
        'agent_start',
        '',
        'pane',
        { model_switch_command: command }
      )
      expect(received?.modelSwitchCommand).toBe(payload.modelSwitchCommand)
    }
  })
})
