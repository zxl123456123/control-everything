import { browserStorage } from '../web/remote-context'
export const ORCHESTRATION_SETUP_STATE_EVENT = 'orca:orchestration-setup-state'
export const ORCHESTRATION_ENABLED_STORAGE_KEY = 'orca.orchestration.enabled'
export const ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY = 'orca.orchestration.setupDismissed'

export function isOrchestrationSetupEnabled(): boolean {
  return browserStorage('localStorage').getItem(ORCHESTRATION_ENABLED_STORAGE_KEY) === '1'
}

export function hasOrchestrationSetupMarker(): boolean {
  return isOrchestrationSetupEnabled()
}

export function markOrchestrationSetupComplete(): void {
  browserStorage('localStorage').setItem(ORCHESTRATION_ENABLED_STORAGE_KEY, '1')
  notifyOrchestrationSetupStateChanged()
}

export function isOrchestrationSetupDismissed(): boolean {
  return browserStorage('localStorage').getItem(ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY) === '1'
}

export function notifyOrchestrationSetupStateChanged(): void {
  window.dispatchEvent(new CustomEvent(ORCHESTRATION_SETUP_STATE_EVENT))
}
