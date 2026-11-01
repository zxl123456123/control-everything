const ENVIRONMENT_GROUPS = [
  ['ZKYQ_GITEA_TOKEN', 'ZKYQ_GITEA_API_BASE_URL'],
  [
    'ZKYQ_AZURE_DEVOPS_TOKEN',
    'ZKYQ_AZURE_DEVOPS_PAT',
    'ZKYQ_AZURE_DEVOPS_ACCESS_TOKEN',
    'ZKYQ_AZURE_DEVOPS_USERNAME',
    'ZKYQ_AZURE_DEVOPS_API_BASE_URL'
  ],
  [
    'ZKYQ_BITBUCKET_ACCESS_TOKEN',
    'ZKYQ_BITBUCKET_EMAIL',
    'ZKYQ_BITBUCKET_API_TOKEN',
    'ZKYQ_BITBUCKET_API_BASE_URL'
  ]
] as const

type SourceControlEnvironmentKey = (typeof ENVIRONMENT_GROUPS)[number][number]

/** Migrate one provider together before reading credentials, preserving its destination and token. */
export function readSourceControlEnvironment(name: SourceControlEnvironmentKey): string | null {
  const group = ENVIRONMENT_GROUPS.find((keys) => keys.some((key) => key === name))!
  const keys = group.map((current) => ({ current, retired: current.replace(/^ZKYQ_/, 'ORCA_') }))

  // Validate before changing any key. Error text may name settings, never their secret values.
  for (const { current, retired } of keys) {
    const previous = process.env[retired]?.trim()
    if (
      previous &&
      process.env[current] !== undefined &&
      process.env[current]?.trim() !== previous
    ) {
      throw new Error(
        `Conflicting source control environment variables: ${retired} and ${current}. Keep one value under ${current}, then restart Control Everything.`
      )
    }
  }
  for (const { current, retired } of keys) {
    if (process.env[current] === undefined && process.env[retired] !== undefined) {
      process.env[current] = process.env[retired]
    }
    delete process.env[retired]
  }

  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}
