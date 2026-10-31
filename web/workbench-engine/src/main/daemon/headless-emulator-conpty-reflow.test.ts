import { describe, expect, it } from 'vitest'
import { HeadlessEmulator } from './headless-emulator'

describe('ConPTY cursor line reflow', () => {
  const prompt = `PS C:/example/${'p'.repeat(75)}> `

  it('retains a long active prompt when the native console shrinks and grows', async () => {
    const emulator = new HeadlessEmulator({ cols: 119, rows: 10, conpty: true })
    try {
      await emulator.write(`completed\r\n${prompt}`)
      emulator.resize(87, 10)
      expect(emulator.getVisibleLines().join('')).toContain(prompt.trimEnd())
      // ConPTY moves the cursor explicitly after reflowing its 91-cell prompt.
      await emulator.write('\x1b[3;5H')
      emulator.resize(139, 10)
      expect(emulator.getVisibleLines().map((line) => line.trimEnd())).toContain(prompt.trimEnd())
      expect(emulator.getVisibleLines()).toContain('completed')
    } finally {
      emulator.dispose()
    }
  })

  it('leaves a POSIX shell in charge of repainting its active line', async () => {
    const emulator = new HeadlessEmulator({ cols: 119, rows: 10, conpty: false })
    try {
      await emulator.write(prompt)
      emulator.resize(87, 10)
      expect(emulator.getVisibleLines()[1]).toBe('')
    } finally {
      emulator.dispose()
    }
  })
})
