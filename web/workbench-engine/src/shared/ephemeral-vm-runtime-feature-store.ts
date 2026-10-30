import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { readNodeFileSyncWithinLimit } from './node-bounded-file-reader'
import {
  JsonStringifyByteLimitError,
  stringifyJsonWithinByteLimit
} from './node-bounded-json-stringify'
import { writeSecureJsonFileWithinLimit } from './bounded-secure-json-file'
import { hardenExistingSecureFile } from './secure-file'
import {
  EphemeralVmRuntimeRecordSchema,
  type EphemeralVmRuntimeRecord
} from './ephemeral-vm-runtimes'

const EPHEMERAL_VM_RUNTIME_FEATURES_FILE = 'orca-ephemeral-vm-runtime-features.json'
export const MAX_EPHEMERAL_VM_RUNTIME_FEATURE_STORE_FILE_BYTES = 1024 * 1024

const EphemeralVmRuntimeFeatureEntrySchema = z
  .object({
    id: z.string().min(1),
    recipeId: z.string().min(1),
    createdAt: z.number().finite(),
    recipeCheckoutMode: z.enum(['orca-worktree', 'provisioned-root']).optional(),
    resultCheckoutMode: z.literal('provisioned-root').optional()
  })
  .strict()

export type EphemeralVmRuntimeFeatureEntry = z.infer<
  typeof EphemeralVmRuntimeFeatureEntrySchema
> & {
  recipeEnvironmentContract?: 'zkyq'
}

// Kept separate so older builds preserve this unknown record without losing checkout metadata.
const RecipeEnvironmentContractSchema = z
  .object({
    kind: z.literal('recipe-environment-contract'),
    id: z.string().min(1),
    recipeId: z.string().min(1),
    createdAt: z.number().finite(),
    contract: z.literal('zkyq')
  })
  .strict()

const EphemeralVmRuntimeFeatureStoreSchema = z
  .object({
    version: z.literal(1),
    records: z.array(z.unknown())
  })
  .strict()

export type EphemeralVmRuntimeFeatureStoreSnapshot =
  | {
      writable: true
      features: EphemeralVmRuntimeFeatureEntry[]
      retainedRecords: unknown[]
    }
  | {
      writable: false
      features: []
      retainedRecords: []
    }

export function getEphemeralVmRuntimeFeatureStorePath(userDataPath: string): string {
  return join(userDataPath, EPHEMERAL_VM_RUNTIME_FEATURES_FILE)
}

export function assertEphemeralVmRuntimeFeaturesCanPersist(
  userDataPath: string,
  args: {
    id: string
    recipeId: string
    createdAt: number
    checkoutMode?: NonNullable<NonNullable<EphemeralVmRuntimeRecord['recipe']>['checkoutMode']>
    environmentContract?: 'zkyq'
  }
): void {
  const snapshot = readEphemeralVmRuntimeFeatureStore(userDataPath)
  if (!snapshot.writable) {
    throw new Error('Could not preserve ephemeral VM runtime compatibility metadata.')
  }
  const required: EphemeralVmRuntimeFeatureEntry = {
    id: args.id,
    recipeId: args.recipeId,
    createdAt: args.createdAt,
    ...(args.checkoutMode ? { recipeCheckoutMode: args.checkoutMode } : {}),
    ...(args.environmentContract ? { recipeEnvironmentContract: args.environmentContract } : {}),
    ...(args.checkoutMode === 'provisioned-root' ? { resultCheckoutMode: 'provisioned-root' } : {})
  }
  try {
    assertFeatureStoreCanPersist(snapshot, mergeFeatureEntries(snapshot.features, [required]))
  } catch (error) {
    if (error instanceof JsonStringifyByteLimitError) {
      throw new Error(
        'Could not preserve ephemeral VM runtime compatibility metadata; the feature store exceeds its durable capacity.'
      )
    }
    throw error
  }
}

export function readEphemeralVmRuntimeFeatureStore(
  userDataPath: string
): EphemeralVmRuntimeFeatureStoreSnapshot {
  const path = getEphemeralVmRuntimeFeatureStorePath(userDataPath)
  if (!existsSync(path)) {
    return { writable: true, features: [], retainedRecords: [] }
  }
  try {
    hardenExistingSecureFile(path)
    const parsed = EphemeralVmRuntimeFeatureStoreSchema.parse(
      JSON.parse(
        readNodeFileSyncWithinLimit(
          path,
          MAX_EPHEMERAL_VM_RUNTIME_FEATURE_STORE_FILE_BYTES
        ).buffer.toString('utf8')
      )
    )
    return parseFeatureRecords(parsed.records)
  } catch {
    return { writable: false, features: [], retainedRecords: [] }
  }
}

export function writeEphemeralVmRuntimeFeatureStore(
  userDataPath: string,
  snapshot: EphemeralVmRuntimeFeatureStoreSnapshot,
  features: EphemeralVmRuntimeFeatureEntry[]
): void {
  if (!snapshot.writable) {
    throw new Error('The ephemeral VM runtime feature store is not writable.')
  }
  writeSecureJsonFileWithinLimit(
    getEphemeralVmRuntimeFeatureStorePath(userDataPath),
    runtimeFeatureStoreValue(snapshot, features),
    MAX_EPHEMERAL_VM_RUNTIME_FEATURE_STORE_FILE_BYTES,
    { durable: true }
  )
}

function assertFeatureStoreCanPersist(
  snapshot: EphemeralVmRuntimeFeatureStoreSnapshot,
  features: EphemeralVmRuntimeFeatureEntry[]
): void {
  if (!snapshot.writable) {
    throw new Error('The ephemeral VM runtime feature store is not writable.')
  }
  stringifyJsonWithinByteLimit(
    runtimeFeatureStoreValue(snapshot, features),
    MAX_EPHEMERAL_VM_RUNTIME_FEATURE_STORE_FILE_BYTES
  )
}

function mergeFeatureEntries(
  existing: readonly EphemeralVmRuntimeFeatureEntry[],
  required: readonly EphemeralVmRuntimeFeatureEntry[]
): EphemeralVmRuntimeFeatureEntry[] {
  const merged = new Map(existing.map((entry) => [featureIdentity(entry), entry]))
  for (const entry of required) {
    merged.set(featureIdentity(entry), entry)
  }
  return sortRuntimeFeatures([...merged.values()])
}

export function featureEntryFromRuntime(
  runtime: EphemeralVmRuntimeRecord
): EphemeralVmRuntimeFeatureEntry | null {
  const recipeCheckoutMode = runtime.recipe?.checkoutMode
  const recipeEnvironmentContract = runtime.recipe?.environmentContract
  const resultCheckoutMode =
    runtime.recipeResult.schemaVersion === 2 ? runtime.recipeResult.checkoutMode : undefined
  if (!recipeCheckoutMode && !resultCheckoutMode && !recipeEnvironmentContract) {
    return null
  }
  return {
    id: runtime.id,
    recipeId: runtime.recipeId,
    createdAt: runtime.createdAt,
    ...(recipeCheckoutMode ? { recipeCheckoutMode } : {}),
    ...(recipeEnvironmentContract ? { recipeEnvironmentContract } : {}),
    ...(resultCheckoutMode ? { resultCheckoutMode } : {})
  }
}

export function restoreRuntimeFeatureList(
  runtimes: readonly EphemeralVmRuntimeRecord[],
  features: readonly EphemeralVmRuntimeFeatureEntry[]
): EphemeralVmRuntimeRecord[] {
  const byIdentity = new Map<string, EphemeralVmRuntimeFeatureEntry>()
  for (const feature of features) {
    const identity = featureIdentity(feature)
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, feature)
    }
  }
  return runtimes.map((runtime) =>
    restoreRuntimeFeatures(runtime, byIdentity.get(featureIdentity(runtime)))
  )
}

function restoreRuntimeFeatures(
  runtime: EphemeralVmRuntimeRecord,
  feature: EphemeralVmRuntimeFeatureEntry | undefined
): EphemeralVmRuntimeRecord {
  if (!feature) {
    return runtime
  }
  return EphemeralVmRuntimeRecordSchema.parse({
    ...runtime,
    ...(runtime.recipe && (feature.recipeCheckoutMode || feature.recipeEnvironmentContract)
      ? {
          recipe: {
            ...runtime.recipe,
            ...(feature.recipeCheckoutMode ? { checkoutMode: feature.recipeCheckoutMode } : {}),
            ...(feature.recipeEnvironmentContract
              ? { environmentContract: feature.recipeEnvironmentContract }
              : {})
          }
        }
      : {}),
    ...(feature.resultCheckoutMode
      ? {
          recipeResult: {
            ...runtime.recipeResult,
            schemaVersion: 2,
            checkoutMode: feature.resultCheckoutMode
          }
        }
      : {})
  })
}

export function runtimeFeaturesEqual(
  left: EphemeralVmRuntimeRecord,
  right: EphemeralVmRuntimeRecord
): boolean {
  return (
    JSON.stringify(featureEntryFromRuntime(left)) === JSON.stringify(featureEntryFromRuntime(right))
  )
}

export function featureIdentity(
  value: Pick<EphemeralVmRuntimeRecord, 'id' | 'recipeId' | 'createdAt'>
): string {
  return `${value.id}\0${value.recipeId}\0${value.createdAt}`
}

function parseFeatureRecords(records: unknown[]): EphemeralVmRuntimeFeatureStoreSnapshot {
  const features: EphemeralVmRuntimeFeatureEntry[] = []
  const retainedRecords: unknown[] = []
  const identities = new Map<string, string>()
  const contracts = new Map<string, z.infer<typeof RecipeEnvironmentContractSchema>>()
  for (const record of records) {
    const contract = RecipeEnvironmentContractSchema.safeParse(record)
    if (contract.success) {
      const identity = featureIdentity(contract.data)
      const existing = contracts.get(identity)
      if (existing && JSON.stringify(existing) !== JSON.stringify(contract.data)) {
        return { writable: false, features: [], retainedRecords: [] }
      }
      contracts.set(identity, contract.data)
      continue
    }
    const parsed = EphemeralVmRuntimeFeatureEntrySchema.safeParse(record)
    if (!parsed.success) {
      retainedRecords.push(record)
      continue
    }
    const identity = featureIdentity(parsed.data)
    const serialized = JSON.stringify(parsed.data)
    const existing = identities.get(identity)
    if (existing && existing !== serialized) {
      return { writable: false, features: [], retainedRecords: [] }
    }
    if (!existing) {
      identities.set(identity, serialized)
      features.push(parsed.data)
    }
  }
  const featuresByIdentity = new Map(features.map((feature) => [featureIdentity(feature), feature]))
  for (const [identity, contract] of contracts) {
    const existing = featuresByIdentity.get(identity)
    if (existing) {
      existing.recipeEnvironmentContract = contract.contract
    } else {
      features.push({
        id: contract.id,
        recipeId: contract.recipeId,
        createdAt: contract.createdAt,
        recipeEnvironmentContract: contract.contract
      })
    }
  }
  return {
    writable: true,
    features: sortRuntimeFeatures(features).map((feature) => ({
      id: feature.id,
      recipeId: feature.recipeId,
      createdAt: feature.createdAt,
      ...(feature.recipeCheckoutMode ? { recipeCheckoutMode: feature.recipeCheckoutMode } : {}),
      ...(feature.recipeEnvironmentContract
        ? { recipeEnvironmentContract: feature.recipeEnvironmentContract }
        : {}),
      ...(feature.resultCheckoutMode ? { resultCheckoutMode: feature.resultCheckoutMode } : {})
    })),
    retainedRecords
  }
}

export function sortRuntimeFeatures<T extends { id: string; recipeId: string; createdAt: number }>(
  features: readonly T[]
): T[] {
  return features
    .map((feature) => ({ feature, identity: featureIdentity(feature) }))
    .sort((left, right) => left.identity.localeCompare(right.identity))
    .map(({ feature }) => feature)
}

function runtimeFeatureStoreValue(
  snapshot: Extract<EphemeralVmRuntimeFeatureStoreSnapshot, { writable: true }>,
  features: EphemeralVmRuntimeFeatureEntry[]
): { version: 1; records: unknown[] } {
  return {
    version: 1,
    records: [
      ...sortRuntimeFeatures(features).flatMap(({ recipeEnvironmentContract, ...base }) => [
        ...(base.recipeCheckoutMode || base.resultCheckoutMode || !recipeEnvironmentContract
          ? [base]
          : []),
        ...(recipeEnvironmentContract
          ? [
              {
                kind: 'recipe-environment-contract',
                id: base.id,
                recipeId: base.recipeId,
                createdAt: base.createdAt,
                contract: recipeEnvironmentContract
              }
            ]
          : [])
      ]),
      ...snapshot.retainedRecords
    ]
  }
}
