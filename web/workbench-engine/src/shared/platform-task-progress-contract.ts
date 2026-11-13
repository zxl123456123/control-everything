import { z } from 'zod'
import { isTuiAgent } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'
import { ProviderSession } from './rpc-contract/agent-session-params'

const Id = z.string().min(1).max(1024)
export const PlatformProgressAgent = z.custom<TuiAgent>(isTuiAgent, 'Unknown agent preset')
export const PlatformProgressBinding = z.object({
  runtimeId: Id, environmentId: Id, terminalHandle: Id, paneKey: Id,
  worktreeId: Id, agent: PlatformProgressAgent, providerSession: ProviderSession.nullable(),
  ptyId: Id, processIncarnation: Id, statusProcessIncarnation: Id, generation: z.number().int().nonnegative(),
  tabId: Id.optional()
}).strict()
export type PlatformProgressBinding = z.infer<typeof PlatformProgressBinding>
const Scope = {
  contractVersion: z.literal(1), runtimeId: Id, environmentId: Id, repoId: Id,
  worktreeId: Id, agent: PlatformProgressAgent
} as const
export const PlatformProgressCreate = z.object({
  ...Scope, cwd: z.string().min(1).max(32768), prompt: z.string().min(1).max(131072),
  operationId: z.string().regex(/^\d{13}-[0-9a-f]{32}$/),
  model: z.enum(['gpt-6-astra', 'gpt-6.1-sol']).optional()
}).strict().refine(p => p.model === undefined || p.agent === 'codex', 'Explicit model requires Codex')
export const PlatformProgressResume = z.object({ ...Scope, providerSession: ProviderSession }).strict()
const ObserveBound = z.object({
  contractVersion: z.literal(1), expectedBinding: PlatformProgressBinding
}).strict()
export const PlatformProgressStop = ObserveBound
export const PlatformProgressObserve = z.union([ObserveBound, z.object({
  contractVersion: z.literal(1), bindingQuery: PlatformProgressResume
}).strict()])
export const PlatformProgressSend = z.object({
  contractVersion: z.literal(1), terminal: Id, text: z.string().min(1).max(131072),
  expectedBinding: PlatformProgressBinding,
  origin: z.object({ taskId: Id, nativeRunId: Id, messageId: Id, requestId: Id }).strict()
}).strict().refine(p => p.terminal === p.expectedBinding.terminalHandle && p.expectedBinding.providerSession !== null,
  'A send requires the exact bound provider session')
export const PlatformProgressReceipt = z.object({
  contractVersion: z.literal(1), requestId: Id,
  expectedSendParams: PlatformProgressSend, expectedBinding: PlatformProgressBinding
}).strict()
