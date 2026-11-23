import {
  createSessionSearchClient,
  unavailableSessionSearchStatus
} from '../../../../shared/ai-vault-search-client'
import type { PreloadApi } from '../../../../preload/api-types'
import type {
  AiVaultPrepareSessionResumeRequest,
  AiVaultPrepareSessionResumeResult
} from '../../../../shared/ai-vault-resume-preparation'
import type { AiVaultDeleteSessionArgs } from '../../../../shared/ai-vault-session-deletion'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../../shared/ai-vault-session-title'
import {
  AI_VAULT_SCAN_CANCELLED_MESSAGE,
  type AiVaultListArgs,
  type AiVaultListResult
} from '../../../../shared/ai-vault-types'
import {
  normalizeExecutionHostId,
  normalizeExecutionHostScope,
  toRuntimeExecutionHostId
} from '../../../../shared/execution-host'
import type { ExecutionHostId, ExecutionHostScope } from '../../../../shared/execution-host'
import { callRuntimeResult } from './web-runtime-calls'
import { requireActiveEnvironment } from './web-runtime-session'
import { noopUnsubscribe } from './web-storage'
import { translate } from '@/i18n/i18n'

export function createWebAiVaultApi(): NonNullable<Partial<PreloadApi>['aiVault']> {
  const pendingScans = new Map<string, AbortController>()
  const search = createSessionSearchClient(
    (method, params) => callRuntimeResult(method, params),
    'relay'
  )
  return {
    // A browser searches only its selected paired runtime.
    searchSessions: (request, executionHostScope) =>
      addressesOwnRuntime(executionHostScope)
        ? search.searchSessions(request)
        : Promise.resolve({ kind: 'unavailable', reason: 'no-service' }),
    searchStatus: (executionHostScope) =>
      addressesOwnRuntime(executionHostScope)
        ? search.searchStatus()
        : Promise.resolve(unavailableSessionSearchStatus()),
    // Why refused and not forwarded: consent for a host's index is an operator action,
    // and the browser client has no desktop settings surface to reconcile it against.
    setSearchEnabled: () => Promise.reject(new Error('unsupported')),
    clearSearchIndex: () =>
      Promise.reject(new Error('Clearing Agent Session History is unavailable in the browser.')),
    listSessions: (args?: AiVaultListArgs) => {
      const environment = requireActiveEnvironment()
      const executionHostId = toRuntimeExecutionHostId(environment.id)
      const requestedScope = normalizeExecutionHostScope(
        args?.executionHostScope ?? executionHostId
      )
      if (requestedScope !== 'all' && requestedScope !== executionHostId) {
        return Promise.resolve(webAiVaultUnavailableResult(requestedScope))
      }
      const requestToken = args?.requestToken
      const controller = new AbortController()
      if (requestToken !== undefined) {
        pendingScans.get(requestToken)?.abort(new Error(AI_VAULT_SCAN_CANCELLED_MESSAGE))
        pendingScans.set(requestToken, controller)
      }
      // Why: no local filesystem in the browser, so every history scan runs on and is stamped as the paired runtime host.
      return callRuntimeResult<AiVaultListResult>(
        'aiVault.listSessions',
        {
          includeAntigravityIdeSessions: args?.includeAntigravityIdeSessions,
          limit: args?.limit,
          force: args?.force,
          ...(requestedScope === executionHostId && args?.afterFingerprint !== undefined
            ? { afterFingerprint: args.afterFingerprint }
            : {}),
          scopePaths: args?.scopePaths,
          executionHostId
        },
        undefined,
        controller.signal
      ).finally(() => {
        // A replacement scan may already own this token when the older rejection settles.
        if (requestToken !== undefined && pendingScans.get(requestToken) === controller) {
          pendingScans.delete(requestToken)
        }
      })
    },
    resolveSessionTitles: (args: AiVaultSessionTitlesArgs) => {
      const environment = requireActiveEnvironment()
      const executionHostId = toRuntimeExecutionHostId(environment.id)
      if (
        args.executionHostScope &&
        normalizeExecutionHostScope(args.executionHostScope) !== executionHostId
      ) {
        return Promise.resolve({ titles: [] })
      }
      return callRuntimeResult<AiVaultSessionTitlesResult>('aiVault.resolveSessionTitles', {
        requests: args.requests
      }).catch(() => ({ titles: [] }))
    },
    // The RPC has no cancel verb: release this caller's wait and queue slot,
    // while the host scan can finish or be preempted by the next forced refresh.
    cancelListSessions: ({ requestToken }) => {
      const controller = pendingScans.get(requestToken)
      pendingScans.delete(requestToken)
      controller?.abort(new Error(AI_VAULT_SCAN_CANCELLED_MESSAGE))
      return Promise.resolve()
    },
    prepareSessionResume: (args: AiVaultPrepareSessionResumeRequest) =>
      callRuntimeResult<AiVaultPrepareSessionResumeResult>('aiVault.prepareSessionResume', args),
    // Why: no server-side RPC for subagent transcript listing yet, so report an empty (not erroring) result.
    listSubagentSessions: () => Promise.resolve({ sessions: [], issues: [] }),
    // Why: full first-prompt re-parse is local-FS only; web/runtime falls back to preview text.
    getFirstUserPrompt: () => Promise.resolve({ prompt: null }),
    // Why: session deletion is local-only and has no runtime RPC; a web
    // client's sessions are runtime-hosted, so report the same non-local
    // rejection the UI already gates on rather than pretend to delete.
    deleteSession: (args: AiVaultDeleteSessionArgs) =>
      Promise.resolve({
        outcome: 'rejected',
        agent: args.agent,
        reason: 'non-local-host' as const
      }),
    onWindowFocused: () => noopUnsubscribe,
    // Why: the runtime RPC has no progress stream, so the panel keeps its plain spinner here.
    getScanProgress: () => Promise.resolve(null),
    onScanProgress: () => noopUnsubscribe
  }
}

// An unparseable id must not normalize into the everything-scope and answer anyway.
// `all` is a desktop-side merge; it never normalizes to this runtime, so a browser reports no-service.
function addressesOwnRuntime(executionHostScope: ExecutionHostScope | undefined): boolean {
  const ownRuntimeId = toRuntimeExecutionHostId(requireActiveEnvironment().id)
  return (
    executionHostScope === undefined ||
    normalizeExecutionHostId(executionHostScope) === ownRuntimeId
  )
}

export function webAiVaultUnavailableResult(executionHostId: ExecutionHostId): AiVaultListResult {
  return {
    sessions: [],
    issues: [
      {
        executionHostId,
        agent: 'codex',
        path: executionHostId,
        message: translate(
          'auto.web.webPreloadApi.aiVaultUnavailableForHost',
          'Agent Session History is not available for this execution host.'
        )
      }
    ],
    scannedAt: new Date().toISOString()
  }
}
