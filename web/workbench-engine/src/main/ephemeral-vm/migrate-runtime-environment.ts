import {
  assertProfileStateMaintenanceRoot,
  type ProfileStateMaintenance
} from '../persistence/profile-state/profile-state-access'
import { listEphemeralVmRuntimes } from '../../shared/ephemeral-vm-runtime-store'
import {
  featureEntryFromRuntime,
  featureIdentity,
  readEphemeralVmRuntimeFeatureStore,
  writeEphemeralVmRuntimeFeatureStore
} from '../../shared/ephemeral-vm-runtime-feature-store'

/** Mark one reviewed snapshot after taking the profile's real maintenance owner. */
export function migrateRuntimeEnvironment(args: {
  userDataPath: string
  runtimeId: string
  recipeId: string
  maintenance: ProfileStateMaintenance
}): { runtimeId: string; recipeId: string; changed: boolean } {
  assertProfileStateMaintenanceRoot(args.maintenance, args.userDataPath)
  const snapshot = readEphemeralVmRuntimeFeatureStore(args.userDataPath)
  if (!snapshot.writable) throw new Error('The VM runtime feature store is not writable.')
  const runtime = listEphemeralVmRuntimes(args.userDataPath, { writeMigrations: false }).find(
    (entry) => entry.id === args.runtimeId
  )
  if (!runtime) throw new Error('VM runtime was not found.')
  if (runtime.recipeId !== args.recipeId) throw new Error('The runtime recipe id does not match.')
  if (!runtime.recipe || runtime.recipe.id !== runtime.recipeId)
    throw new Error('The runtime has no matching saved recipe snapshot.')
  if (
    runtime.status === 'cleaned' ||
    runtime.status === 'cleanup_pending' ||
    runtime.cleanupStatus === 'running'
  ) {
    throw new Error('The runtime is already cleaned or cleanup is in progress.')
  }
  if (runtime.recipe.environmentContract === 'zkyq') {
    return { runtimeId: runtime.id, recipeId: runtime.recipeId, changed: false }
  }
  const updated = {
    ...runtime,
    recipe: { ...runtime.recipe, environmentContract: 'zkyq' as const }
  }
  const feature = featureEntryFromRuntime(updated)
  if (!feature) throw new Error('The runtime contract could not be prepared.')
  const identity = featureIdentity(feature)
  const features = [
    ...snapshot.features.filter((entry) => featureIdentity(entry) !== identity),
    feature
  ]
  writeEphemeralVmRuntimeFeatureStore(args.userDataPath, snapshot, features)
  const saved = listEphemeralVmRuntimes(args.userDataPath, { writeMigrations: false }).find(
    (entry) => entry.id === runtime.id
  )
  if (saved?.recipe?.environmentContract !== 'zkyq')
    throw new Error('The runtime contract could not be verified after writing.')
  return { runtimeId: runtime.id, recipeId: runtime.recipeId, changed: true }
}
