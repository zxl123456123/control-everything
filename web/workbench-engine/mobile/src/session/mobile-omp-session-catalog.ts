import type {
  AgentSessionOptionCatalog,
  CatalogModel
} from '../../../src/shared/agent-session-option-catalog'

export function mobileOmpSessionCatalog(
  catalog: AgentSessionOptionCatalog,
  models: CatalogModel[] | null | undefined,
  modelSwitchCommand: string | undefined
): AgentSessionOptionCatalog {
  return {
    ...catalog,
    models: models ?? catalog.models,
    modelApply: {
      ...catalog.modelApply,
      // Use the command implemented by the live extension, including a retained process.
      midSession:
        modelSwitchCommand === 'zkyq-model' || modelSwitchCommand === 'orca-model'
          ? { kind: 'command', build: (value) => `/${modelSwitchCommand} ${String(value)}` }
          : undefined
    }
  }
}
