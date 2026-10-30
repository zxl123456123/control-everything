import type { RuntimeRepoList, RuntimeRepoSearchRefs } from '../../shared/runtime-types'
import type { CommandHandler } from '../dispatch'
import { formatRepoList, formatRepoRefs, formatRepoShow, printResult } from '../format'
import { getOptionalPositiveIntegerFlag, getRequiredStringFlag } from '../flags'
import { resolveRepoPathArgument } from '../repo-path-arguments'
import { RuntimeClientError } from '../runtime/types'
import { migrateProjectConfig } from '../project-config-migration'

export const REPO_HANDLERS: Record<string, CommandHandler> = {
  'repo migrate-config': async ({ flags, json }) => {
    if (flags.has('dry-run') && flags.get('dry-run') !== true) {
      throw new RuntimeClientError('invalid_argument', '--dry-run does not accept a value.')
    }
    if (
      flags.has('environment') ||
      flags.has('pairing-code') ||
      process.env.ORCA_ENVIRONMENT ||
      process.env.ORCA_PAIRING_CODE ||
      process.env.ORCA_REMOTE_PAIRING ||
      process.env.ORCA_CLI_CWD
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'This command runs locally. Clear remote selection and run it on the project host.'
      )
    }
    const result = migrateProjectConfig(
      getRequiredStringFlag(flags, 'path'),
      flags.get('dry-run') === true
    )
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : result.dryRun
          ? 'Ready to rename the project configuration.'
          : 'Project configuration renamed and staged by Git.'
    )
  },
  'repo list': async ({ client, json }) => {
    const result = await client.call<RuntimeRepoList>('repo.list')
    printResult(result, json, formatRepoList)
  },
  'repo add': async ({ flags, client, cwd, json }) => {
    const repoPath = getRequiredStringFlag(flags, 'path')
    const result = await client.call<{ repo: Record<string, unknown> }>('repo.add', {
      path: resolveRepoPathArgument(repoPath, cwd, client.isRemote, 'Remote repo add')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo show': async ({ flags, client, json }) => {
    const result = await client.call<{ repo: Record<string, unknown> }>('repo.show', {
      repo: getRequiredStringFlag(flags, 'repo')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo set': async ({ flags, client, json }) => {
    const repo = getRequiredStringFlag(flags, 'repo')
    const visibility = getRequiredStringFlag(flags, 'external-worktree-visibility')
    if (visibility !== 'show' && visibility !== 'hide' && visibility !== 'inherit') {
      throw new RuntimeClientError(
        'invalid_argument',
        '--external-worktree-visibility must be show, hide, or inherit.'
      )
    }
    const result = await client.call<{ repo: Record<string, unknown> }>('repo.update', {
      repo,
      updates: { externalWorktreeVisibility: visibility === 'inherit' ? null : visibility }
    })
    printResult(result, json, formatRepoShow)
  },
  'repo set-base-ref': async ({ flags, client, json }) => {
    const result = await client.call<{ repo: Record<string, unknown> }>('repo.setBaseRef', {
      repo: getRequiredStringFlag(flags, 'repo'),
      ref: getRequiredStringFlag(flags, 'ref')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo search-refs': async ({ flags, client, json }) => {
    const result = await client.call<RuntimeRepoSearchRefs>('repo.searchRefs', {
      repo: getRequiredStringFlag(flags, 'repo'),
      query: getRequiredStringFlag(flags, 'query'),
      limit: getOptionalPositiveIntegerFlag(flags, 'limit')
    })
    printResult(result, json, formatRepoRefs)
  }
}
