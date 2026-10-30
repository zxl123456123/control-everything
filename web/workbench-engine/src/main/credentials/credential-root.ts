import { lstatSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { isPlatformRuntime } from '../platform-runtime-policy'

/** A configured platform root must already be a directory inside this profile. */
export function credentialRoot(): string {
  const selected = process.env.CE_WORKBENCH_CREDENTIAL_ROOT
  if (selected === undefined || !isPlatformRuntime()) return join(homedir(), '.orca')
  const userData = process.env.ZKYQ_USER_DATA
  if (!selected || !userData || !isAbsolute(selected) || !isAbsolute(userData)) {
    throw new Error('platform_credential_root_invalid')
  }
  try {
    if (!lstatSync(selected).isDirectory() || !lstatSync(userData).isDirectory()) {
      throw new Error('platform_credential_root_invalid')
    }
    const root = realpathSync(selected)
    const profile = realpathSync(userData)
    const path = relative(profile, root)
    if (!path || path === '..' || path.startsWith('..\\') || path.startsWith('../') || isAbsolute(path)) {
      throw new Error('platform_credential_root_invalid')
    }
    return root
  } catch {
    throw new Error('platform_credential_root_invalid')
  }
}

export function hasExplicitPlatformCredentialRoot(): boolean {
  return process.env.CE_WORKBENCH_CREDENTIAL_ROOT !== undefined && isPlatformRuntime()
}
