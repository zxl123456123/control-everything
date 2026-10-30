export function getOrcaCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'zkyq'
  }
  if (platform === 'win32') {
    return 'zkyq.exe'
  }
  return 'orca'
}
