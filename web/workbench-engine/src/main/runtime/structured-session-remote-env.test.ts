import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { sealStructuredSessionChild } from './structured-session-child-env'

it('isolates new and retired remote selectors in the launched session', () => {
  const names = [
    'ZKYQ_ENVIRONMENT',
    'ZKYQ_PAIRING_CODE',
    'ZKYQ_REMOTE_PAIRING',
    'ORCA_ENVIRONMENT',
    'ORCA_PAIRING_CODE',
    'ORCA_REMOTE_PAIRING'
  ]
  const inherited = Object.fromEntries(names.map((name) => [name, 'other-host']))
  const sealed = sealStructuredSessionChild({
    sessionId: 'fixture-session',
    spawnToken: 'fixture-token',
    env: inherited,
    inheritedEnvToDelete: []
  })
  for (const name of names) {
    expect(sealed.commandEnv[name]).toBe('')
  }
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `process.stdout.write(JSON.stringify(${JSON.stringify(names)}.map(k => process.env[k])))`
    ],
    { env: { ...process.env, ...sealed.env }, encoding: 'utf8' }
  )
  expect(JSON.parse(output)).toEqual(names.map(() => ''))
})
