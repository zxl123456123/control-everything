import { expect, it } from 'vitest'
import { redactEphemeralVmRecipeDiagnosticText } from './ephemeral-vm-recipe-diagnostics'

it.each(['zkyq', 'orca'])('redacts current and historical %s pairing credentials', (scheme) => {
  for (const separator of ['?code=', '#']) {
    const text = `Connection failed: ${scheme}://pair${separator}synthetic_secret==; retry later`
    const redacted = redactEphemeralVmRecipeDiagnosticText(text)
    expect(redacted).not.toContain('synthetic_secret')
    expect(redacted).toBe('Connection failed: zkyq://pair?code=[redacted]; retry later')
  }
})
