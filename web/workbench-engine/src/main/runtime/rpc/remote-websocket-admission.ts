const MAX_PRE_AUTH_CONNECTIONS = 16
const UPGRADE_BURST = 16
const UPGRADES_PER_SECOND = 8

type Admission = { status: 429 | 503 } | { status: 200; release: () => void }

/** A remote instance's bounded anonymous budget; forwarded addresses are not identities. */
export class RemoteWebSocketAdmission {
  private pending = 0
  private tokens = UPGRADE_BURST
  private updatedAt: number

  constructor(private readonly now: () => number = () => performance.now()) {
    this.updatedAt = now()
  }

  get pendingCount(): number {
    return this.pending
  }

  reserve(): Admission {
    const at = Math.max(this.updatedAt, this.now())
    this.tokens = Math.min(UPGRADE_BURST, this.tokens + (at - this.updatedAt) * UPGRADES_PER_SECOND / 1000)
    this.updatedAt = at
    if (this.tokens < 1) return { status: 429 }
    this.tokens -= 1
    if (this.pending >= MAX_PRE_AUTH_CONNECTIONS) return { status: 503 }
    this.pending += 1
    let released = false
    return {
      status: 200,
      release: () => {
        if (released) return
        released = true
        this.pending -= 1
      }
    }
  }
}
