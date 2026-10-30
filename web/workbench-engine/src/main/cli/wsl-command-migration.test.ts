import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { WslCliInstaller } from './wsl-cli-installer'
import { buildWslLauncher, getBridgePathFromCommandPath } from './wsl-cli-scripts'
import { getWslCliRegistrationCandidates, recordWslCliRegistrationObservations } from './wsl-cli-registration-registry'
import type { CliInstallStatus } from '../../shared/cli-install-types'

const commandPath = '/home/example/.local/bin/zkyq'
const launcherPath = '/host/zkyq.exe'
const installed: CliInstallStatus = {
  platform: 'linux', commandName: 'zkyq', commandPath, launcherPath,
  pathDirectory: '/home/example/.local/bin', pathConfigured: true,
  installMethod: 'wrapper', supported: true, state: 'installed',
  currentTarget: launcherPath, unsupportedReason: null, detail: null
}

it.each(['orca', 'orca-ide'])('adopts the managed %s command before retiring it', async (name) => {
  const legacy = `/home/example/.local/bin/${name}`
  const runner = vi.fn(async (_distro: string, script: string) => {
    if (script === 'printf %s "$HOME"') return '/home/example'
    if (script.includes('command -v powershell.exe') || script.startsWith('case ')) return 'yes'
    if (script.includes(`cat '${legacy}'`)) return buildWslLauncher(launcherPath)
    return '__ORCA_MISSING__'
  })
  const installer = new WslCliInstaller({ platform: 'win32', distro: 'Ubuntu',
    hostInstaller: { getStatus: async () => installed }, wslRunner: runner })
  const install = vi.spyOn(installer, 'install').mockResolvedValue(installed)
  expect(await installer.repairManagedRegistration()).toEqual({ changed: true, managed: true, status: installed })
  expect(install).toHaveBeenCalledWith(expect.objectContaining({ commandName: 'zkyq', commandPath }))
  expect(getBridgePathFromCommandPath(commandPath)).toBe('/home/example/.local/share/orca/orca-wsl-bridge.ps1')
})

it.each(['not_file', '#!/bin/sh\necho user-owned'])('does not adopt foreign or linked legacy commands (%s)', async (legacy) => {
  const installer = new WslCliInstaller({ platform: 'win32', distro: 'Ubuntu',
    hostInstaller: { getStatus: async () => installed },
    wslRunner: async (_distro, script) => {
      if (script === 'printf %s "$HOME"') return '/home/example'
      if (script.includes('command -v powershell.exe') || script.startsWith('case ')) return 'yes'
      if (script.includes("cat '/home/example/.local/bin/orca")) return legacy
      return '__ORCA_MISSING__'
    }
  })
  const install = vi.spyOn(installer, 'install')
  expect(await installer.repairManagedRegistration()).toMatchObject({ changed: false, managed: false })
  expect(install).not.toHaveBeenCalled()
})

it('rechecks old reconciliation receipts without losing registered distros', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-wsl-command-'))
  const registry = join(root, 'wsl-cli-registrations.json')
  const context = { currentTarget: launcherPath, appVersion: 'fixture', now: 1000 }
  try {
    await writeFile(registry, JSON.stringify({ schemaVersion: 2, registeredDistros: ['Ubuntu'],
      inspectionTimes: { ubuntu: 999 }, reconciliations: { ubuntu: { target: launcherPath, appVersion: 'fixture' } } }))
    expect(await getWslCliRegistrationCandidates(root, ['Ubuntu'], context)).toEqual(['Ubuntu'])
    await recordWslCliRegistrationObservations(root, [{ distro: 'Ubuntu', inspected: true, managed: true,
      reconciled: { target: launcherPath, appVersion: 'fixture' } }], { now: 1000 })
    expect(await getWslCliRegistrationCandidates(root, ['Ubuntu'], context)).toEqual([])
    const saved = JSON.parse(await readFile(registry, 'utf8'))
    expect(saved.registeredDistros).toEqual(['Ubuntu'])
    expect(saved.reconciliations.ubuntu.commandName).toBe('zkyq')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
