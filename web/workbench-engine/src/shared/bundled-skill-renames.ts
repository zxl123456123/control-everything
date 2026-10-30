// Historical names are only migration inputs, never executable skill aliases.
export const BUNDLED_SKILL_RENAMES: Readonly<Record<string, string>> = {
  'orca-cli': 'zkyq-cli',
  'orca-emulator': 'zkyq-emulator',
  'orca-emulator-android': 'zkyq-emulator-android',
  'orca-jira': 'zkyq-jira',
  'orca-linear': 'zkyq-linear',
  'orca-per-workspace-env': 'zkyq-per-workspace-env'
}
