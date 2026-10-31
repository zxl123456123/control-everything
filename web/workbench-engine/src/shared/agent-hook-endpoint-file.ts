export const AGENT_HOOK_ENDPOINT_FILE_NAMES = [
  'endpoint-v2.env',
  'endpoint-v2.cmd',
  'endpoint.env',
  'endpoint.cmd'
] as const

export type AgentHookEndpointFileName = (typeof AGENT_HOOK_ENDPOINT_FILE_NAMES)[number]

export type AgentHookEndpoint = {
  port: string
  token: string
  env: string
  version: string
}

export function isAgentHookEndpointFileName(name: string): name is AgentHookEndpointFileName {
  return AGENT_HOOK_ENDPOINT_FILE_NAMES.some((fileName) => fileName === name)
}

export function parseAgentHookEndpointFile(contents: string): AgentHookEndpoint {
  const values = Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const normalizedLine = line.replace(/^set\s+/i, '')
        const [key, ...rest] = normalizedLine.split('=')
        return [key, rest.join('=')]
      })
  )
  for (const suffix of ['PORT', 'TOKEN', 'ENV', 'VERSION']) {
    const current = `ZKYQ_AGENT_HOOK_${suffix}`
    const retired = `ORCA_AGENT_HOOK_${suffix}`
    if (
      values[current] !== undefined &&
      values[retired] !== undefined &&
      values[current] !== values[retired]
    ) {
      throw new Error(`Conflicting agent hook endpoint fields: ${current} and ${retired}`)
    }
    if (values[current] === undefined && values[retired] !== undefined)
      values[current] = values[retired]
  }
  if (
    !values.ZKYQ_AGENT_HOOK_PORT ||
    !values.ZKYQ_AGENT_HOOK_TOKEN ||
    !values.ZKYQ_AGENT_HOOK_ENV ||
    !values.ZKYQ_AGENT_HOOK_VERSION
  ) {
    throw new Error('Agent hook endpoint file is missing required fields')
  }
  return {
    port: values.ZKYQ_AGENT_HOOK_PORT,
    token: values.ZKYQ_AGENT_HOOK_TOKEN,
    env: values.ZKYQ_AGENT_HOOK_ENV,
    version: values.ZKYQ_AGENT_HOOK_VERSION
  }
}
