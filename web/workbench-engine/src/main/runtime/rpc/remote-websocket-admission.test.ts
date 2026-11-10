import { describe, expect, it } from 'vitest'
import { RemoteWebSocketAdmission } from './remote-websocket-admission'

describe('remote WebSocket anonymous admission', () => {
  it('bounds outstanding reservations separately from the refillable attempt budget', () => {
    let now = 0
    const gate = new RemoteWebSocketAdmission(() => now)
    const releases: Array<() => void> = []
    for (let index = 0; index < 16; index++) {
      const result = gate.reserve()
      expect(result.status).toBe(200)
      if (result.status === 200) releases.push(result.release)
    }
    expect(gate.reserve().status).toBe(429)
    now = 125
    expect(gate.reserve().status).toBe(503)
    expect(gate.pendingCount).toBe(16)
    releases[0]()
    releases[0]()
    expect(gate.pendingCount).toBe(15)
    now = 250
    const next = gate.reserve()
    expect(next.status).toBe(200)
    if (next.status === 200) next.release()
    releases.forEach((release) => release())
    expect(gate.pendingCount).toBe(0)
  })

  it('refills at eight per second, caps burst, and grants nothing on a backwards clock', () => {
    let now = 1000
    const gate = new RemoteWebSocketAdmission(() => now)
    const acceptAndRelease = () => {
      const result = gate.reserve()
      expect(result.status).toBe(200)
      if (result.status === 200) result.release()
    }
    for (let index = 0; index < 16; index++) acceptAndRelease()
    now = 1124
    expect(gate.reserve().status).toBe(429)
    now = 1125
    acceptAndRelease()
    now = 100
    expect(gate.reserve().status).toBe(429)
    now = 1249
    expect(gate.reserve().status).toBe(429)
    now = 1250
    acceptAndRelease()
    now = 10000
    for (let index = 0; index < 16; index++) acceptAndRelease()
    expect(gate.reserve().status).toBe(429)
    expect(gate.pendingCount).toBe(0)
  })
})
